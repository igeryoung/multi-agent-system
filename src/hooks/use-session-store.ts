import { startTransition, useCallback, useEffect, useMemo, useState } from "react";
import type { RunEvent, SessionRecord } from "@/shared/contracts/types";
import {
  loadActiveSessionId,
  loadSessions,
  saveActiveSessionId,
  saveSessions,
  sortSessionsByUpdatedAt,
  isTerminalPhase
} from "@/server/events/storage";
import { projectRun } from "@/server/events/projectRun";

interface UseSessionStoreOptions {
  runMap: Record<string, RunEvent[]>;
}

function createSessionId(): string {
  return `session-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function createBlankSession(index: number): SessionRecord {
  const timestamp = new Date().toISOString();
  return {
    sessionId: createSessionId(),
    title: `Session ${index}`,
    createdAt: timestamp,
    updatedAt: timestamp,
    linkedRunIds: [],
    draft: {
      taskInput: "",
      selectedRoleIds: []
    }
  };
}

function ensureAtLeastOneSession(sessions: SessionRecord[]): SessionRecord[] {
  return sessions.length > 0 ? sessions : [createBlankSession(1)];
}

function resolveActiveSessionId(sessions: SessionRecord[]): string {
  const stored = loadActiveSessionId();
  if (stored && sessions.some((session) => session.sessionId === stored)) {
    return stored;
  }

  return sortSessionsByUpdatedAt(sessions)[0]?.sessionId ?? sessions[0].sessionId;
}

function resolveLiveSessionId(
  sessions: SessionRecord[],
  runMap: Record<string, RunEvent[]>
): string | null {
  const candidates = sessions
    .filter((session) => {
      const lastRunId = session.linkedRunIds.at(-1);
      return lastRunId && runMap[lastRunId];
    })
    .map((session) => {
      const lastRunId = session.linkedRunIds.at(-1) as string;
      return { session, projection: projectRun(runMap[lastRunId] ?? []) };
    })
    .filter(({ projection }) => !isTerminalPhase(projection.phase))
    .sort((left, right) => {
      const byRun = right.projection.lastEventAt.localeCompare(left.projection.lastEventAt);
      if (byRun !== 0) return byRun;

      const bySession = right.session.updatedAt.localeCompare(left.session.updatedAt);
      if (bySession !== 0) return bySession;

      return left.session.sessionId.localeCompare(right.session.sessionId);
    });

  return candidates[0]?.session.sessionId ?? null;
}

function applyActivityUpdates(
  sessions: SessionRecord[],
  runMap: Record<string, RunEvent[]>
): SessionRecord[] {
  let changed = false;

  const nextSessions = sessions.map((session) => {
    const lastRunId = session.linkedRunIds.at(-1);
    if (!lastRunId) return session;

    const events = runMap[lastRunId];
    if (!events || events.length === 0) return session;

    const projection = projectRun(events);
    if (!projection.lastEventAt || projection.lastEventAt <= session.updatedAt) {
      return session;
    }

    changed = true;
    return {
      ...session,
      updatedAt: projection.lastEventAt
    };
  });

  return changed ? sortSessionsByUpdatedAt(nextSessions) : sessions;
}

export function useSessionStore({ runMap }: UseSessionStoreOptions) {
  const [initialState] = useState(() => {
    const sessions = ensureAtLeastOneSession(loadSessions(runMap));
    saveSessions(sessions);
    const activeSessionId = resolveActiveSessionId(sessions);
    saveActiveSessionId(activeSessionId);

    return {
      sessions,
      activeSessionId,
      liveSessionId: resolveLiveSessionId(sessions, runMap)
    };
  });

  const [sessions, setSessions] = useState<SessionRecord[]>(initialState.sessions);
  const [activeSessionId, setActiveSessionIdState] = useState(initialState.activeSessionId);
  const [liveSessionId, setLiveSessionId] = useState<string | null>(initialState.liveSessionId);

  useEffect(() => {
    setSessions((previous) => {
      const next = applyActivityUpdates(previous, runMap);
      if (next !== previous) {
        saveSessions(next);
      }
      return next;
    });
  }, [runMap]);

  useEffect(() => {
    if (liveSessionId) return;
    const nextLiveSessionId = resolveLiveSessionId(sessions, runMap);
    if (nextLiveSessionId) {
      setLiveSessionId(nextLiveSessionId);
    }
  }, [liveSessionId, runMap, sessions]);

  const orderedSessions = useMemo(() => sortSessionsByUpdatedAt(sessions), [sessions]);
  const activeSession =
    orderedSessions.find((session) => session.sessionId === activeSessionId) ??
    orderedSessions[0] ??
    null;

  const setActiveSessionId = useCallback((sessionId: string) => {
    startTransition(() => {
      setActiveSessionIdState(sessionId);
      saveActiveSessionId(sessionId);
    });
  }, []);

  const createSession = useCallback(() => {
    setSessions((previous) => {
      const nextSession = createBlankSession(previous.length + 1);
      const nextSessions = sortSessionsByUpdatedAt([nextSession, ...previous]);
      saveSessions(nextSessions);
      saveActiveSessionId(nextSession.sessionId);
      startTransition(() => {
        setActiveSessionIdState(nextSession.sessionId);
      });
      return nextSessions;
    });
  }, []);

  const renameSession = useCallback((sessionId: string, title: string) => {
    const nextTitle = title.trim();
    if (nextTitle.length === 0) return;

    setSessions((previous) => {
      const now = new Date().toISOString();
      const nextSessions = sortSessionsByUpdatedAt(
        previous.map((session) =>
          session.sessionId === sessionId
            ? { ...session, title: nextTitle, updatedAt: now }
            : session
        )
      );
      saveSessions(nextSessions);
      return nextSessions;
    });
  }, []);

  const updateSessionDraft = useCallback((
    sessionId: string,
    draft: Partial<SessionRecord["draft"]>
  ) => {
    setSessions((previous) => {
      const now = new Date().toISOString();
      const nextSessions = sortSessionsByUpdatedAt(
        previous.map((session) =>
          session.sessionId === sessionId
            ? {
                ...session,
                updatedAt: now,
                draft: {
                  taskInput: draft.taskInput ?? session.draft.taskInput,
                  selectedRoleIds: draft.selectedRoleIds ?? session.draft.selectedRoleIds
                }
              }
            : session
        )
      );
      saveSessions(nextSessions);
      return nextSessions;
    });
  }, []);

  const attachRunToSession = useCallback((
    sessionId: string,
    runId: string,
    taskInput: string,
    selectedRoleIds: string[],
    updatedAt: string
  ) => {
    setSessions((previous) => {
      const nextSessions = sortSessionsByUpdatedAt(
        previous.map((session) =>
          session.sessionId === sessionId
            ? session.linkedRunIds.includes(runId)
              ? session
              : {
                  ...session,
                  linkedRunIds: [...session.linkedRunIds, runId],
                  updatedAt,
                  draft: {
                    taskInput,
                    selectedRoleIds
                  }
                }
            : session
        )
      );
      saveSessions(nextSessions);
      return nextSessions;
    });
  }, []);

  const deleteSession = useCallback((sessionId: string, force = false) => {
    if (sessionId === liveSessionId && !force) {
      return false;
    }

    setSessions((previous) => {
      const remaining = previous.filter((session) => session.sessionId !== sessionId);
      const nextSessions = ensureAtLeastOneSession(sortSessionsByUpdatedAt(remaining));
      saveSessions(nextSessions);

      const deletingActive = activeSessionId === sessionId;
      if (deletingActive || nextSessions.every((session) => session.sessionId !== activeSessionId)) {
        const nextActiveSessionId = nextSessions[0].sessionId;
        saveActiveSessionId(nextActiveSessionId);
        startTransition(() => {
          setActiveSessionIdState(nextActiveSessionId);
        });
      }

      return nextSessions;
    });

    return true;
  }, [activeSessionId, liveSessionId]);

  const markLiveSession = useCallback((sessionId: string | null) => {
    setLiveSessionId(sessionId);
  }, []);

  return {
    sessions: orderedSessions,
    activeSessionId,
    activeSession,
    liveSessionId,
    setActiveSessionId,
    createSession,
    renameSession,
    updateSessionDraft,
    attachRunToSession,
    deleteSession,
    markLiveSession
  };
}
