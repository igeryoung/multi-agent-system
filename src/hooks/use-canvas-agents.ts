import { useCallback, useMemo, useState } from "react";
import { PREDEFINED_ROLES, type RoleDefinition } from "@/shared/contracts/types";

export function useCanvasAgents() {
  const [canvasAgents, setCanvasAgents] = useState<RoleDefinition[]>([]);

  const addAgent = useCallback((roleId: string): void => {
    const role = PREDEFINED_ROLES.find((r) => r.id === roleId);
    if (!role) return;
    setCanvasAgents((prev) =>
      prev.some((a) => a.id === roleId) ? prev : [...prev, role]
    );
  }, []);

  const removeAgent = useCallback((roleId: string): void => {
    setCanvasAgents((prev) => prev.filter((a) => a.id !== roleId));
  }, []);

  const reset = useCallback((): void => {
    setCanvasAgents([]);
  }, []);

  const roleIds = useMemo(() => canvasAgents.map((a) => a.id), [canvasAgents]);

  const availableRoles = useMemo(
    () => PREDEFINED_ROLES.filter((r) => !canvasAgents.some((a) => a.id === r.id)),
    [canvasAgents]
  );

  return { canvasAgents, addAgent, removeAgent, reset, roleIds, availableRoles };
}
