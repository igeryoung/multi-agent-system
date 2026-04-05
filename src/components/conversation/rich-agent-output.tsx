import { useState } from "react";
import { ChevronRight } from "lucide-react";
import type { ConversationMessage } from "@/lib/adapters";
import { cn } from "@/lib/utils";

interface RichAgentOutputProps {
  message: ConversationMessage;
}

interface StructuredOutput {
  goal?: string;
  why?: string;
  context?: string[];
  constraints?: string[];
  doneWhen?: string[];
  next?: string;
  returnPolicy?: string;
}

function CollapsibleList({
  title,
  items
}: {
  title: string;
  items: string[];
}) {
  const [open, setOpen] = useState(false);

  if (items.length === 0) return null;

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 py-1 text-left"
      >
        <ChevronRight
          className={cn(
            "w-3 h-3 text-zinc-400 transition-transform duration-150",
            open && "rotate-90"
          )}
        />
        <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
          {title}
        </span>
        <span className="text-[10px] text-zinc-300">{items.length}</span>
      </button>
      {open && (
        <ul className="pl-5 space-y-0.5 pb-1">
          {items.map((item, i) => (
            <li key={i} className="text-xs text-zinc-600 flex gap-1.5">
              <span className="text-zinc-300 shrink-0">-</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      )}
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

export function RichAgentOutput({ message }: RichAgentOutputProps) {
  const structured = (message.metadata?.structuredOutput ?? {}) as StructuredOutput;

  return (
    <div className="flex gap-3 animate-in fade-in-0 slide-in-from-bottom-2 duration-300">
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

        <div className="border border-zinc-100 rounded-lg bg-white p-4 space-y-2.5">
          {structured.goal && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Goal</p>
              <p className="text-sm text-zinc-700">{structured.goal}</p>
            </div>
          )}

          {structured.why && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Why</p>
              <p className="text-sm text-zinc-700">{structured.why}</p>
            </div>
          )}

          <CollapsibleList title="Context" items={structured.context ?? []} />
          <CollapsibleList title="Constraints" items={structured.constraints ?? []} />
          <CollapsibleList title="Done When" items={structured.doneWhen ?? []} />

          <div className="flex items-center gap-3 pt-1 border-t border-zinc-50">
            {structured.next && (
              <span className="text-xs text-zinc-500">
                Next: {structured.next}
              </span>
            )}
            {structured.returnPolicy && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-500">
                {structured.returnPolicy}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
