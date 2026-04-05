import { useCallback, useMemo } from "react";
import {
  PREDEFINED_ROLES,
  sanitizeRoleIds,
  type RoleDefinition
} from "@/shared/contracts/types";

interface UseCanvasAgentsOptions {
  selectedRoleIds: string[];
  onChangeRoleIds: (roleIds: string[]) => void;
}

export function useCanvasAgents({
  selectedRoleIds,
  onChangeRoleIds
}: UseCanvasAgentsOptions) {
  const normalizedRoleIds = useMemo(
    () => sanitizeRoleIds(selectedRoleIds),
    [selectedRoleIds]
  );

  const canvasAgents = useMemo(
    () =>
      normalizedRoleIds
        .map((roleId) => PREDEFINED_ROLES.find((role) => role.id === roleId))
        .filter((role): role is RoleDefinition => Boolean(role)),
    [normalizedRoleIds]
  );

  const addAgent = useCallback((roleId: string): void => {
    onChangeRoleIds(
      normalizedRoleIds.includes(roleId)
        ? normalizedRoleIds
        : [...normalizedRoleIds, roleId]
    );
  }, [normalizedRoleIds, onChangeRoleIds]);

  const removeAgent = useCallback((roleId: string): void => {
    onChangeRoleIds(normalizedRoleIds.filter((currentRoleId) => currentRoleId !== roleId));
  }, [normalizedRoleIds, onChangeRoleIds]);

  const reset = useCallback((): void => {
    onChangeRoleIds([]);
  }, [onChangeRoleIds]);

  const availableRoles = useMemo(
    () => PREDEFINED_ROLES.filter((role) => !normalizedRoleIds.includes(role.id)),
    [normalizedRoleIds]
  );

  return {
    canvasAgents,
    addAgent,
    removeAgent,
    reset,
    roleIds: normalizedRoleIds,
    availableRoles
  };
}
