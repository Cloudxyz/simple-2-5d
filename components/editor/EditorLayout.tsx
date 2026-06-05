"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import EditorCanvas from "./EditorCanvas";
import PartsSidebar from "./PartsSidebar";
import Toolbar from "./Toolbar";
import NamePartDialog from "./NamePartDialog";
import { saveProject, loadProject, clearProject } from "@/lib/storage";
import type { BoundingBox, CharacterRig, Part } from "@/types/rig";

interface EditorLayoutProps {
  characterName: string;
  /** When true, ignore any saved project and start fresh. Set via ?new=1. */
  freshStart?: boolean;
}

interface StageTransform {
  x: number;
  y: number;
  scale: number;
}

type SaveStatus = "idle" | "saved" | "empty" | "error";

const MIN_ZOOM = 0.05;
const MAX_ZOOM = 8;
const ZOOM_STEP = 0.15;

export default function EditorLayout({ characterName, freshStart = false }: EditorLayoutProps) {
  const [rig, setRig] = useState<CharacterRig>({
    name: characterName,
    parts: [],
    imageDataUrl: null,
  });

  const [activeTool, setActiveTool] = useState<"select" | "move" | "point">("select");
  const [selectedPartId, setSelectedPartId] = useState<string | null>(null);
  const [stageTransform, setStageTransform] = useState<StageTransform>({ x: 0, y: 0, scale: 1 });
  const [resetKey, setResetKey] = useState(0);
  const [pendingBounds, setPendingBounds] = useState<BoundingBox | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  // Auto-load saved project on mount — skipped when freshStart is set (?new=1)
  useEffect(() => {
    if (freshStart) return;
    const saved = loadProject();
    if (saved) setRig(saved);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-fade save status after 2.5 s
  useEffect(() => {
    if (saveStatus === "idle") return;
    const t = setTimeout(() => setSaveStatus("idle"), 2500);
    return () => clearTimeout(t);
  }, [saveStatus]);

  function handleImageUpload(dataUrl: string) {
    setRig((prev) => ({ ...prev, imageDataUrl: dataUrl }));
  }

  function handleSave() {
    const result = saveProject(rig);
    setSaveStatus(result === "ok" ? "saved" : result === "empty" ? "empty" : "error");
  }

  function handleClearRequest() {
    setShowClearConfirm(true);
  }

  function handleConfirmClear() {
    clearProject();
    setRig({ name: characterName, parts: [], imageDataUrl: null });
    setSelectedPartId(null);
    setStageTransform({ x: 0, y: 0, scale: 1 });
    setShowClearConfirm(false);
    setSaveStatus("idle");
  }

  function handleSelectionComplete(bounds: BoundingBox) {
    setPendingBounds(bounds);
  }

  function handleCreatePart(name: string) {
    if (!pendingBounds) return;
    const newPart: Part = {
      id: crypto.randomUUID(),
      name: name.trim() || "Part",
      bounds: pendingBounds,
      movementPoint: {
        x: Math.round(pendingBounds.x + pendingBounds.width / 2),
        y: Math.round(pendingBounds.y + pendingBounds.height / 2),
      },
      zIndex: rig.parts.length,
      parentId: null,
      imageDataUrl: null,
      isVisible: true,
      rotation: 0,
    };
    setRig((prev) => ({ ...prev, parts: [...prev.parts, newPart] }));
    setSelectedPartId(newPart.id);
    setPendingBounds(null);
  }

  function handleCancelPart() {
    setPendingBounds(null);
  }

  function handleSelectPart(id: string | null) {
    setSelectedPartId(id);
  }

  function handleDeletePart(id: string) {
    setRig((prev) => ({ ...prev, parts: prev.parts.filter((p) => p.id !== id) }));
    if (selectedPartId === id) setSelectedPartId(null);
  }

  function handleToggleVisibility(id: string) {
    setRig((prev) => ({
      ...prev,
      parts: prev.parts.map((p) => (p.id === id ? { ...p, isVisible: !p.isVisible } : p)),
    }));
  }

  function handleMovementPointChange(partId: string, point: { x: number; y: number }) {
    setRig((prev) => ({
      ...prev,
      parts: prev.parts.map((p) => (p.id === partId ? { ...p, movementPoint: point } : p)),
    }));
  }

  function handleMovePartToFront(partId: string) {
    setRig((prev) => {
      const sorted = [...prev.parts].sort((a, b) => a.zIndex - b.zIndex);
      const idx = sorted.findIndex((p) => p.id === partId);
      if (idx === -1 || idx === sorted.length - 1) return prev;
      const part = sorted.splice(idx, 1)[0];
      sorted.push(part);
      return { ...prev, parts: sorted.map((p, i) => ({ ...p, zIndex: i })) };
    });
  }

  function handleMovePartUp(partId: string) {
    setRig((prev) => {
      const sorted = [...prev.parts].sort((a, b) => a.zIndex - b.zIndex);
      const idx = sorted.findIndex((p) => p.id === partId);
      if (idx === -1 || idx === sorted.length - 1) return prev;
      [sorted[idx], sorted[idx + 1]] = [sorted[idx + 1], sorted[idx]];
      return { ...prev, parts: sorted.map((p, i) => ({ ...p, zIndex: i })) };
    });
  }

  function handleMovePartDown(partId: string) {
    setRig((prev) => {
      const sorted = [...prev.parts].sort((a, b) => a.zIndex - b.zIndex);
      const idx = sorted.findIndex((p) => p.id === partId);
      if (idx <= 0) return prev;
      [sorted[idx], sorted[idx - 1]] = [sorted[idx - 1], sorted[idx]];
      return { ...prev, parts: sorted.map((p, i) => ({ ...p, zIndex: i })) };
    });
  }

  function handleMovePartToBack(partId: string) {
    setRig((prev) => {
      const sorted = [...prev.parts].sort((a, b) => a.zIndex - b.zIndex);
      const idx = sorted.findIndex((p) => p.id === partId);
      if (idx <= 0) return prev;
      const part = sorted.splice(idx, 1)[0];
      sorted.unshift(part);
      return { ...prev, parts: sorted.map((p, i) => ({ ...p, zIndex: i })) };
    });
  }

  function handleResetMovementPoint(partId: string) {
    setRig((prev) => ({
      ...prev,
      parts: prev.parts.map((p) => {
        if (p.id !== partId) return p;
        return {
          ...p,
          movementPoint: {
            x: Math.round(p.bounds.x + p.bounds.width / 2),
            y: Math.round(p.bounds.y + p.bounds.height / 2),
          },
        };
      }),
    }));
  }

  function handleRotateLeft(partId: string) {
    setRig((prev) => ({
      ...prev,
      parts: prev.parts.map((p) =>
        p.id === partId ? { ...p, rotation: (p.rotation - 15 + 360) % 360 } : p
      ),
    }));
  }

  function handleRotateRight(partId: string) {
    setRig((prev) => ({
      ...prev,
      parts: prev.parts.map((p) =>
        p.id === partId ? { ...p, rotation: (p.rotation + 15) % 360 } : p
      ),
    }));
  }

  function handleResetRotation(partId: string) {
    setRig((prev) => ({
      ...prev,
      parts: prev.parts.map((p) => (p.id === partId ? { ...p, rotation: 0 } : p)),
    }));
  }

  const handleZoomIn = useCallback(() => {
    setStageTransform((t) => ({ ...t, scale: Math.min(MAX_ZOOM, t.scale * (1 + ZOOM_STEP)) }));
  }, []);

  const handleZoomOut = useCallback(() => {
    setStageTransform((t) => ({ ...t, scale: Math.max(MIN_ZOOM, t.scale * (1 - ZOOM_STEP)) }));
  }, []);

  const handleResetView = useCallback(() => {
    setResetKey((k) => k + 1);
  }, []);

  const zoomPercent = Math.round(stageTransform.scale * 100);
  const hasContent = !!(rig.imageDataUrl || rig.parts.length > 0);

  const saveStatusText: Record<Exclude<SaveStatus, "idle">, string> = {
    saved: "Saved",
    empty: "Nothing to save",
    error: "Save failed — image may be too large",
  };

  return (
    <div className="flex flex-col h-screen bg-zinc-950">
      {/* Top bar */}
      <header className="flex items-center justify-between px-4 py-2 bg-zinc-900 border-b border-zinc-800 flex-shrink-0">
        <div className="flex items-center gap-3">
          <Link href="/" className="text-zinc-500 hover:text-zinc-300 text-sm transition-colors">
            ← Home
          </Link>
          <span className="text-zinc-700">|</span>
          <span className="text-zinc-300 font-medium text-sm">{rig.name}</span>
        </div>

        <div className="flex items-center gap-2">
          {showClearConfirm ? (
            /* Inline clear confirmation */
            <>
              <span className="text-xs text-zinc-400">
                This will remove your saved local project.
              </span>
              <button
                onClick={handleConfirmClear}
                className="text-xs text-red-400 hover:text-red-300 px-2 py-1 rounded hover:bg-red-950/40 transition-colors"
              >
                Clear
              </button>
              <button
                onClick={() => setShowClearConfirm(false)}
                className="text-xs text-zinc-500 hover:text-zinc-300 px-2 py-1 rounded hover:bg-zinc-800 transition-colors"
              >
                Cancel
              </button>
            </>
          ) : (
            /* Normal header actions */
            <>
              {saveStatus !== "idle" && (
                <span
                  className={`text-xs transition-colors ${
                    saveStatus === "saved"
                      ? "text-emerald-500"
                      : saveStatus === "empty"
                      ? "text-zinc-500"
                      : "text-red-400"
                  }`}
                >
                  {saveStatusText[saveStatus]}
                </span>
              )}
              {hasContent && (
                <button
                  onClick={handleClearRequest}
                  className="text-zinc-600 hover:text-zinc-400 text-xs transition-colors"
                >
                  Clear project
                </button>
              )}
              <button
                onClick={handleSave}
                className="text-zinc-400 hover:text-zinc-200 text-sm px-3 py-1.5 rounded border border-zinc-700 hover:border-zinc-500 transition-colors"
              >
                Save
              </button>
              <Link
                href="/export"
                className="bg-violet-600 hover:bg-violet-500 text-white text-sm px-3 py-1.5 rounded transition-colors"
              >
                Export
              </Link>
            </>
          )}
        </div>
      </header>

      {/* Toolbar */}
      <Toolbar
        activeTool={activeTool}
        onToolChange={setActiveTool}
        zoomPercent={zoomPercent}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onResetView={handleResetView}
        hasImage={!!rig.imageDataUrl}
      />

      {/* Main area */}
      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 relative">
          <EditorCanvas
            rig={rig}
            activeTool={activeTool}
            selectedPartId={selectedPartId}
            onImageUpload={handleImageUpload}
            onSelectionComplete={handleSelectionComplete}
            onSelectPart={handleSelectPart}
            onMovementPointChange={handleMovementPointChange}
            stageTransform={stageTransform}
            onStageTransformChange={setStageTransform}
            resetKey={resetKey}
          />
        </div>

        <PartsSidebar
          parts={rig.parts}
          selectedPartId={selectedPartId}
          onSelectPart={handleSelectPart}
          onDeletePart={handleDeletePart}
          onToggleVisibility={handleToggleVisibility}
          onResetMovementPoint={handleResetMovementPoint}
          onMoveToFront={handleMovePartToFront}
          onMoveUp={handleMovePartUp}
          onMoveDown={handleMovePartDown}
          onMoveToBack={handleMovePartToBack}
          onRotateLeft={handleRotateLeft}
          onRotateRight={handleRotateRight}
          onResetRotation={handleResetRotation}
        />
      </div>

      {/* Part naming dialog */}
      {pendingBounds && (
        <NamePartDialog onConfirm={handleCreatePart} onCancel={handleCancelPart} />
      )}
    </div>
  );
}
