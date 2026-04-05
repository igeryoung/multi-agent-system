import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Play, Square } from "lucide-react";

interface TaskInputProps {
  task: string;
  onTaskChange: (task: string) => void;
  onStartRun: (task: string) => void | Promise<void>;
  onCancel?: () => void;
  disabled?: boolean;
  isLive?: boolean;
  approvalPending?: boolean;
  hasAgents: boolean;
  helperText?: string | null;
  submitLabel?: string;
}

export function TaskInput({
  task,
  onTaskChange,
  onStartRun,
  onCancel,
  disabled,
  isLive,
  approvalPending,
  hasAgents,
  helperText,
  submitLabel
}: TaskInputProps) {
  const inputId = "task-input";

  function handleSubmit(): void {
    if (task.trim().length === 0) return;
    void onStartRun(task.trim());
  }

  const showStopButton = isLive && !approvalPending && onCancel;

  return (
    <div className="p-4 border-t border-zinc-100">
      <div className="space-y-3">
        <div>
          <label
            htmlFor={inputId}
            className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5"
          >
            Task
          </label>
          <Textarea
            id={inputId}
            value={task}
            onChange={(e) => onTaskChange(e.target.value)}
            placeholder="Describe the task you want the agents to collaborate on..."
            rows={3}
            className="resize-none text-sm"
            disabled={disabled}
          />
        </div>
        {helperText ? (
          <p className="text-[11px] text-muted-foreground">
            {helperText}
          </p>
        ) : !hasAgents && !disabled ? (
          <p className="text-[11px] text-muted-foreground">
            Add agents on the canvas using the + button before starting.
          </p>
        ) : null}
        {showStopButton ? (
          <Button
            onClick={onCancel}
            variant="destructive"
            className="w-full"
          >
            <Square className="w-4 h-4 mr-2" />
            Stop Run
          </Button>
        ) : (
          <Button
            onClick={handleSubmit}
            disabled={disabled || task.trim().length === 0 || !hasAgents}
            className="w-full"
          >
            <Play className="w-4 h-4 mr-2" />
            {submitLabel ?? (disabled ? "Run in progress..." : "Start Dispatch")}
          </Button>
        )}
      </div>
    </div>
  );
}
