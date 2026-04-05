import { useState } from "react";
import { ChevronRight } from "lucide-react";
import type { ConversationMessage } from "@/lib/adapters";
import type { StepDefinition, TaskPacket, WorkflowEdge } from "@/shared/contracts/types";
import { cn } from "@/lib/utils";

interface PlanCardProps {
  message: ConversationMessage;
}

function CollapsibleSection({
  title,
  count,
  defaultOpen = false,
  children
}: {
  title: string;
  count?: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="border-t border-zinc-100">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 w-full py-2 text-left"
      >
        <ChevronRight
          className={cn(
            "w-3.5 h-3.5 text-zinc-400 transition-transform duration-150",
            open && "rotate-90"
          )}
        />
        <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
          {title}
        </span>
        {count !== undefined && (
          <span className="text-[10px] text-zinc-300">{count}</span>
        )}
      </button>
      {open && <div className="pb-3 pl-5">{children}</div>}
    </div>
  );
}

function formatTime(timestamp: string): string {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
}

export function PlanCard({ message }: PlanCardProps) {
  const meta = message.metadata ?? {};
  const steps = (meta.steps as StepDefinition[]) ?? [];
  const taskPackets = (meta.taskPackets as TaskPacket[]) ?? [];
  const workflowEdges = (meta.workflowEdges as WorkflowEdge[]) ?? [];
  const headSummary = meta.headSummary as string | undefined;

  return (
    <div className="animate-in fade-in-0 slide-in-from-bottom-2 duration-300">
      <div className="flex gap-3">
        <div
          className="w-7 h-7 rounded-full shrink-0 flex items-center justify-center mt-0.5"
          style={{ backgroundColor: `${message.agentHue}18` }}
        >
          <div
            className="w-3 h-3 rounded-full"
            style={{ backgroundColor: message.agentHue }}
          />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 mb-1">
            <span className="text-sm font-semibold text-foreground">
              {message.agentLabel}
            </span>
            <span className="text-[11px] text-muted-foreground">
              {formatTime(message.timestamp)}
            </span>
          </div>

          <div className="border border-zinc-200 rounded-lg bg-white overflow-hidden">
            <div className="px-4 py-3">
              <p className="text-sm text-zinc-700 leading-relaxed">
                {message.content}
              </p>
              {headSummary && headSummary !== message.content && (
                <p className="text-xs text-zinc-500 mt-1">{headSummary}</p>
              )}
            </div>

            {steps.length > 0 && (
              <CollapsibleSection title="Steps" count={steps.length} defaultOpen>
                <ol className="space-y-1.5">
                  {steps.map((step, i) => (
                    <li key={step.id} className="flex gap-2 text-sm">
                      <span className="text-zinc-400 shrink-0 w-5 text-right">{i + 1}.</span>
                      <div className="min-w-0">
                        <span className="font-medium text-zinc-800">{step.title}</span>
                        {step.summary !== step.title && (
                          <p className="text-xs text-zinc-500 mt-0.5">{step.summary}</p>
                        )}
                      </div>
                    </li>
                  ))}
                </ol>
              </CollapsibleSection>
            )}

            {taskPackets.length > 0 && (
              <CollapsibleSection title="Task Assignments" count={taskPackets.length}>
                <div className="space-y-3">
                  {taskPackets.map((packet) => (
                    <div key={packet.id} className="border border-zinc-100 rounded-md p-3 space-y-2">
                      <p className="text-xs font-semibold text-zinc-700">
                        {packet.agentId}
                      </p>
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Goal</p>
                        <p className="text-sm text-zinc-700">{packet.goal}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Why</p>
                        <p className="text-sm text-zinc-700">{packet.why}</p>
                      </div>
                      {packet.context.length > 0 && (
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Context</p>
                          <ul className="mt-0.5 space-y-0.5">
                            {packet.context.map((item, j) => (
                              <li key={j} className="text-xs text-zinc-600 flex gap-1.5">
                                <span className="text-zinc-300 shrink-0">-</span>
                                <span>{item}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {packet.doneWhen.length > 0 && (
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Done When</p>
                          <ul className="mt-0.5 space-y-0.5">
                            {packet.doneWhen.map((item, j) => (
                              <li key={j} className="text-xs text-zinc-600 flex gap-1.5">
                                <span className="text-zinc-300 shrink-0">-</span>
                                <span>{item}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      <div className="flex items-center gap-3 pt-1">
                        <span className="text-xs text-zinc-500">
                          Next: {packet.next}
                        </span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-500">
                          {packet.returnPolicy}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </CollapsibleSection>
            )}

            {workflowEdges.length > 0 && (
              <CollapsibleSection title="Workflow" count={workflowEdges.length}>
                <div className="space-y-1">
                  {workflowEdges.map((edge) => (
                    <div key={edge.id} className="flex items-center gap-2 text-xs text-zinc-600">
                      <span className="text-zinc-400">-</span>
                      <span>{edge.note}</span>
                    </div>
                  ))}
                </div>
              </CollapsibleSection>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
