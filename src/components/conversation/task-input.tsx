import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Play } from "lucide-react";

const DEFAULT_TASK =
  "Plan, implement, QA, and publish a release summary for the multi-agent system roadmap.";

interface TaskInputProps {
  onStartRun: (task: string) => void;
  disabled?: boolean;
  hasAgents: boolean;
}

export function TaskInput({ onStartRun, disabled, hasAgents }: TaskInputProps) {
  const [task, setTask] = useState(DEFAULT_TASK);

  function handleSubmit(): void {
    if (task.trim().length === 0) return;
    onStartRun(task.trim());
  }

  return (
    <div className="p-4 border-b border-zinc-100">
      <div className="space-y-3">
        <div>
          <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">
            Task
          </label>
          <Textarea
            value={task}
            onChange={(e) => setTask(e.target.value)}
            placeholder="Describe the task you want the agents to collaborate on..."
            rows={3}
            className="resize-none text-sm"
            disabled={disabled}
          />
        </div>
        {!hasAgents && !disabled && (
          <p className="text-[11px] text-muted-foreground">
            Add agents on the canvas using the + button before starting.
          </p>
        )}
        <Button
          onClick={handleSubmit}
          disabled={disabled || task.trim().length === 0 || !hasAgents}
          className="w-full"
        >
          <Play className="w-4 h-4 mr-2" />
          {disabled ? "Run in progress..." : "Start Dispatch"}
        </Button>
      </div>
    </div>
  );
}
