import type { LayerGroup, Part } from "@/types/rig";

export function findGroupById(groups: LayerGroup[] | undefined, groupId: string | null | undefined): LayerGroup | null {
  if (!groups || !groupId) return null;
  return groups.find((group) => group.id === groupId) ?? null;
}

export function isPartDirectlyLocked(part: Part | null | undefined): boolean {
  return part?.isLocked === true;
}

export function isPartEffectivelyLocked(part: Part | null | undefined, groups: LayerGroup[] | undefined): boolean {
  if (!part) return false;
  if (part.isLocked === true) return true;
  return findGroupById(groups, part.groupId)?.isLocked === true;
}
