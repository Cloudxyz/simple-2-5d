import type { CharacterRig, BoundingBox, Part } from "@/types/rig";
import { zipSync, strToU8 } from "fflate";

// --- Filename helpers ---

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function safePartFilename(name: string, idx: number): string {
  const slug = slugify(name) || `part-${idx + 1}`;
  return `${String(idx + 1).padStart(2, "0")}-${slug}.png`;
}

function safeRigFilename(name: string): string {
  return (slugify(name) || "rig") + "-rig.json";
}

function safeZipFilename(name: string): string {
  return (slugify(name) || "export") + ".zip";
}

// --- Export data model ---

export interface ExportPart {
  id: string;
  name: string;
  bounds: BoundingBox;
  movementPoint: { x: number; y: number };
  /** Degrees. Rotation is stored here; PNG crops are unrotated raw cuts. */
  rotation: number;
  zIndex: number;
  isVisible: boolean;
  parentId: string | null;
  /** PNG filename in the export bundle, null for hidden parts */
  assetFile: string | null;
  /** Polygon vertices in image-local coords; null for rectangle-created parts.
   *  PNG crop uses bounds as fallback — polygon-aware crop is future work. */
  polygonPoints: { x: number; y: number }[] | null;
}

function buildExportParts(parts: Part[]): ExportPart[] {
  let visibleIdx = 0;
  return parts.map((p) => ({
    id: p.id,
    name: p.name,
    bounds: p.bounds,
    movementPoint: p.movementPoint,
    rotation: p.rotation,
    zIndex: p.zIndex,
    isVisible: p.isVisible,
    parentId: p.parentId,
    assetFile: p.isVisible ? safePartFilename(p.name, visibleIdx++) : null,
    polygonPoints: p.polygonPoints ?? null,
  }));
}

// --- Browser helpers ---

function triggerDownload(url: string, filename: string): void {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

async function loadImageElement(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load image"));
    img.src = dataUrl;
  });
}

async function cropPartToBlob(img: HTMLImageElement, bounds: BoundingBox): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, bounds.width);
  canvas.height = Math.max(1, bounds.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");
  ctx.drawImage(img, -bounds.x, -bounds.y);
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) reject(new Error("toBlob returned null"));
      else resolve(blob);
    }, "image/png");
  });
}

// --- Public export functions ---

/** Download the rig as a JSON file. Includes all parts regardless of visibility. */
export async function exportJson(rig: CharacterRig): Promise<void> {
  const exportParts = buildExportParts(rig.parts);
  let imageSize: { width: number; height: number } | null = null;
  if (rig.imageDataUrl) {
    try {
      const img = await loadImageElement(rig.imageDataUrl);
      imageSize = { width: img.naturalWidth, height: img.naturalHeight };
    } catch { /* best-effort */ }
  }
  const payload = { version: 1, name: rig.name, imageSize, parts: exportParts };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  triggerDownload(url, safeRigFilename(rig.name));
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Download each visible part as a separate transparent PNG crop.
 * PNG pixels are unrotated raw crops — rotation is stored in the JSON.
 */
export async function exportPngs(rig: CharacterRig): Promise<void> {
  if (!rig.imageDataUrl) throw new Error("No image in project");
  const img = await loadImageElement(rig.imageDataUrl);
  const visible = rig.parts.filter((p) => p.isVisible);
  for (let i = 0; i < visible.length; i++) {
    const blob = await cropPartToBlob(img, visible[i].bounds);
    const url = URL.createObjectURL(blob);
    // Small stagger so browsers don't block simultaneous download triggers
    if (i > 0) await new Promise<void>((r) => setTimeout(r, 100));
    triggerDownload(url, safePartFilename(visible[i].name, i));
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  }
}

/** Download all visible PNG crops + rig JSON bundled in a single ZIP file. */
export async function exportZip(rig: CharacterRig): Promise<void> {
  if (!rig.imageDataUrl) throw new Error("No image in project");
  const img = await loadImageElement(rig.imageDataUrl);
  const exportParts = buildExportParts(rig.parts);
  const files: Parameters<typeof zipSync>[0] = {};

  // PNG crops for visible parts
  for (const ep of exportParts) {
    if (!ep.isVisible || !ep.assetFile) continue;
    const part = rig.parts.find((p) => p.id === ep.id)!;
    const blob = await cropPartToBlob(img, part.bounds);
    files[ep.assetFile] = new Uint8Array(await blob.arrayBuffer());
  }

  // Rig JSON
  const imageSize = { width: img.naturalWidth, height: img.naturalHeight };
  const jsonStr = JSON.stringify({ version: 1, name: rig.name, imageSize, parts: exportParts }, null, 2);
  files[safeRigFilename(rig.name)] = strToU8(jsonStr);

  const zipped = zipSync(files, { level: 6 });
  const blob = new Blob([zipped], { type: "application/zip" });
  const url = URL.createObjectURL(blob);
  triggerDownload(url, safeZipFilename(rig.name));
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
