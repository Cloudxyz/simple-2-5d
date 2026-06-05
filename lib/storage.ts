import type { CharacterRig } from "@/types/rig";

const STORAGE_KEY = "simple2_5d_project_v1";

interface SavedProject {
  version: 1;
  savedAt: string;
  rig: CharacterRig;
}

export type SaveResult = "ok" | "empty" | "error";

/**
 * Save the current rig to localStorage.
 * Returns "empty" if there is nothing worth saving, "error" if the write fails
 * (most likely QuotaExceededError — image data URLs can be several MB).
 */
export function saveProject(rig: CharacterRig): SaveResult {
  if (!rig.imageDataUrl && rig.parts.length === 0) return "empty";
  try {
    const payload: SavedProject = {
      version: 1,
      savedAt: new Date().toISOString(),
      rig,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    return "ok";
  } catch {
    return "error";
  }
}

/** Load the saved rig from localStorage. Returns null if nothing is saved or data is corrupt. */
export function loadProject(): CharacterRig | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SavedProject>;
    if (parsed.version !== 1 || !parsed.rig) return null;
    // Migrate old saves that predate the rotation field
    const rig = parsed.rig;
    rig.parts = rig.parts.map((p) => ({ ...p, rotation: (p as { rotation?: number }).rotation ?? 0 }));
    return rig;
  } catch {
    return null;
  }
}

/** Remove the saved rig from localStorage. */
export function clearProject(): void {
  localStorage.removeItem(STORAGE_KEY);
}
