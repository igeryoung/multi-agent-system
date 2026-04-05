import http from "node:http";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { spawn } from "node:child_process";

const HOST = process.env.SIGNAL_ATLAS_PLANNER_HOST || "127.0.0.1";
const PORT = Number(process.env.SIGNAL_ATLAS_PLANNER_PORT || "4317");
const POLL_MS = 250;
const TIMEOUT_MS = Number(process.env.SIGNAL_ATLAS_PLANNER_TIMEOUT_MS || "60000");
const RUNNER_PATH = path.resolve(process.cwd(), "scripts/head-planner-runner.mjs");

const server = http.createServer(async (request, response) => {
  addCorsHeaders(response);
  log("INFO", `Incoming request: ${request.method} ${request.url ?? ""}`);

  if (request.method === "OPTIONS") {
    response.writeHead(204);
    response.end();
    return;
  }

  if (request.method !== "POST" || request.url !== "/api/plan") {
    log("WARN", `Rejected unknown route: ${request.method} ${request.url ?? ""}`);
    response.writeHead(404, { "content-type": "application/json" });
    response.end(JSON.stringify({
      ok: false,
      diagnostic: "Unknown planner bridge route.",
      details: [`Received ${request.method} ${request.url ?? ""}`]
    }));
    return;
  }

  let payload;
  try {
    payload = await readJsonBody(request);
    log("INFO", "Planner bridge parsed JSON payload.");
  } catch (error) {
    log("ERROR", "Planner bridge received invalid JSON.", [error instanceof Error ? error.message : String(error)]);
    response.writeHead(400, { "content-type": "application/json" });
    response.end(JSON.stringify({
      ok: false,
      diagnostic: "Planner bridge received invalid JSON.",
      details: [error instanceof Error ? error.message : String(error)]
    }));
    return;
  }

  const validationError = validatePayload(payload);
  if (validationError) {
    log("ERROR", "Planner bridge payload validation failed.", [validationError]);
    response.writeHead(400, { "content-type": "application/json" });
    response.end(JSON.stringify({
      ok: false,
      diagnostic: validationError,
      details: []
    }));
    return;
  }

  const requestFile = path.join(
    await fs.mkdtemp(path.join(os.tmpdir(), "signal-atlas-plan-")),
    "request.json"
  );
  const responseFile = path.join(path.dirname(requestFile), "response.json");
  const progressFile = path.join(path.dirname(requestFile), "progress.ndjson");
  const sessionName = `signal-atlas-${Date.now().toString(36)}`;
  log("INFO", `Planner bridge accepted request for ${payload.roles.length} role(s).`, [
    `tmux session: ${sessionName}`
  ]);

  try {
    response.writeHead(200, {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      "x-content-type-options": "nosniff"
    });

    await ensureCommandExists("tmux");
    await ensureCommandExists("codex");
    writeStreamProgress(response, {
      message: `Planner bridge accepted request for ${payload.roles.length} role(s).`,
      details: [`tmux session: ${sessionName}`]
    });
    await fs.writeFile(requestFile, JSON.stringify(payload), "utf8");
    log("INFO", "Planner bridge wrote request payload to disk.", [requestFile]);
    writeStreamProgress(response, {
      message: "Planner bridge wrote request payload to disk.",
      details: [requestFile]
    });

    await runTmuxSession(sessionName, requestFile, responseFile, progressFile);
    log("INFO", "Planner bridge launched tmux runner.", [responseFile]);
    writeStreamProgress(response, {
      message: "Planner bridge launched tmux runner.",
      details: [responseFile]
    });
    const plannerResult = await waitForResult(responseFile, progressFile, TIMEOUT_MS, (entry) => {
      writeStreamProgress(response, entry);
    });
    log(
      plannerResult.ok ? "INFO" : "ERROR",
      `Planner bridge received runner result (ok=${String(plannerResult.ok)}).`,
      plannerResult.ok
        ? [
            plannerResult.plan?.headSummary ?? "No head summary returned.",
            `steps=${plannerResult.plan?.steps?.length ?? 0}`,
            `taskPackets=${plannerResult.plan?.taskPackets?.length ?? 0}`
          ]
        : [plannerResult.diagnostic, ...(plannerResult.details ?? [])]
    );
    writeStreamResult(response, plannerResult);
  } catch (error) {
    log("ERROR", "Planner bridge could not execute the head planner.", [
      error instanceof Error ? error.message : String(error)
    ]);
    writeStreamResult(response, {
      ok: false,
      diagnostic: "Planner bridge could not execute the head planner.",
      details: [error instanceof Error ? error.message : String(error)]
    });
  } finally {
    await cleanupSession(sessionName);
    await fs.rm(path.dirname(requestFile), { recursive: true, force: true });
  }
});

server.listen(PORT, HOST, () => {
  log("INFO", `Signal Atlas head planner bridge listening on http://${HOST}:${PORT}`);
});

function addCorsHeaders(response) {
  response.setHeader("access-control-allow-origin", "*");
  response.setHeader("access-control-allow-methods", "POST, OPTIONS");
  response.setHeader("access-control-allow-headers", "content-type");
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch (error) {
        reject(error);
      }
    });
    request.on("error", reject);
  });
}

function validatePayload(payload) {
  if (!payload || typeof payload !== "object") {
    return "Planner bridge payload must be an object.";
  }
  if (typeof payload.task !== "string" || payload.task.trim().length === 0) {
    return "Planner bridge payload must include a non-empty task.";
  }
  if (!Array.isArray(payload.roles) || payload.roles.length === 0) {
    return "Planner bridge payload must include at least one selected role.";
  }
  return null;
}

function ensureCommandExists(command) {
  return new Promise((resolve, reject) => {
    const child = spawn("which", [command], { stdio: "ignore" });
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`Required command "${command}" is not available in PATH.`));
    });
    child.on("error", reject);
  });
}

function runTmuxSession(sessionName, requestFile, responseFile, progressFile) {
  return new Promise((resolve, reject) => {
    const child = spawn("tmux", [
      "new-session",
      "-d",
      "-s",
      sessionName,
      `node ${shellQuote(RUNNER_PATH)} ${shellQuote(requestFile)} ${shellQuote(responseFile)} ${shellQuote(progressFile)}`
    ], {
      cwd: process.cwd(),
      stdio: ["ignore", "pipe", "pipe"]
    });

    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });

    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(stderr.trim() || `tmux exited with code ${code}`));
    });
    child.on("error", reject);
  });
}

async function waitForResult(responseFile, progressFile, timeoutMs, onProgress) {
  const startedAt = Date.now();
  let emittedProgressCount = 0;

  while (Date.now() - startedAt < timeoutMs) {
    const progressEntries = await readProgressEntries(progressFile);
    while (emittedProgressCount < progressEntries.length) {
      onProgress(progressEntries[emittedProgressCount]);
      emittedProgressCount += 1;
    }

    try {
      const content = await fs.readFile(responseFile, "utf8");
      return JSON.parse(content);
    } catch (error) {
      if (error && typeof error === "object" && error.code !== "ENOENT") {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, POLL_MS));
    }
  }

  throw new Error("Planner bridge timed out waiting for the head planner result.");
}

async function readProgressEntries(progressFile) {
  try {
    const content = await fs.readFile(progressFile, "utf8");
    return content
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter((entry) => entry && typeof entry.message === "string")
      .map((entry) => ({
        message: entry.message,
        details: Array.isArray(entry.details)
          ? entry.details.filter((detail) => typeof detail === "string")
          : [],
        level: entry.level === "error" ? "error" : "info"
      }));
  } catch (error) {
    if (error && typeof error === "object" && error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

async function cleanupSession(sessionName) {
  await new Promise((resolve) => {
    const child = spawn("tmux", ["kill-session", "-t", sessionName], {
      stdio: "ignore"
    });
    child.on("exit", () => resolve());
    child.on("error", () => resolve());
  });
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function writeStreamProgress(response, entry) {
  if (response.writableEnded) {
    return;
  }

  response.write(`${JSON.stringify({
    type: "progress",
    message: entry.message,
    details: entry.details ?? [],
    level: entry.level ?? "info"
  })}\n`);
}

function writeStreamResult(response, result) {
  if (response.writableEnded) {
    return;
  }

  response.end(`${JSON.stringify({
    type: "result",
    payload: result
  })}\n`);
}

function log(level, message, details = []) {
  const timestamp = new Date().toISOString();
  process.stdout.write(`[${timestamp}] [${level}] ${message}\n`);
  for (const detail of details) {
    process.stdout.write(`  - ${detail}\n`);
  }
}
