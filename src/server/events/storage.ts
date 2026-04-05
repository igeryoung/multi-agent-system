import type {
  RunEvent,
  RunPhase,
  SessionDraft,
  SessionRecord
} from "../../shared/contracts/types";
import { projectRun } from "./projectRun";
import { sanitizeRoleIds } from "../../shared/contracts/types";

const RUNS_KEY = "signal-atlas:runs";
const SESSIONS_KEY = "signal-atlas:sessions";
const ACTIVE_SESSION_KEY = "signal-atlas:active-session";
const LIVE_RUNTIME_KEY = "signal-atlas:live-runtime";

interface LiveRuntimeSnapshot {
  runId: string | null;
  queue: RunEvent[];
}

const ALLOWED_PHASES: Record<RunPhase, RunPhase[]> = {
  draft: ["draft", "planning", "cancelled"],
  planning: ["planning", "dispatching", "waiting_on_agent", "awaiting_approval", "completed", "failed", "cancelled"],
  dispatching: ["dispatching", "waiting_on_agent", "awaiting_approval", "completed", "failed", "cancelled"],
  waiting_on_agent: ["waiting_on_agent", "dispatching", "awaiting_approval", "completed", "failed", "cancelled"],
  awaiting_approval: ["awaiting_approval", "dispatching", "completed", "failed", "cancelled"],
  completed: ["completed"],
  failed: ["failed"],
  cancelled: ["cancelled"]
};

const TERMINAL_PHASES = new Set<RunPhase>(["completed", "failed", "cancelled"]);

function readJson<T>(key: string, fallback: T, storage: Storage): T {
  const raw = storage.getItem(key);
  if (!raw) return fallback;

  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown, storage: Storage): void {
  storage.setItem(key, JSON.stringify(value));
}

function ensureDraft(value: Partial<SessionDraft> | undefined): SessionDraft {
  return {
    taskInput: typeof value?.taskInput === "string" ? value.taskInput : "",
    selectedRoleIds: Array.isArray(value?.selectedRoleIds)
      ? sanitizeRoleIds(value.selectedRoleIds)
      : []
  };
}

function normalizeSessions(value: unknown): SessionRecord[] {
  if (!Array.isArray(value)) return [];

  return value
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
    .map((item) => {
      // Migrate legacy linkedRunId (string | null) to linkedRunIds (string[])
      let linkedRunIds: string[] = [];
      if (Array.isArray(item.linkedRunIds)) {
        linkedRunIds = item.linkedRunIds.filter((id): id is string => typeof id === "string" && id.length > 0);
      } else if (item.linkedRunId && typeof item.linkedRunId === "string") {
        linkedRunIds = [item.linkedRunId];
      }
      return {
        sessionId: String(item.sessionId ?? ""),
        title: String(item.title ?? "Untitled Session"),
        createdAt: String(item.createdAt ?? ""),
        updatedAt: String(item.updatedAt ?? ""),
        linkedRunIds,
        draft: ensureDraft(item.draft as Partial<SessionDraft> | undefined)
      };
    })
    .filter((session) => session.sessionId.length > 0 && session.createdAt.length > 0);
}

function buildBootstrappedSessions(runMap: Record<string, RunEvent[]>): SessionRecord[] {
  return Object.entries(runMap)
    .map(([runId, events], index) => {
      const projection = projectRun(events);
      const timestamp = projection.lastEventAt || new Date().toISOString();

      return {
        sessionId: `session-legacy-${index + 1}-${runId}`,
        title: projection.title,
        createdAt: timestamp,
        updatedAt: timestamp,
        linkedRunIds: [runId],
        draft: { taskInput: "", selectedRoleIds: [] }
      } satisfies SessionRecord;
    })
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.sessionId.localeCompare(b.sessionId));
}

export function sortSessionsByUpdatedAt(sessions: SessionRecord[]): SessionRecord[] {
  return [...sessions].sort(
    (a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.sessionId.localeCompare(b.sessionId)
  );
}

function readRunMap(storage: Storage = globalThis.localStorage): Record<string, RunEvent[]> {
  return readJson<Record<string, RunEvent[]>>(RUNS_KEY, {}, storage);
}

function writeRunMap(map: Record<string, RunEvent[]>, storage: Storage = globalThis.localStorage): void {
  writeJson(RUNS_KEY, map, storage);
}

export function loadRunMap(storage: Storage = globalThis.localStorage): Record<string, RunEvent[]> {
  return readRunMap(storage);
}

export function saveRunEvents(
  runId: string,
  events: RunEvent[],
  storage: Storage = globalThis.localStorage
): void {
  const map = readRunMap(storage);
  map[runId] = events;
  writeRunMap(map, storage);
}

export function loadSessions(
  runMap: Record<string, RunEvent[]> = loadRunMap(),
  storage: Storage = globalThis.localStorage
): SessionRecord[] {
  const sessions = sortSessionsByUpdatedAt(
    normalizeSessions(readJson<unknown>(SESSIONS_KEY, [], storage))
  );

  if (sessions.length > 0) {
    return sessions;
  }

  if (Object.keys(runMap).length === 0) {
    return [];
  }

  const bootstrapped = buildBootstrappedSessions(runMap);
  saveSessions(bootstrapped, storage);
  const nextActive = bootstrapped[0]?.sessionId ?? null;
  saveActiveSessionId(nextActive, storage);
  return bootstrapped;
}

export function saveSessions(
  sessions: SessionRecord[],
  storage: Storage = globalThis.localStorage
): void {
  writeJson(SESSIONS_KEY, sessions, storage);
}

export function loadActiveSessionId(
  storage: Storage = globalThis.localStorage
): string | null {
  const raw = storage.getItem(ACTIVE_SESSION_KEY);
  return raw && raw.length > 0 ? raw : null;
}

export function saveActiveSessionId(
  sessionId: string | null,
  storage: Storage = globalThis.localStorage
): void {
  if (!sessionId) {
    storage.removeItem(ACTIVE_SESSION_KEY);
    return;
  }

  storage.setItem(ACTIVE_SESSION_KEY, sessionId);
}

export function loadLiveRuntimeSnapshot(
  storage: Storage = globalThis.localStorage
): LiveRuntimeSnapshot {
  const snapshot = readJson<LiveRuntimeSnapshot>(LIVE_RUNTIME_KEY, {
    runId: null,
    queue: []
  }, storage);

  return {
    runId: snapshot.runId ?? null,
    queue: Array.isArray(snapshot.queue) ? snapshot.queue : []
  };
}

export function saveLiveRuntimeSnapshot(
  snapshot: LiveRuntimeSnapshot,
  storage: Storage = globalThis.localStorage
): void {
  writeJson(LIVE_RUNTIME_KEY, snapshot, storage);
}

export function clearLiveRuntimeSnapshot(
  storage: Storage = globalThis.localStorage
): void {
  storage.removeItem(LIVE_RUNTIME_KEY);
}

export function isTerminalPhase(phase: RunPhase): boolean {
  return TERMINAL_PHASES.has(phase);
}

export function appendRunEvent(existingEvents: RunEvent[], nextEvent: RunEvent): RunEvent[] {
  if (existingEvents.length === 0 && nextEvent.sequence !== 1) {
    throw new Error("Runs must start at sequence 1.");
  }

  if (existingEvents.length > 0) {
    const previous = existingEvents[existingEvents.length - 1];
    const currentPhase = projectRun(existingEvents).phase;

    if (nextEvent.sequence !== previous.sequence + 1) {
      throw new Error("Event sequence must be strictly monotonic.");
    }

    if (!ALLOWED_PHASES[currentPhase].includes(nextEvent.phase)) {
      throw new Error(`Illegal run phase transition: ${currentPhase} -> ${nextEvent.phase}`);
    }

    if (nextEvent.eventType === "approval_recorded" && currentPhase !== "awaiting_approval") {
      throw new Error("Approval decisions are only valid while awaiting approval.");
    }
  }

  return [...existingEvents, nextEvent];
}

export function appendAndPersistRunEvent(
  runId: string,
  nextEvent: RunEvent,
  storage: Storage = globalThis.localStorage
): RunEvent[] {
  const map = readRunMap(storage);
  const nextEvents = appendRunEvent(map[runId] ?? [], nextEvent);
  map[runId] = nextEvents;
  writeRunMap(map, storage);
  return nextEvents;
}
