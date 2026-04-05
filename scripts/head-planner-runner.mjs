import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

const [requestFile, responseFile, progressFile] = process.argv.slice(2);

if (!requestFile || !responseFile || !progressFile) {
  process.exitCode = 1;
  throw new Error("Usage: node scripts/head-planner-runner.mjs <request-file> <response-file> <progress-file>");
}

const request = JSON.parse(await fs.readFile(requestFile, "utf8"));
const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "signal-atlas-runner-"));
const schemaFile = path.join(tempDir, "schema.json");
const outputFile = path.join(tempDir, "output.json");

try {
  await appendProgress(progressFile, {
    message: "Atlas is preparing the Codex head planner request."
  });
  await fs.writeFile(schemaFile, JSON.stringify(createOutputSchema()), "utf8");

  const prompt = buildPrompt(request);
  await appendProgress(progressFile, {
    message: "Atlas is invoking Codex to generate the head plan."
  });
  const result = await runCodexExec({
    cwd: typeof request.cwd === "string" && request.cwd.length > 0
      ? request.cwd
      : process.cwd(),
    prompt,
    schemaFile,
    outputFile,
    onProgress: (entry) => {
      void appendProgress(progressFile, entry);
    }
  });
  await appendProgress(progressFile, {
    message: "Codex returned structured output. Atlas is validating the generated plan."
  });

  await fs.writeFile(responseFile, JSON.stringify({
    ok: true,
    plan: normalizePlannerOutput(result, request)
  }), "utf8");
} catch (error) {
  await appendProgress(progressFile, {
    message: "Atlas failed to generate a head plan through Codex.",
    details: [error instanceof Error ? error.message : String(error)],
    level: "error"
  });
  await fs.writeFile(responseFile, JSON.stringify({
    ok: false,
    diagnostic: "Atlas failed to generate a head plan through Codex.",
    details: [error instanceof Error ? error.message : String(error)]
  }), "utf8");
  process.exitCode = 1;
} finally {
  await fs.rm(tempDir, { recursive: true, force: true });
}

function createOutputSchema() {
  return {
    type: "object",
    additionalProperties: false,
    required: ["summary", "headSummary", "workflowSummary", "lanes"],
    properties: {
      summary: { type: "string" },
      headSummary: { type: "string" },
      workflowSummary: { type: "string" },
      lanes: {
        type: "array",
        minItems: 1,
        items: {
          type: "object",
          additionalProperties: false,
          required: [
            "agentId",
            "title",
            "why",
            "goal",
            "context",
            "constraints",
            "doneWhen",
            "next",
            "inputSource",
            "returnPolicy"
          ],
          properties: {
            agentId: { type: "string" },
            title: { type: "string" },
            why: { type: "string" },
            goal: { type: "string" },
            context: { type: "array", items: { type: "string" } },
            constraints: { type: "array", items: { type: "string" } },
            doneWhen: { type: "array", items: { type: "string" } },
            next: { type: "string" },
            inputSource: {
              type: "string",
              enum: ["user_task", "environment", "prior_agent_output", "mixed"]
            },
            returnPolicy: {
              type: "string",
              enum: ["final_only", "blocker_only", "checkpoint"]
            }
          }
        }
      }
    }
  };
}

function buildPrompt(request) {
  const roleList = request.roles
    .map((role, index) => `${index + 1}. ${role.label} (${role.id}) - ${role.responsibility}`)
    .join("\n");

  return [
    "You are Atlas Head Agent planning a multi-agent workflow.",
    "Generate a structured plan for the selected agents only.",
    "Do not create new agents.",
    "Only the head node talks to the user.",
    "Direct agent-to-agent edges are allowed internally, but role agents are still PoC task viewers in this milestone.",
    "Return JSON only matching the provided schema.",
    "",
    `User task: ${request.task}`,
    "Selected agents:",
    roleList
  ].join("\n");
}

function runCodexExec({ cwd, prompt, schemaFile, outputFile, onProgress = () => {} }) {
  return new Promise((resolve, reject) => {
    const child = spawn("codex", [
      "exec",
      "-C",
      cwd,
      "--skip-git-repo-check",
      "--output-schema",
      schemaFile,
      "-o",
      outputFile,
      prompt
    ], {
      stdio: ["ignore", "pipe", "pipe"]
    });

    let stderr = "";
    pipeProgressLines(child.stdout, "stdout", onProgress);
    pipeProgressLines(child.stderr, "stderr", (entry) => {
      stderr += `${entry.message}\n`;
      onProgress({
        ...entry,
        message: entry.message
      });
    });

    child.on("exit", async (code) => {
      if (code !== 0) {
        reject(new Error(stderr.trim() || `codex exec exited with code ${code}`));
        return;
      }

      try {
        const content = await fs.readFile(outputFile, "utf8");
        resolve(JSON.parse(content));
      } catch (error) {
        reject(error);
      }
    });

    child.on("error", reject);
  });
}

async function appendProgress(progressFile, entry) {
  await fs.appendFile(progressFile, `${JSON.stringify({
    message: entry.message,
    details: entry.details ?? [],
    level: entry.level ?? "info"
  })}\n`, "utf8");
}

function pipeProgressLines(stream, source, onProgress) {
  if (!stream) {
    return;
  }

  let buffer = "";
  stream.on("data", (chunk) => {
    buffer += String(chunk);
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const sanitized = sanitizeProgressLine(line);
      if (!sanitized) {
        continue;
      }
      onProgress?.({
        message: `${source}: ${sanitized}`
      });
    }
  });
  stream.on("end", () => {
    const sanitized = sanitizeProgressLine(buffer);
    if (!sanitized) {
      return;
    }
    onProgress?.({
      message: `${source}: ${sanitized}`
    });
  });
}

function sanitizeProgressLine(value) {
  return String(value)
    .replace(/\u001b\[[0-9;]*m/g, "")
    .replace(/\r/g, "")
    .trim();
}

function normalizePlannerOutput(result, request) {
  const lanes = Array.isArray(result?.lanes) ? result.lanes : [];
  const rolesById = new Map(
    request.roles.map((role) => [role.id, role])
  );
  const selectedRoleIds = new Set(request.roles.map((role) => role.id));
  const laneAgentIds = lanes.map((lane) => lane?.agentId);

  if (lanes.length !== request.roles.length) {
    throw new Error("Head planner returned the wrong number of lanes for the selected agents.");
  }

  if (new Set(laneAgentIds).size !== laneAgentIds.length) {
    throw new Error("Head planner returned duplicate agent lanes.");
  }

  for (const agentId of laneAgentIds) {
    if (!selectedRoleIds.has(agentId)) {
      throw new Error(`Head planner returned an unselected agent id: ${agentId}`);
    }
  }

  const taskPackets = lanes.map((lane, index) => ({
    id: `packet-${lane.agentId}`,
    agentId: lane.agentId,
    why: lane.why,
    goal: lane.goal,
    context: lane.context,
    constraints: lane.constraints,
    doneWhen: lane.doneWhen,
    next: lane.next,
    inputSource: lane.inputSource,
    returnPolicy: lane.returnPolicy
  }));

  const steps = taskPackets.map((packet, index) => ({
    id: `step-${index + 1}`,
    ownerId: packet.agentId,
    title: lanes[index]?.title || `${rolesById.get(packet.agentId)?.label ?? packet.agentId}: ${packet.goal}`,
    summary: packet.goal,
    taskPacketId: packet.id,
    returnPolicy: packet.returnPolicy
  }));

  const workflowEdges = taskPackets.map((packet, index) => {
    const previousPacket = taskPackets[index - 1];
    return {
      id: `edge-${index + 1}`,
      fromAgentId: previousPacket?.agentId ?? "atlas-head",
      toAgentId: packet.agentId,
      kind: previousPacket ? "peer_handoff" : "head_handoff",
      note: previousPacket
        ? `${rolesById.get(previousPacket.agentId)?.label ?? previousPacket.agentId} hands work to ${rolesById.get(packet.agentId)?.label ?? packet.agentId}.`
        : `Atlas Head Agent assigns the first lane to ${rolesById.get(packet.agentId)?.label ?? packet.agentId}.`,
      requiresIntermediateReturn: packet.returnPolicy === "checkpoint"
    };
  });

  return {
    plannerMode: "bridge",
    summary: result.summary,
    headSummary: result.headSummary,
    workflowSummary: result.workflowSummary,
    steps,
    taskPackets,
    workflowEdges,
    diagnostics: []
  };
}
