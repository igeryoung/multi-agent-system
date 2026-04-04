import { memo } from "react";
import { Handle, Position, type NodeProps, type Node } from "@xyflow/react";
import type { AgentNodeData } from "@/lib/adapters";
import { cn } from "@/lib/utils";

const statusColors: Record<string, string> = {
  idle: "bg-zinc-100 text-zinc-500",
  active: "bg-indigo-100 text-indigo-700",
  waiting: "bg-amber-50 text-amber-600",
  blocked: "bg-red-100 text-red-600",
  completed: "bg-emerald-100 text-emerald-700"
};

export const AgentNode = memo(function AgentNode({ data }: NodeProps<Node<AgentNodeData>>) {
  const { label, status, hue, currentTask, isActive, kind } = data;

  return (
    <div
      className={cn(
        "rounded-xl bg-white px-3 py-2 shadow-sm transition-all duration-300 w-[190px] cursor-pointer",
        isActive && "ring-2 ring-indigo-400 shadow-md"
      )}
      style={{
        borderWidth: kind === "head" ? 2 : 1,
        borderStyle: "solid",
        borderColor: isActive ? undefined : `${hue}40`
      }}
    >
      <Handle type="target" position={Position.Top} className="!bg-zinc-300 !w-2 !h-2 !border-0" />

      <div className="flex items-center justify-between gap-2 mb-1">
        <div className="flex items-center gap-1.5 min-w-0">
          <div
            className={cn("w-2.5 h-2.5 rounded-full shrink-0", isActive && "animate-pulse")}
            style={{ backgroundColor: hue }}
          />
          <h3 className="text-sm font-semibold text-foreground leading-tight truncate">
            {label}
          </h3>
        </div>
        <span
          className={cn(
            "text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0",
            statusColors[status] ?? statusColors.idle
          )}
        >
          {status}
        </span>
      </div>

      <p className="text-xs text-muted-foreground leading-snug truncate">
        {currentTask}
      </p>

      <Handle type="source" position={Position.Bottom} className="!bg-zinc-300 !w-2 !h-2 !border-0" />
    </div>
  );
});
