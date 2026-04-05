import { useEffect, useState } from "react";
import type { AgentHistoryItem } from "@/lib/adapters";
import type { AgentProjection, RoleDefinition } from "@/shared/contracts/types";
import { cn } from "@/lib/utils";
import { X, Trash2, ChevronRight } from "lucide-react";

const statusColors: Record<string, string> = {
  idle: "bg-zinc-100 text-zinc-500",
  active: "bg-indigo-100 text-indigo-700",
  waiting: "bg-amber-50 text-amber-600",
  blocked: "bg-red-100 text-red-600",
  completed: "bg-emerald-100 text-emerald-700"
};

interface AgentDrawerProps {
  agent: AgentProjection | RoleDefinition | null;
  history: AgentHistoryItem[];
  isLive: boolean;
  isDraft: boolean;
  onClose: () => void;
  onRemove?: () => void;
}

export function AgentDrawer({
  agent,
  history,
  isLive,
  isDraft,
  onClose,
  onRemove
}: AgentDrawerProps) {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  if (!agent) return null;

  const label = agent.label;
  const hue = agent.hue;
  const status = "status" in agent ? agent.status : "idle";
  const responsibility = agent.responsibility;
  const assignedTaskPacket =
    "assignedTaskPacket" in agent ? agent.assignedTaskPacket : null;

  return (
    <div className="absolute inset-y-0 right-0 z-10 w-[320px] max-w-full bg-white border-l border-zinc-200 shadow-lg flex flex-col animate-in slide-in-from-right duration-200">
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-100">
        <div className="flex items-center gap-2 min-w-0">
          <div
            className="w-3 h-3 rounded-full shrink-0"
            style={{ backgroundColor: hue }}
          />
          <h2 className="text-sm font-semibold text-foreground truncate">{label}</h2>
          <span
            className={cn(
              "text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0",
              statusColors[status] ?? statusColors.idle
            )}
          >
            {status}
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded-md hover:bg-zinc-100 transition-colors"
        >
          <X className="w-4 h-4 text-muted-foreground" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        <p className="text-xs text-muted-foreground">{responsibility}</p>

        {assignedTaskPacket && (
          <TaskPacketCard packet={assignedTaskPacket} />
        )}

        {history.length > 0 && (
          <div className="space-y-1">
            <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
              History
            </h3>
            {history.map((item) => (
              <HistoryItem key={item.id} item={item} />
            ))}
          </div>
        )}

        {history.length === 0 && !isDraft && (
          <p className="text-xs text-muted-foreground italic">No activity yet.</p>
        )}
      </div>

      {onRemove && (
        <div className="px-4 py-3 border-t border-zinc-100">
          <button
            type="button"
            onClick={onRemove}
            disabled={isLive}
            className={cn(
              "flex items-center gap-2 text-xs font-medium text-red-600 hover:text-red-700 transition-colors",
              isLive && "opacity-40 cursor-not-allowed"
            )}
          >
            <Trash2 className="w-3.5 h-3.5" />
            Remove Agent
          </button>
        </div>
      )}
    </div>
  );
}

function TaskPacketCard({
  packet
}: {
  packet: NonNullable<AgentProjection["assignedTaskPacket"]>;
}) {
  return (
    <div className="space-y-2 rounded-lg border border-zinc-200 bg-zinc-50/70 p-3">
      <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
        Assigned Task
      </h3>
      <TaskPacketRow label="Why" value={packet.why} />
      <TaskPacketRow label="Goal" value={packet.goal} />
      <TaskPacketList label="Context" values={packet.context} />
      <TaskPacketList label="Constraints" values={packet.constraints} />
      <TaskPacketList label="Done When" values={packet.doneWhen} />
      <TaskPacketRow label="Next" value={packet.next} />
      <TaskPacketRow label="Input Source" value={packet.inputSource} />
      <TaskPacketRow label="Return Policy" value={packet.returnPolicy} />
    </div>
  );
}

function TaskPacketRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className="text-xs text-foreground whitespace-pre-wrap">{value}</p>
    </div>
  );
}

function TaskPacketList({ label, values }: { label: string; values: string[] }) {
  return (
    <div className="space-y-1">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <ul className="space-y-1">
        {values.map((value) => (
          <li key={`${label}-${value}`} className="text-xs text-foreground">
            {value}
          </li>
        ))}
      </ul>
    </div>
  );
}

function HistoryItem({ item }: { item: AgentHistoryItem }) {
  const [expanded, setExpanded] = useState(false);

  const typeLabel =
    item.type === "handoff"
      ? "Handoff"
      : item.type === "output"
        ? "Output"
        : "Status";

  return (
    <div className="rounded-lg border border-zinc-100 overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-zinc-50/50 transition-colors"
      >
        <ChevronRight
          className={cn(
            "w-3 h-3 text-muted-foreground shrink-0 transition-transform",
            expanded && "rotate-90"
          )}
        />
        <span className="text-[10px] font-semibold text-muted-foreground uppercase shrink-0">
          {typeLabel}
        </span>
        <span className="text-xs text-foreground truncate">{item.summary}</span>
      </button>
      {expanded && (
        <div className="px-3 pb-2 text-xs text-muted-foreground whitespace-pre-wrap border-t border-zinc-50">
          {item.content}
        </div>
      )}
    </div>
  );
}
