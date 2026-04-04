import { useCallback, useMemo } from "react";
import { PREDEFINED_ROLES, type RoleDefinition } from "@/shared/contracts/types";

interface UseCanvasAgentsOptions {
  selectedRoleIds: string[];
  onChangeRoleIds: (roleIds: string[]) => void;
}

export function useCanvasAgents({
  selectedRoleIds,
  onChangeRoleIds
}: UseCanvasAgentsOptions) {
  const canvasAgents = useMemo(
    () =>
      selectedRoleIds
        .map((roleId) => PREDEFINED_ROLES.find((role) => role.id === roleId))
        .filter((role): role is RoleDefinition => Boolean(role)),
    [selectedRoleIds]
  );

  const addAgent = useCallback((roleId: string): void => {
    onChangeRoleIds(
      selectedRoleIds.includes(roleId)
        ? selectedRoleIds
        : [...selectedRoleIds, roleId]
    );
  }, [onChangeRoleIds, selectedRoleIds]);

  const removeAgent = useCallback((roleId: string): void => {
    onChangeRoleIds(selectedRoleIds.filter((currentRoleId) => currentRoleId !== roleId));
  }, [onChangeRoleIds, selectedRoleIds]);

  const reset = useCallback((): void => {
    onChangeRoleIds([]);
  }, [onChangeRoleIds]);

  const availableRoles = useMemo(
    () => PREDEFINED_ROLES.filter((role) => !selectedRoleIds.includes(role.id)),
    [selectedRoleIds]
  );

  return {
    canvasAgents,
    addAgent,
    removeAgent,
    reset,
    roleIds: selectedRoleIds,
    availableRoles
  };
}
