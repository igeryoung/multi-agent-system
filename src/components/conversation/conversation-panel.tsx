import { useEffect, useRef } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { ConversationMessage } from "@/lib/adapters";
import {
  MessageBubble,
  HandoffMessage,
  SystemMessage,
  StatusMessage
} from "./message-bubble";
import { ApprovalCard } from "./approval-card";
import { TaskInput } from "./task-input";
import { PlanCard } from "./plan-card";
import { RichAgentOutput } from "./rich-agent-output";
import { MessageSquare } from "lucide-react";

interface ConversationPanelProps {
  messages: ConversationMessage[];
  task: string;
  onTaskChange: (task: string) => void;
  onStartRun: (task: string) => void | Promise<void>;
  onApprove: () => void;
  onReject: () => void;
  onCancelRun?: () => void;
  isLive: boolean;
  isActiveSessionLive?: boolean;
  approvalPending: boolean;
  hasAgents: boolean;
  taskInputDisabled?: boolean;
  helperText?: string | null;
  submitLabel?: string;
}

export function ConversationPanel({
  messages,
  task,
  onTaskChange,
  onStartRun,
  onApprove,
  onReject,
  onCancelRun,
  isLive,
  isActiveSessionLive,
  approvalPending,
  hasAgents,
  taskInputDisabled,
  helperText,
  submitLabel
}: ConversationPanelProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView?.({ behavior: "smooth" });
  }, [messages.length]);

  const pinnedApproval = approvalPending
    ? [...messages].reverse().find((m) => m.type === "approval_request") ?? null
    : null;

  return (
    <div className="flex flex-col h-full">
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-3">
          {messages.length === 0 ? (
            <EmptyState />
          ) : (
            messages.map((message) => (
              <MessageRenderer
                key={message.id}
                message={message}
                onApprove={onApprove}
                onReject={onReject}
                approvalPending={approvalPending}
              />
            ))
          )}
          <div ref={bottomRef} />
        </div>
      </ScrollArea>

      {pinnedApproval && (
        <div className="border-t border-amber-200 bg-amber-50/80 backdrop-blur-sm shadow-[0_-2px_8px_rgba(0,0,0,0.04)]">
          <ApprovalCard
            message={pinnedApproval}
            onApprove={onApprove}
            onReject={onReject}
            resolved={false}
            pinned
          />
        </div>
      )}

      <TaskInput
        task={task}
        onTaskChange={onTaskChange}
        onStartRun={onStartRun}
        onCancel={onCancelRun}
        disabled={taskInputDisabled ?? isLive}
        isLive={isLive}
        approvalPending={approvalPending}
        hasAgents={hasAgents}
        helperText={helperText}
        submitLabel={submitLabel}
      />
    </div>
  );
}

function MessageRenderer({
  message,
  onApprove,
  onReject,
  approvalPending
}: {
  message: ConversationMessage;
  onApprove: () => void;
  onReject: () => void;
  approvalPending: boolean;
}) {
  switch (message.type) {
    case "system":
    case "plan":
      return <SystemMessage message={message} />;
    case "plan_detail":
      return <PlanCard message={message} />;
    case "handoff":
      return <HandoffMessage message={message} />;
    case "status_change":
      return <StatusMessage message={message} />;
    case "approval_request":
      return (
        <ApprovalCard
          message={message}
          onApprove={onApprove}
          onReject={onReject}
          resolved={!approvalPending}
        />
      );
    case "approval_response":
      return <SystemMessage message={message} />;
    case "agent_output_rich":
      return <RichAgentOutput message={message} />;
    case "agent_output":
    default:
      return <MessageBubble message={message} />;
  }
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-12 h-12 rounded-xl bg-zinc-100 flex items-center justify-center mb-4">
        <MessageSquare className="w-6 h-6 text-zinc-400" />
      </div>
      <h3 className="text-sm font-semibold text-foreground mb-1">
        No activity yet
      </h3>
      <p className="text-xs text-muted-foreground max-w-[200px]">
        Submit a task below to start the multi-agent collaboration.
      </p>
    </div>
  );
}
