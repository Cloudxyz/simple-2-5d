"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { loadProject } from "@/lib/storage";
import { exportJson, exportPngs, exportZip } from "@/lib/export";
import type { CharacterRig } from "@/types/rig";

type BusyState = "json" | "png" | "zip" | null;

export default function ExportPage() {
  const [rig, setRig] = useState<CharacterRig | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState<BusyState>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setRig(loadProject());
    setLoaded(true);
  }, []);

  const totalParts = rig?.parts.length ?? 0;
  const visibleParts = rig?.parts.filter((p) => p.isVisible) ?? [];
  const hasImage = !!rig?.imageDataUrl;
  const canExportPngs = hasImage && visibleParts.length > 0;

  async function run(kind: BusyState, fn: () => Promise<void>) {
    setBusy(kind);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export failed");
    } finally {
      setBusy(null);
    }
  }

  if (!loaded) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p className="text-zinc-500 text-sm">Loading…</p>
      </main>
    );
  }

  if (!rig) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center px-4">
        <div className="max-w-md w-full space-y-4 text-center">
          <p className="text-zinc-400">No saved project found.</p>
          <p className="text-zinc-600 text-sm">
            Open the editor, create a character, and save it first.
          </p>
          <Link
            href="/editor"
            className="inline-block mt-2 text-violet-400 hover:text-violet-300 text-sm transition-colors"
          >
            ← Open editor
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex flex-col items-center px-4 py-12">
      <div className="max-w-lg w-full space-y-6">
        {/* Header */}
        <div>
          <Link
            href="/editor"
            className="text-zinc-500 hover:text-zinc-300 text-sm transition-colors"
          >
            ← Back to editor
          </Link>
          <h1 className="text-2xl font-bold mt-4">{rig.name}</h1>
          <p className="text-zinc-500 text-sm mt-1">
            {totalParts} {totalParts === 1 ? "part" : "parts"}
            {totalParts > 0 && (
              <span className="text-zinc-600">
                {" "}· {visibleParts.length} visible
              </span>
            )}
          </p>
        </div>

        {/* Warnings */}
        {!hasImage && (
          <div className="bg-amber-950/40 border border-amber-800/60 rounded-lg px-4 py-3 text-amber-400 text-sm">
            No image uploaded — return to the editor and upload a PNG before exporting.
          </div>
        )}

        {hasImage && totalParts === 0 && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3 text-zinc-500 text-sm">
            No parts defined yet — return to the editor and create at least one part.
          </div>
        )}

        {hasImage && totalParts > 0 && visibleParts.length === 0 && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3 text-zinc-500 text-sm">
            All parts are hidden — unhide at least one part in the editor to export PNG files.
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="bg-red-950/40 border border-red-800/60 rounded-lg px-4 py-3 text-red-400 text-sm">
            {error}
          </div>
        )}

        {/* Export cards */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden divide-y divide-zinc-800">
          <ExportRow
            title="Rig data (JSON)"
            description={`All ${totalParts} ${totalParts === 1 ? "part" : "parts"} with bounding boxes, movement points, rotation, and layer order. Includes hidden parts marked isVisible: false.`}
            action="Export JSON"
            busy={busy === "json"}
            disabled={busy !== null}
            onClick={() => run("json", () => exportJson(rig))}
          />

          <ExportRow
            title="PNG parts"
            description={
              canExportPngs
                ? `${visibleParts.length} visible ${visibleParts.length === 1 ? "part" : "parts"} as transparent PNG crops. Hidden parts are skipped. PNG files are unrotated — rotation is in the JSON.`
                : visibleParts.length === 0 && totalParts > 0
                ? "All parts are hidden. Unhide at least one part to export PNGs."
                : "Requires an image with at least one visible part."
            }
            action="Export PNGs"
            busy={busy === "png"}
            disabled={busy !== null || !canExportPngs}
            onClick={() => run("png", () => exportPngs(rig))}
          />

          <ExportRow
            title="Full bundle (ZIP)"
            description={
              canExportPngs
                ? `All ${visibleParts.length} PNG ${visibleParts.length === 1 ? "crop" : "crops"} plus the rig JSON in one file. The easiest way to grab everything at once.`
                : "Requires an image with at least one visible part."
            }
            action="Export ZIP"
            busy={busy === "zip"}
            disabled={busy !== null || !canExportPngs}
            onClick={() => run("zip", () => exportZip(rig))}
          />
        </div>

        <p className="text-zinc-700 text-xs text-center">
          Everything runs locally in your browser — nothing is uploaded anywhere.
        </p>
      </div>
    </main>
  );
}

interface ExportRowProps {
  title: string;
  description: string;
  action: string;
  busy: boolean;
  disabled: boolean;
  onClick: () => void;
}

function ExportRow({ title, description, action, busy, disabled, onClick }: ExportRowProps) {
  return (
    <div className="flex items-start justify-between gap-4 px-5 py-4">
      <div className="min-w-0 flex-1">
        <h2 className="font-semibold text-zinc-200 text-sm">{title}</h2>
        <p className="text-zinc-500 text-xs mt-0.5 leading-relaxed">{description}</p>
      </div>
      <button
        onClick={onClick}
        disabled={disabled}
        className={`flex-shrink-0 mt-0.5 px-3 py-1.5 rounded text-sm font-medium transition-colors ${
          busy
            ? "bg-violet-800/60 text-violet-300 cursor-wait"
            : disabled
            ? "bg-zinc-800 text-zinc-600 cursor-not-allowed"
            : "bg-violet-600 hover:bg-violet-500 text-white"
        }`}
      >
        {busy ? "Exporting…" : action}
      </button>
    </div>
  );
}
