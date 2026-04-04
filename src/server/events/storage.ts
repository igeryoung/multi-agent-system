import type { RunEvent, RunPhase } from "../../shared/contracts/types";
import { projectRun } from "./projectRun";

const STORAGE_KEY = "signal-atlas:runs";

const ALLOWED_PHASES: Record<RunPhase, RunPhase[]> = {
  draft: ["draft", "planning"],
  planning: ["planning", "dispatching", "waiting_on_agent", "awaiting_approval", "completed", "failed"],
  dispatching: ["dispatching", "waiting_on_agent", "awaiting_approval", "completed", "failed"],
  waiting_on_agent: ["waiting_on_agent", "dispatching", "awaiting_approval", "completed", "failed"],
  awaiting_approval: ["awaiting_approval", "dispatching", "completed", "failed", "cancelled"],
  completed: ["completed"],
  failed: ["failed"],
  cancelled: ["cancelled"]
};

function readMap(storage: Storage = globalThis.localStorage): Record<string, RunEvent[]> {
  const raw = storage.getItem(STORAGE_KEY);
  if (!raw) {
    return {};
  }

  try {
    return JSON.parse(raw) as Record<string, RunEvent[]>;
  } catch {
    return {};
  }
}

function writeMap(map: Record<string, RunEvent[]>, storage: Storage = globalThis.localStorage): void {
  storage.setItem(STORAGE_KEY, JSON.stringify(map));
}

export function loadRunMap(storage: Storage = globalThis.localStorage): Record<string, RunEvent[]> {
  return readMap(storage);
}

export function saveRunEvents(
  runId: string,
  events: RunEvent[],
  storage: Storage = globalThis.localStorage
): void {
  const map = readMap(storage);
  map[runId] = events;
  writeMap(map, storage);
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
  const map = readMap(storage);
  const nextEvents = appendRunEvent(map[runId] ?? [], nextEvent);
  map[runId] = nextEvents;
  writeMap(map, storage);
  return nextEvents;
}
