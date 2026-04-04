import { PREDEFINED_ROLES, type RoleDefinition } from "@/shared/contracts/types";
import { cn } from "@/lib/utils";

interface RolePaletteProps {
  selectedRoleIds: string[];
  onToggleRole: (roleId: string) => void;
  disabled?: boolean;
}

export function RolePalette({ selectedRoleIds, onToggleRole, disabled }: RolePaletteProps) {
  return (
    <div className="flex flex-wrap gap-1.5 p-2 bg-zinc-50/80 rounded-lg border border-zinc-100">
      <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider w-full mb-0.5">
        Agent Roles
      </span>
      {PREDEFINED_ROLES.map((role) => (
        <RoleChip
          key={role.id}
          role={role}
          selected={selectedRoleIds.includes(role.id)}
          onToggle={() => onToggleRole(role.id)}
          disabled={disabled}
        />
      ))}
    </div>
  );
}

function RoleChip({
  role,
  selected,
  onToggle,
  disabled
}: {
  role: RoleDefinition;
  selected: boolean;
  onToggle: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      className={cn(
        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-all",
        "border cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed",
        selected
          ? "border-transparent text-white shadow-sm"
          : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300"
      )}
      style={selected ? { backgroundColor: role.hue } : undefined}
      title={role.responsibility}
    >
      <div
        className="w-2 h-2 rounded-full shrink-0"
        style={{ backgroundColor: selected ? "white" : role.hue }}
      />
      {role.label}
    </button>
  );
}
