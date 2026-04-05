import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { PanelLeftClose, PanelLeftOpen, PenSquare, Plus, Trash2 } from "lucide-react";

export interface SessionSidebarItem {
  sessionId: string;
  title: string;
  updatedAt: string;
  isActive: boolean;
  isLive: boolean;
  hasPendingApproval: boolean;
  isRunBacked: boolean;
}

interface SessionSidebarProps {
  sessions: SessionSidebarItem[];
  onCreateSession: () => void;
  onSelectSession: (sessionId: string) => void;
  onRenameSession: (sessionId: string, title: string) => void;
  onDeleteSession: (sessionId: string) => boolean;
  onCollapse: () => void;
}

interface SessionSidebarToggleProps {
  onExpand: () => void;
}

export function SessionSidebar({
  sessions,
  onCreateSession,
  onSelectSession,
  onRenameSession,
  onDeleteSession,
  onCollapse
}: SessionSidebarProps) {
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("");

  useEffect(() => {
    if (!editingSessionId) return;
    const session = sessions.find((item) => item.sessionId === editingSessionId);
    if (!session) {
      setEditingSessionId(null);
      setDraftTitle("");
      return;
    }

    setDraftTitle(session.title);
  }, [editingSessionId, sessions]);

  return (
    <aside className="pointer-events-auto h-full w-full border-r border-zinc-200 bg-white/95 shadow-sm">
      <div className="flex h-full flex-col">
        <div className="border-b border-zinc-100 px-4 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-500">
                Sessions
              </p>
              <h2 className="text-sm font-semibold text-zinc-900">
                Isolated task workspaces
              </h2>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Collapse sessions sidebar"
              onClick={onCollapse}
            >
              <PanelLeftClose className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="border-b border-zinc-100 px-4 py-4">
          <Button className="w-full" onClick={onCreateSession}>
            <Plus className="mr-2 h-4 w-4" />
            Create Session
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-3">
          <div className="space-y-2">
            {sessions.map((session) => {
              const isEditing = editingSessionId === session.sessionId;

              return (
                <div
                  key={session.sessionId}
                  className={cn(
                    "rounded-xl border px-3 py-3 transition-colors",
                    session.isActive
                      ? "border-indigo-300 bg-indigo-50/70"
                      : "border-zinc-200 bg-white hover:border-zinc-300 hover:bg-zinc-50"
                  )}
                >
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <button
                      type="button"
                      className="min-w-0 flex-1 text-left"
                      onClick={() => onSelectSession(session.sessionId)}
                    >
                      {isEditing ? (
                        <Input
                          aria-label="Session title"
                          value={draftTitle}
                          onChange={(event) => setDraftTitle(event.target.value)}
                          onBlur={() => {
                            onRenameSession(session.sessionId, draftTitle);
                            setEditingSessionId(null);
                          }}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              onRenameSession(session.sessionId, draftTitle);
                              setEditingSessionId(null);
                            }

                            if (event.key === "Escape") {
                              setEditingSessionId(null);
                            }
                          }}
                          autoFocus
                          className="h-8 text-sm"
                        />
                      ) : (
                        <p className="truncate text-sm font-semibold text-zinc-900">
                          {session.title}
                        </p>
                      )}
                      <p className="mt-1 text-[11px] text-zinc-500">
                        {new Date(session.updatedAt).toLocaleString()}
                      </p>
                    </button>

                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        aria-label={`Rename ${session.title}`}
                        onClick={() => {
                          setEditingSessionId(session.sessionId);
                          setDraftTitle(session.title);
                        }}
                      >
                        <PenSquare className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        aria-label={`Delete ${session.title}`}
                        onClick={() => {
                          if (window.confirm(`Delete ${session.title}?`)) {
                            onDeleteSession(session.sessionId);
                          }
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>

                  <button
                    type="button"
                    className="w-full text-left"
                    onClick={() => onSelectSession(session.sessionId)}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      {session.isRunBacked ? (
                        <Badge variant="secondary" className="bg-zinc-100 text-zinc-700">
                          Run-backed
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="bg-zinc-100 text-zinc-700">
                          Draft
                        </Badge>
                      )}
                      {session.isLive && (
                        <Badge variant="secondary" className="bg-indigo-100 text-indigo-700">
                          Live
                        </Badge>
                      )}
                      {session.hasPendingApproval && (
                        <Badge variant="secondary" className="bg-amber-100 text-amber-700">
                          Approval Pending
                        </Badge>
                      )}
                    </div>
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </aside>
  );
}

export function SessionSidebarToggle({ onExpand }: SessionSidebarToggleProps) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="group pointer-events-auto h-9 overflow-hidden border-zinc-200 bg-white/95 px-3 shadow-sm transition-[width,padding] duration-150 hover:bg-white"
      aria-label="Expand sessions sidebar"
      onClick={onExpand}
    >
      <PanelLeftOpen className="h-4 w-4 shrink-0" />
      <span
        className="max-w-0 overflow-hidden whitespace-nowrap text-xs opacity-0 transition-all duration-150 group-hover:ml-2 group-hover:max-w-24 group-hover:opacity-100"
      >
        Sessions
      </span>
    </Button>
  );
}
