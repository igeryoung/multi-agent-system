import type { ConversationMessage } from "@/lib/adapters";
import { Button } from "@/components/ui/button";
import { ShieldAlert } from "lucide-react";

interface ApprovalCardProps {
  message: ConversationMessage;
  onApprove: () => void;
  onReject: () => void;
  resolved?: boolean;
  pinned?: boolean;
}

export function ApprovalCard({
  message,
  onApprove,
  onReject,
  resolved,
  pinned
}: ApprovalCardProps) {
  const actionLabel = String(message.metadata?.actionLabel ?? message.content);
  const impact = String(message.metadata?.impact ?? "");
  const reason = String(message.metadata?.reason ?? "");

  return (
    <div className={pinned
      ? "p-4"
      : "mx-2 my-2 rounded-xl border border-amber-200 bg-amber-50/60 p-4 animate-in fade-in-0 slide-in-from-bottom-2 duration-300"
    }>
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center shrink-0 mt-0.5">
          <ShieldAlert className="w-4 h-4 text-amber-600" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-semibold text-amber-700 uppercase tracking-wider">
              Approval Required
            </span>
          </div>
          <h4 className="text-sm font-semibold text-foreground mb-1">
            {actionLabel}
          </h4>
          {reason && (
            <p className="text-xs text-zinc-600 mb-2">{reason}</p>
          )}
          {impact && (
            <div className="text-xs text-amber-800 bg-amber-100/60 px-3 py-2 rounded-lg mb-3">
              {impact}
            </div>
          )}
          {!resolved && (
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={onApprove}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                Approve
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={onReject}
                className="border-zinc-300 text-zinc-700"
              >
                Reject
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
