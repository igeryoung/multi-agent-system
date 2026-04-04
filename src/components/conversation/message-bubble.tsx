import type { ConversationMessage } from "@/lib/adapters";
import { cn } from "@/lib/utils";

interface MessageBubbleProps {
  message: ConversationMessage;
}

export function MessageBubble({ message }: MessageBubbleProps) {
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
        <div className="flex items-baseline gap-2 mb-0.5">
          <span className="text-sm font-semibold text-foreground">
            {message.agentLabel}
          </span>
          <span className="text-[11px] text-muted-foreground">
            {formatTime(message.timestamp)}
          </span>
        </div>
        <p className="text-sm text-zinc-700 leading-relaxed">{message.content}</p>
      </div>
    </div>
  );
}

export function HandoffMessage({ message }: MessageBubbleProps) {
  const from = String(message.metadata?.fromAgentId ?? "");
  const to = String(message.metadata?.toAgentId ?? "");

  return (
    <div className="flex items-center gap-2 py-1.5 px-3 animate-in fade-in-0 duration-200">
      <div className="flex-1 h-px bg-zinc-200" />
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground font-medium">
        <span
          className="w-2 h-2 rounded-full"
          style={{ backgroundColor: message.agentHue }}
        />
        <span>{message.content}</span>
      </div>
      <div className="flex-1 h-px bg-zinc-200" />
    </div>
  );
}

export function SystemMessage({ message }: MessageBubbleProps) {
  return (
    <div className={cn(
      "text-center py-2 animate-in fade-in-0 duration-200",
      message.type === "system" && "my-1"
    )}>
      <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground font-medium bg-zinc-50 px-3 py-1 rounded-full border border-zinc-100">
        <div className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
        {message.content}
      </span>
    </div>
  );
}

export function StatusMessage({ message }: MessageBubbleProps) {
  return (
    <div className="flex items-center gap-2 py-1 px-3 animate-in fade-in-0 duration-200">
      <div
        className="w-2 h-2 rounded-full animate-pulse"
        style={{ backgroundColor: message.agentHue }}
      />
      <span className="text-xs text-muted-foreground">
        {message.content}
      </span>
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
