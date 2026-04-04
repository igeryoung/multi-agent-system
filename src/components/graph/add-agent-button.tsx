import { useState, useRef, useEffect } from "react";
import type { RoleDefinition } from "@/shared/contracts/types";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";

interface AddAgentButtonProps {
  availableRoles: RoleDefinition[];
  onAddAgent: (roleId: string) => void;
}

export function AddAgentButton({ availableRoles, onAddAgent }: AddAgentButtonProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as HTMLElement)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium",
          "bg-white border border-zinc-200 shadow-sm hover:bg-zinc-50 transition-colors",
          availableRoles.length === 0 && "opacity-50 cursor-not-allowed"
        )}
        disabled={availableRoles.length === 0}
      >
        <Plus className="w-3.5 h-3.5" />
        Add Agent
      </button>

      {open && availableRoles.length > 0 && (
        <div className="absolute top-full right-0 mt-1 w-56 bg-white rounded-lg border border-zinc-200 shadow-lg z-50 py-1">
          {availableRoles.map((role) => (
            <button
              key={role.id}
              type="button"
              onClick={() => {
                onAddAgent(role.id);
                setOpen(false);
              }}
              className="w-full flex items-start gap-2.5 px-3 py-2 hover:bg-zinc-50 transition-colors text-left"
            >
              <div
                className="w-2.5 h-2.5 rounded-full shrink-0 mt-0.5"
                style={{ backgroundColor: role.hue }}
              />
              <div className="min-w-0">
                <div className="text-sm font-medium text-foreground">{role.label}</div>
                <div className="text-[11px] text-muted-foreground truncate">
                  {role.responsibility}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
