"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import EditorCanvas from "./EditorCanvas";
import PartsSidebar from "./PartsSidebar";
import Toolbar from "./Toolbar";
import NamePartDialog from "./NamePartDialog";
import { saveProject, loadProject, clearProject } from "@/lib/storage";
import { findGroupById, isPartEffectivelyLocked } from "@/lib/layers";
import type { BoundingBox, CharacterRig, LayerGroup, Part } from "@/types/rig";

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

function wouldCreateParentCycle(parts: Part[], partId: string, nextParentId: string): boolean {
  const partsById = new Map(parts.map((part) => [part.id, part]));
  const visited = new Set<string>([partId]);
  let currentId: string | null = nextParentId;

  while (currentId) {
    if (visited.has(currentId)) return true;
    visited.add(currentId);
    currentId = partsById.get(currentId)?.parentId ?? null;
  }

  return false;
}

function reindexPartsFromFrontOrder(parts: Part[]): Part[] {
  return parts.map((part, index) => ({
    ...part,
    zIndex: parts.length - 1 - index,
  }));
}

export default function EditorLayout({ characterName, freshStart = false }: EditorLayoutProps) {
  const [rig, setRig] = useState<CharacterRig>({
    name: characterName,
    parts: [],
    imageDataUrl: null,
    groups: [],
  });

  const [activeTool, setActiveTool] = useState<"select" | "move" | "point" | "pen">("select");
  const [selectedPartId, setSelectedPartId] = useState<string | null>(null);
  const [stageTransform, setStageTransform] = useState<StageTransform>({ x: 0, y: 0, scale: 1 });
  const [resetKey, setResetKey] = useState(0);
  const [pendingBounds, setPendingBounds] = useState<BoundingBox | null>(null);
  const [penPoints, setPenPoints] = useState<{ x: number; y: number }[]>([]);
  const [penClosed, setPenClosed] = useState(false);
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

  // Cancel in-progress pen selection when switching away from pen tool
  useEffect(() => {
    if (activeTool !== "pen") {
      setPenPoints([]);
      setPenClosed(false);
    }
  }, [activeTool]);

  function handlePenAddPoint(pt: { x: number; y: number }) {
    setPenPoints((prev) => [...prev, pt]);
  }

  function handlePenRemoveLastPoint() {
    setPenPoints((prev) => prev.slice(0, -1));
  }

  function handlePenComplete(points: { x: number; y: number }[]) {
    if (penClosed || points.length < 3) return;
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    const minX = Math.round(Math.min(...xs));
    const minY = Math.round(Math.min(...ys));
    const w = Math.round(Math.max(...xs) - minX);
    const h = Math.round(Math.max(...ys) - minY);
    if (w < 1 || h < 1) return;
    setPenClosed(true);
    setPendingBounds({ x: minX, y: minY, width: w, height: h });
  }

  function handlePenCancel() {
    setPenPoints([]);
    setPenClosed(false);
  }

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
    setRig({ name: characterName, parts: [], imageDataUrl: null, groups: [] });
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
      groupId: null,
      imageDataUrl: null,
      isVisible: true,
      isLocked: false,
      rotation: 0,
      polygonPoints: penClosed && penPoints.length >= 3 ? [...penPoints] : null,
    };
    setRig((prev) => ({ ...prev, parts: [...prev.parts, newPart] }));
    setSelectedPartId(newPart.id);
    setPendingBounds(null);
    setPenPoints([]);
    setPenClosed(false);
  }

  function handleCancelPart() {
    setPendingBounds(null);
    setPenPoints([]);
    setPenClosed(false);
  }

  function handleSelectPart(id: string | null) {
    if (!id) {
      setSelectedPartId(null);
      return;
    }
    const selectedPart = rig.parts.find((part) => part.id === id);
    if (selectedPart?.groupId) {
      setRig((prev) => ({
        ...prev,
        groups: (prev.groups ?? []).map((group) =>
          group.id === selectedPart.groupId ? { ...group, isExpanded: true } : group
        ),
      }));
    }
    setSelectedPartId(id);
  }

  function handleDeletePart(id: string) {
    if (isPartEffectivelyLocked(rig.parts.find((p) => p.id === id), rig.groups)) return;
    setRig((prev) => ({
      ...prev,
      parts: prev.parts
        .filter((p) => p.id !== id)
        .map((p) => (p.parentId === id ? { ...p, parentId: null } : p)),
    }));
    if (selectedPartId === id) setSelectedPartId(null);
  }

  function handleToggleVisibility(id: string) {
    setRig((prev) => ({
      ...prev,
      parts: prev.parts.map((p) => (p.id === id ? { ...p, isVisible: !p.isVisible } : p)),
    }));
  }

  function handleToggleLock(id: string) {
    setRig((prev) => ({
      ...prev,
      parts: prev.parts.map((p) => (p.id === id ? { ...p, isLocked: !(p.isLocked ?? false) } : p)),
    }));
  }

  function handleCreateGroup() {
    const newGroup: LayerGroup = {
      id: crypto.randomUUID(),
      name: `Folder ${((rig.groups ?? []).length + 1)}`,
      isLocked: false,
      isExpanded: true,
    };
    setRig((prev) => ({
      ...prev,
      groups: [...(prev.groups ?? []), newGroup],
    }));
  }

  function handleRenameGroup(groupId: string, name: string) {
    const nextName = name.trim();
    if (!nextName) return;
    setRig((prev) => ({
      ...prev,
      groups: (prev.groups ?? []).map((group) =>
        group.id === groupId ? { ...group, name: nextName } : group
      ),
    }));
  }

  function handleDeleteGroup(groupId: string) {
    setRig((prev) => ({
      ...prev,
      groups: (prev.groups ?? []).filter((group) => group.id !== groupId),
      parts: prev.parts.map((part) => (part.groupId === groupId ? { ...part, groupId: null } : part)),
    }));
  }

  function handleToggleGroupLock(groupId: string) {
    setRig((prev) => ({
      ...prev,
      groups: (prev.groups ?? []).map((group) =>
        group.id === groupId ? { ...group, isLocked: !group.isLocked } : group
      ),
    }));
  }

  function handleToggleGroupExpanded(groupId: string) {
    setRig((prev) => ({
      ...prev,
      groups: (prev.groups ?? []).map((group) =>
        group.id === groupId ? { ...group, isExpanded: !group.isExpanded } : group
      ),
    }));
  }

  function handlePartGroupChange(partId: string, groupId: string) {
    setRig((prev) => {
      const part = prev.parts.find((item) => item.id === partId);
      if (!part) return prev;
      if (isPartEffectivelyLocked(part, prev.groups)) return prev;
      const nextGroupId = groupId || null;
      if (part.groupId === nextGroupId) return prev;
      if (nextGroupId && !findGroupById(prev.groups, nextGroupId)) return prev;
      return {
        ...prev,
        groups: (prev.groups ?? []).map((group) =>
          group.id === nextGroupId ? { ...group, isExpanded: true } : group
        ),
        parts: prev.parts.map((item) => (item.id === partId ? { ...item, groupId: nextGroupId } : item)),
      };
    });
  }

  function handlePartParentChange(partId: string, parentId: string) {
    setRig((prev) => {
      const nextParentId = parentId || null;
      const part = prev.parts.find((p) => p.id === partId);
      if (!part) return prev;
      if (isPartEffectivelyLocked(part, prev.groups)) return prev;
      if (part.parentId === nextParentId) return prev;

      if (nextParentId === null) {
        return {
          ...prev,
          parts: prev.parts.map((p) => (p.id === partId ? { ...p, parentId: null } : p)),
        };
      }

      if (nextParentId === partId) return prev;
      if (!prev.parts.some((p) => p.id === nextParentId)) return prev;
      if (wouldCreateParentCycle(prev.parts, partId, nextParentId)) return prev;

      return {
        ...prev,
        parts: prev.parts.map((p) => (p.id === partId ? { ...p, parentId: nextParentId } : p)),
      };
    });
  }

  function handlePolygonPointChange(
    partId: string,
    pointIndex: number,
    nextPoint: { x: number; y: number }
  ) {
    setRig((prev) => ({
      ...prev,
      parts: prev.parts.map((p) => {
        if (p.id !== partId || !p.polygonPoints || isPartEffectivelyLocked(p, prev.groups)) return p;
        const updated = p.polygonPoints.map((pt, i) =>
          i === pointIndex
            ? { x: Math.round(nextPoint.x), y: Math.round(nextPoint.y) }
            : pt
        );
        const xs = updated.map((pt) => pt.x);
        const ys = updated.map((pt) => pt.y);
        const minX = Math.min(...xs);
        const minY = Math.min(...ys);
        return {
          ...p,
          polygonPoints: updated,
          bounds: {
            x: Math.round(minX),
            y: Math.round(minY),
            width: Math.round(Math.max(...xs) - minX),
            height: Math.round(Math.max(...ys) - minY),
          },
          // movementPoint preserved intentionally — user placed it manually
        };
      }),
    }));
  }

  function handlePolygonPointDelete(partId: string, pointIndex: number) {
    setRig((prev) => ({
      ...prev,
      parts: prev.parts.map((p) => {
        if (p.id !== partId || !p.polygonPoints || p.polygonPoints.length <= 3 || isPartEffectivelyLocked(p, prev.groups)) return p;
        const updated = p.polygonPoints.filter((_, i) => i !== pointIndex);
        const xs = updated.map((pt) => pt.x);
        const ys = updated.map((pt) => pt.y);
        const minX = Math.min(...xs);
        const minY = Math.min(...ys);
        return {
          ...p,
          polygonPoints: updated,
          bounds: {
            x: Math.round(minX),
            y: Math.round(minY),
            width: Math.round(Math.max(...xs) - minX),
            height: Math.round(Math.max(...ys) - minY),
          },
          // movementPoint, rotation, zIndex, name, parentId, imageDataUrl, isVisible preserved
        };
      }),
    }));
  }

  function handlePolygonPointInsert(
    partId: string,
    afterIndex: number,
    point: { x: number; y: number }
  ) {
    setRig((prev) => ({
      ...prev,
      parts: prev.parts.map((p) => {
        if (p.id !== partId || !p.polygonPoints || p.polygonPoints.length < 3 || isPartEffectivelyLocked(p, prev.groups)) return p;
        const updated = [
          ...p.polygonPoints.slice(0, afterIndex + 1),
          { x: Math.round(point.x), y: Math.round(point.y) },
          ...p.polygonPoints.slice(afterIndex + 1),
        ];
        const xs = updated.map((pt) => pt.x);
        const ys = updated.map((pt) => pt.y);
        const minX = Math.min(...xs);
        const minY = Math.min(...ys);
        return {
          ...p,
          polygonPoints: updated,
          bounds: {
            x: Math.round(minX),
            y: Math.round(minY),
            width: Math.round(Math.max(...xs) - minX),
            height: Math.round(Math.max(...ys) - minY),
          },
        };
      }),
    }));
  }

  function handleMovementPointChange(partId: string, point: { x: number; y: number }) {
    setRig((prev) => ({
      ...prev,
      parts: prev.parts.map((p) =>
        p.id === partId && !isPartEffectivelyLocked(p, prev.groups) ? { ...p, movementPoint: point } : p
      ),
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

  function handlePartReorderByDrag(sourcePartId: string, targetPartId: string, placeAfter: boolean) {
    setRig((prev) => {
      if (sourcePartId === targetPartId) return prev;
      const frontSorted = [...prev.parts].sort((a, b) => b.zIndex - a.zIndex);
      const sourceIndex = frontSorted.findIndex((p) => p.id === sourcePartId);
      const targetIndex = frontSorted.findIndex((p) => p.id === targetPartId);
      if (sourceIndex === -1 || targetIndex === -1) return prev;

      const reordered = [...frontSorted];
      const [moved] = reordered.splice(sourceIndex, 1);
      const normalizedTargetIndex = sourceIndex < targetIndex ? targetIndex - 1 : targetIndex;
      const insertIndex = placeAfter ? normalizedTargetIndex + 1 : normalizedTargetIndex;
      reordered.splice(insertIndex, 0, moved);

      return { ...prev, parts: reindexPartsFromFrontOrder(reordered) };
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
        if (p.id !== partId || isPartEffectivelyLocked(p, prev.groups)) return p;
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
        p.id === partId && !isPartEffectivelyLocked(p, prev.groups) ? { ...p, rotation: (p.rotation - 15 + 360) % 360 } : p
      ),
    }));
  }

  function handleRotateRight(partId: string) {
    setRig((prev) => ({
      ...prev,
      parts: prev.parts.map((p) =>
        p.id === partId && !isPartEffectivelyLocked(p, prev.groups) ? { ...p, rotation: (p.rotation + 15) % 360 } : p
      ),
    }));
  }

  function handleResetRotation(partId: string) {
    setRig((prev) => ({
      ...prev,
      parts: prev.parts.map((p) => (p.id === partId && !isPartEffectivelyLocked(p, prev.groups) ? { ...p, rotation: 0 } : p)),
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
            penPoints={penPoints}
            penClosed={penClosed}
            onPenAddPoint={handlePenAddPoint}
            onPenRemoveLastPoint={handlePenRemoveLastPoint}
            onPenComplete={handlePenComplete}
            onPenCancel={handlePenCancel}
            onPolygonPointChange={handlePolygonPointChange}
            onPolygonPointInsert={handlePolygonPointInsert}
            onPolygonPointDelete={handlePolygonPointDelete}
          />
        </div>

        <PartsSidebar
          parts={rig.parts}
          groups={rig.groups ?? []}
          selectedPartId={selectedPartId}
          onSelectPart={handleSelectPart}
          onCreateGroup={handleCreateGroup}
          onRenameGroup={handleRenameGroup}
          onDeleteGroup={handleDeleteGroup}
          onToggleGroupLock={handleToggleGroupLock}
          onToggleGroupExpanded={handleToggleGroupExpanded}
          onPartGroupChange={handlePartGroupChange}
          onPartParentChange={handlePartParentChange}
          onPartReorderByDrag={handlePartReorderByDrag}
          onDeletePart={handleDeletePart}
          onToggleLock={handleToggleLock}
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
