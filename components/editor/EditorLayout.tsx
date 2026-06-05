"use client";

import { useState, useEffect, useCallback, useRef, useReducer } from "react";
import Link from "next/link";
import EditorCanvas from "./EditorCanvas";
import PartsSidebar from "./PartsSidebar";
import TimelinePanel from "./TimelinePanel";
import Toolbar from "./Toolbar";
import NamePartDialog from "./NamePartDialog";
import { saveProject, loadProject, clearProject } from "@/lib/storage";
import { findGroupById, isPartEffectivelyLocked, isPartEffectivelyVisible } from "@/lib/layers";
import type { BoundingBox, CharacterRig, LayerGroup, Part, SavedPose, TimelineStep } from "@/types/rig";

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
type LayerOrderBlock = { type: "group" | "part"; id: string; partIds: string[] };

const LAST_SAVED_KEY = "simple2_5d_project_last_saved_at";

interface HistoryEntry {
  id: string;
  label: string;
  rig: CharacterRig;
  timestamp: number;
}

const MAX_HISTORY = 50;

type HistAction =
  | { type: "commit"; entry: HistoryEntry }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "init"; rig: CharacterRig; label: string };

interface HistReducerState {
  entries: HistoryEntry[];
  index: number;
}

function histReducer(state: HistReducerState, action: HistAction): HistReducerState {
  switch (action.type) {
    case "commit": {
      const trimmed = state.entries.slice(0, state.index + 1);
      const next = [...trimmed, action.entry].slice(-MAX_HISTORY);
      return { entries: next, index: next.length - 1 };
    }
    case "undo":
      return state.index > 0 ? { ...state, index: state.index - 1 } : state;
    case "redo":
      return state.index < state.entries.length - 1
        ? { ...state, index: state.index + 1 }
        : state;
    case "init":
      return {
        entries: [{ id: crypto.randomUUID(), label: action.label, rig: action.rig, timestamp: Date.now() }],
        index: 0,
      };
    default:
      return state;
  }
}

function formatSaveLabel(lastSavedAt: number | null, hasUnsavedChanges: boolean, now: number): string {
  if (!hasUnsavedChanges && lastSavedAt !== null) {
    const d = new Date(lastSavedAt);
    const p = (n: number) => String(n).padStart(2, "0");
    return `Last saved: ${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
  }
  if (lastSavedAt === null) return "Not saved";
  const mins = Math.floor((now - lastSavedAt) / 60_000);
  if (mins < 1) return "Unsaved changes less than 1 minute ago";
  if (mins === 1) return "Unsaved changes 1 minute ago";
  return `Unsaved changes ${mins} minutes ago`;
}

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

function buildLayerBlocks(parts: Part[], groups: LayerGroup[]): LayerOrderBlock[] {
  const validGroupIds = new Set(groups.map((group) => group.id));
  const frontSorted = [...parts].sort((a, b) => b.zIndex - a.zIndex);
  const seenGroupIds = new Set<string>();
  const blocks: LayerOrderBlock[] = [];

  for (const part of frontSorted) {
    if (part.groupId && validGroupIds.has(part.groupId)) {
      if (seenGroupIds.has(part.groupId)) continue;
      seenGroupIds.add(part.groupId);
      blocks.push({
        type: "group",
        id: part.groupId,
        partIds: frontSorted
          .filter((item) => item.groupId === part.groupId)
          .map((item) => item.id),
      });
      continue;
    }

    blocks.push({ type: "part", id: part.id, partIds: [part.id] });
  }

  return blocks;
}

export default function EditorLayout({ characterName, freshStart = false }: EditorLayoutProps) {
  const [rig, setRig] = useState<CharacterRig>({
    name: characterName,
    parts: [],
    imageDataUrl: null,
    groups: [],
  });

  const [activeTool, setActiveTool] = useState<"select" | "move" | "point" | "pen">("select");
  const [showStructure, setShowStructure] = useState(false);
  const [selectedPartId, setSelectedPartId] = useState<string | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [stageTransform, setStageTransform] = useState<StageTransform>({ x: 0, y: 0, scale: 1 });
  const [resetKey, setResetKey] = useState(0);
  const [pendingBounds, setPendingBounds] = useState<BoundingBox | null>(null);
  const [penPoints, setPenPoints] = useState<{ x: number; y: number }[]>([]);
  const [penClosed, setPenClosed] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(() => {
    if (typeof window === "undefined") return null;
    try { const v = localStorage.getItem(LAST_SAVED_KEY); return v ? parseInt(v, 10) : null; } catch { return null; }
  });
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [nowTick, setNowTick] = useState(() => Date.now());
  // Prevents marking unsaved during the initial project load
  const initDoneRef = useRef(false);

  const [hist, dispatchHist] = useReducer(histReducer, { entries: [], index: -1 });
  const [pendingHistCommit, setPendingHistCommit] = useState<string | null>(null);

  // Animation preview — transient, never saved or committed to history
  const [previewRotations, setPreviewRotations] = useState<Record<string, number> | null>(null);
  const [isTimelinePlaying, setIsTimelinePlaying] = useState(false);
  const previewRafRef = useRef<number | null>(null);
  const previewConfigRef = useRef<{
    fromRotations: Record<string, number>;
    toRotations: Record<string, number>;
    duration: number;
    loop: boolean;
    startTime: number;
  } | null>(null);
  const timelineConfigRef = useRef<{
    stepRotations: Record<string, number>[];
    durations: number[];
    loop: boolean;
    startTime: number;
  } | null>(null);

  function stopPreview() {
    if (previewRafRef.current !== null) {
      cancelAnimationFrame(previewRafRef.current);
      previewRafRef.current = null;
    }
    previewConfigRef.current = null;
    timelineConfigRef.current = null;
    setPreviewRotations(null);
    setIsTimelinePlaying(false);
  }

  function commitRig(nextRig: CharacterRig, label: string) {
    stopPreview();
    dispatchHist({
      type: "commit",
      entry: { id: crypto.randomUUID(), label, rig: nextRig, timestamp: Date.now() },
    });
    setRig(nextRig);
  }

  function handleUndo() {
    if (hist.index <= 0) return;
    const target = hist.entries[hist.index - 1];
    dispatchHist({ type: "undo" });
    setRig(target.rig);
  }

  function handleRedo() {
    if (hist.index >= hist.entries.length - 1) return;
    const target = hist.entries[hist.index + 1];
    dispatchHist({ type: "redo" });
    setRig(target.rig);
  }

  function handleHistoryJump(index: number) {
    if (index < 0 || index >= hist.entries.length || index === hist.index) return;
    const target = hist.entries[index];
    if (index < hist.index) {
      // undo to that index
      for (let i = 0; i < hist.index - index; i++) dispatchHist({ type: "undo" });
    } else {
      for (let i = 0; i < index - hist.index; i++) dispatchHist({ type: "redo" });
    }
    setRig(target.rig);
  }

  // Auto-load saved project on mount — skipped when freshStart is set (?new=1)
  useEffect(() => {
    let initialRig: CharacterRig = { name: characterName, parts: [], imageDataUrl: null, groups: [] };
    if (!freshStart) {
      const saved = loadProject();
      if (saved) {
        initialRig = saved;
        setRig(saved);
      }
    }
    dispatchHist({ type: "init", rig: initialRig, label: "Initial state" });
    // Delay so the rig change effect above skips the initial load render
    const t = setTimeout(() => { initDoneRef.current = true; }, 0);
    return () => clearTimeout(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Mark unsaved whenever rig mutates after the initial load has settled
  useEffect(() => {
    if (!initDoneRef.current) return;
    setHasUnsavedChanges(true);
  }, [rig]);

  // Drive relative-time updates for the save label (every 60 s is enough for minute granularity)
  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

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

  // Commit a single history entry after a drag operation that called setRig directly
  useEffect(() => {
    if (!pendingHistCommit) return;
    const label = pendingHistCommit;
    setPendingHistCommit(null);
    const current = hist.index >= 0 ? hist.entries[hist.index] : null;
    if (current && current.rig === rig) return;
    dispatchHist({
      type: "commit",
      entry: { id: crypto.randomUUID(), label, rig, timestamp: Date.now() },
    });
  }, [pendingHistCommit]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keyboard shortcuts for undo / redo
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const isCtrl = e.ctrlKey || e.metaKey;
      if (!isCtrl) return;
      if (e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        if (hist.index > 0) {
          const target = hist.entries[hist.index - 1];
          dispatchHist({ type: "undo" });
          setRig(target.rig);
        }
      } else if ((e.key === "z" && e.shiftKey) || e.key === "y") {
        e.preventDefault();
        if (hist.index < hist.entries.length - 1) {
          const target = hist.entries[hist.index + 1];
          dispatchHist({ type: "redo" });
          setRig(target.rig);
        }
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [hist]); // eslint-disable-line react-hooks/exhaustive-deps

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
    commitRig({ ...rig, imageDataUrl: dataUrl }, "Upload image");
  }

  function handleSave() {
    const result = saveProject(rig);
    setSaveStatus(result === "ok" ? "saved" : result === "empty" ? "empty" : "error");
    if (result === "ok") {
      const now = Date.now();
      setLastSavedAt(now);
      setHasUnsavedChanges(false);
      setNowTick(now);
      try { localStorage.setItem(LAST_SAVED_KEY, String(now)); } catch {}
    }
  }

  function handleClearRequest() {
    setShowClearConfirm(true);
  }

  function handleConfirmClear() {
    const clearedRig: CharacterRig = { name: characterName, parts: [], imageDataUrl: null, groups: [] };
    clearProject();
    try { localStorage.removeItem(LAST_SAVED_KEY); } catch {}
    setRig(clearedRig);
    dispatchHist({ type: "init", rig: clearedRig, label: "Clear project" });
    setSelectedPartId(null);
    setSelectedGroupId(null);
    setStageTransform({ x: 0, y: 0, scale: 1 });
    setShowClearConfirm(false);
    setSaveStatus("idle");
    setLastSavedAt(null);
    setHasUnsavedChanges(false);
  }

  function handleSelectionComplete(bounds: BoundingBox) {
    setPendingBounds(bounds);
  }

  function handleCreatePart(name: string) {
    if (!pendingBounds) return;
    const partName = name.trim() || "Part";
    const newPart: Part = {
      id: crypto.randomUUID(),
      name: partName,
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
    commitRig({ ...rig, parts: [...rig.parts, newPart] }, `Create part: ${partName}`);
    setSelectedPartId(newPart.id);
    setSelectedGroupId(null);
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
      setSelectedGroupId(null);
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
    setSelectedGroupId(null);
  }

  function handleSelectGroup(groupId: string | null) {
    if (!groupId) {
      setSelectedGroupId(null);
      setSelectedPartId(null);
      return;
    }

    setRig((prev) => ({
      ...prev,
      groups: (prev.groups ?? []).map((group) =>
        group.id === groupId ? { ...group, isExpanded: true } : group
      ),
    }));
    setSelectedGroupId(groupId);
    setSelectedPartId(null);
  }

  function handleDeletePart(id: string) {
    const part = rig.parts.find((p) => p.id === id);
    if (!part || isPartEffectivelyLocked(part, rig.groups)) return;
    commitRig({
      ...rig,
      parts: rig.parts.filter((p) => p.id !== id).map((p) => (p.parentId === id ? { ...p, parentId: null } : p)),
    }, `Delete part: ${part.name}`);
    if (selectedPartId === id) setSelectedPartId(null);
  }

  function handleToggleVisibility(id: string) {
    const part = rig.parts.find((p) => p.id === id);
    commitRig({
      ...rig,
      parts: rig.parts.map((p) => (p.id === id ? { ...p, isVisible: !p.isVisible } : p)),
    }, `${part?.isVisible ? "Hide" : "Show"} part`);
  }

  function handleToggleLock(id: string) {
    const part = rig.parts.find((p) => p.id === id);
    commitRig({
      ...rig,
      parts: rig.parts.map((p) => (p.id === id ? { ...p, isLocked: !(p.isLocked ?? false) } : p)),
    }, `${part?.isLocked ? "Unlock" : "Lock"} part`);
  }

  function handleCreateGroup() {
    const newGroup: LayerGroup = {
      id: crypto.randomUUID(),
      name: `Folder ${((rig.groups ?? []).length + 1)}`,
      isLocked: false,
      isExpanded: true,
      isVisible: true,
    };
    commitRig({ ...rig, groups: [...(rig.groups ?? []), newGroup] }, "Create folder");
  }

  function handleRenameGroup(groupId: string, name: string) {
    const nextName = name.trim();
    if (!nextName) return;
    commitRig({
      ...rig,
      groups: (rig.groups ?? []).map((group) => group.id === groupId ? { ...group, name: nextName } : group),
    }, "Rename folder");
  }

  function handleDeleteGroup(groupId: string) {
    const group = (rig.groups ?? []).find((g) => g.id === groupId);
    commitRig({
      ...rig,
      groups: (rig.groups ?? []).filter((g) => g.id !== groupId),
      parts: rig.parts.map((part) => (part.groupId === groupId ? { ...part, groupId: null } : part)),
    }, `Delete folder: ${group?.name ?? "folder"}`);
    if (selectedGroupId === groupId) setSelectedGroupId(null);
  }

  function handleToggleGroupLock(groupId: string) {
    const group = (rig.groups ?? []).find((g) => g.id === groupId);
    commitRig({
      ...rig,
      groups: (rig.groups ?? []).map((g) => g.id === groupId ? { ...g, isLocked: !g.isLocked } : g),
    }, `${group?.isLocked ? "Unlock" : "Lock"} folder`);
  }

  function handleToggleGroupExpanded(groupId: string) {
    setRig((prev) => ({
      ...prev,
      groups: (prev.groups ?? []).map((group) =>
        group.id === groupId ? { ...group, isExpanded: !group.isExpanded } : group
      ),
    }));
  }

  function handleToggleGroupVisibility(groupId: string) {
    const group = (rig.groups ?? []).find((g) => g.id === groupId);
    commitRig({
      ...rig,
      groups: (rig.groups ?? []).map((g) =>
        g.id === groupId ? { ...g, isVisible: g.isVisible === false ? true : false } : g
      ),
    }, `${group?.isVisible === false ? "Show" : "Hide"} folder`);
  }

  function handlePartGroupChange(partId: string, groupId: string) {
    const part = rig.parts.find((item) => item.id === partId);
    if (!part) return;
    const nextGroupId = groupId || null;
    if (part.groupId === nextGroupId) return;
    if (nextGroupId && !findGroupById(rig.groups, nextGroupId)) return;
    commitRig({
      ...rig,
      groups: (rig.groups ?? []).map((group) =>
        group.id === nextGroupId ? { ...group, isExpanded: true } : group
      ),
      parts: rig.parts.map((item) => (item.id === partId ? { ...item, groupId: nextGroupId } : item)),
    }, nextGroupId ? "Move part to folder" : "Remove part from folder");
  }

  function handlePartRename(partId: string, name: string) {
    const nextName = name.trim() || "Untitled part";
    commitRig({
      ...rig,
      parts: rig.parts.map((part) => (part.id === partId ? { ...part, name: nextName } : part)),
    }, `Rename part: ${nextName}`);
  }

  function handlePartParentChange(partId: string, parentId: string) {
    const nextParentId = parentId || null;
    const part = rig.parts.find((p) => p.id === partId);
    if (!part) return;
    if (isPartEffectivelyLocked(part, rig.groups)) return;
    if (part.parentId === nextParentId) return;
    if (nextParentId !== null) {
      if (nextParentId === partId) return;
      if (!rig.parts.some((p) => p.id === nextParentId)) return;
      if (wouldCreateParentCycle(rig.parts, partId, nextParentId)) return;
    }
    const parentName = nextParentId ? rig.parts.find((p) => p.id === nextParentId)?.name : null;
    commitRig({
      ...rig,
      parts: rig.parts.map((p) => (p.id === partId ? { ...p, parentId: nextParentId } : p)),
    }, parentName ? `Set follows: ${parentName}` : "Clear follows");
  }

  function handleRemovePartLink(partId: string) {
    const part = rig.parts.find((p) => p.id === partId);
    if (!part) return;
    if (part.parentId === null) return;
    if (isPartEffectivelyLocked(part, rig.groups)) return;
    commitRig({
      ...rig,
      parts: rig.parts.map((p) => (p.id === partId ? { ...p, parentId: null } : p)),
    }, "Removed follows");
  }

  function handlePolygonPointChange(
    partId: string,
    pointIndex: number,
    nextPoint: { x: number; y: number }
  ) {
    const nextParts = rig.parts.map((p) => {
      if (p.id !== partId || !p.polygonPoints || isPartEffectivelyLocked(p, rig.groups)) return p;
      const updated = p.polygonPoints.map((pt, i) =>
        i === pointIndex ? { x: Math.round(nextPoint.x), y: Math.round(nextPoint.y) } : pt
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
      };
    });
    commitRig({ ...rig, parts: nextParts }, "Edit polygon vertex");
  }

  function handlePolygonPointDelete(partId: string, pointIndex: number) {
    const nextParts = rig.parts.map((p) => {
      if (p.id !== partId || !p.polygonPoints || p.polygonPoints.length <= 3 || isPartEffectivelyLocked(p, rig.groups)) return p;
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
      };
    });
    commitRig({ ...rig, parts: nextParts }, "Delete polygon vertex");
  }

  function handlePolygonPointInsert(
    partId: string,
    afterIndex: number,
    point: { x: number; y: number }
  ) {
    const nextParts = rig.parts.map((p) => {
      if (p.id !== partId || !p.polygonPoints || p.polygonPoints.length < 3 || isPartEffectivelyLocked(p, rig.groups)) return p;
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
    });
    commitRig({ ...rig, parts: nextParts }, "Insert polygon vertex");
  }

  function handleMovementPointChange(partId: string, point: { x: number; y: number }) {
    commitRig({
      ...rig,
      parts: rig.parts.map((p) =>
        p.id === partId && !isPartEffectivelyLocked(p, rig.groups) ? { ...p, movementPoint: point } : p
      ),
    }, "Move rotation point");
  }

  function handleMovePartToFront(partId: string) {
    const sorted = [...rig.parts].sort((a, b) => a.zIndex - b.zIndex);
    const idx = sorted.findIndex((p) => p.id === partId);
    if (idx === -1 || idx === sorted.length - 1) return;
    const part = sorted.splice(idx, 1)[0];
    sorted.push(part);
    commitRig({ ...rig, parts: sorted.map((p, i) => ({ ...p, zIndex: i })) }, "Move part to front");
  }

  function handlePartReorderByDrag(sourcePartId: string, targetPartId: string, placeAfter: boolean) {
    if (sourcePartId === targetPartId) return;
    const frontSorted = [...rig.parts].sort((a, b) => b.zIndex - a.zIndex);
    const sourceIndex = frontSorted.findIndex((p) => p.id === sourcePartId);
    const targetIndex = frontSorted.findIndex((p) => p.id === targetPartId);
    if (sourceIndex === -1 || targetIndex === -1) return;
    const reordered = [...frontSorted];
    const [moved] = reordered.splice(sourceIndex, 1);
    const normalizedTargetIndex = sourceIndex < targetIndex ? targetIndex - 1 : targetIndex;
    const insertIndex = placeAfter ? normalizedTargetIndex + 1 : normalizedTargetIndex;
    reordered.splice(insertIndex, 0, moved);
    commitRig({ ...rig, parts: reindexPartsFromFrontOrder(reordered) }, "Reorder parts");
  }

  function handleGroupReorderByDrag(
    sourceGroupId: string,
    targetId: string,
    targetType: "group" | "part",
    placeAfter: boolean
  ) {
    const blocks = buildLayerBlocks(rig.parts, rig.groups ?? []);
    const sourceIndex = blocks.findIndex((block) => block.type === "group" && block.id === sourceGroupId);
    const targetIndex = blocks.findIndex((block) => block.type === targetType && block.id === targetId);
    if (sourceIndex === -1 || targetIndex === -1) return;
    const reorderedBlocks = [...blocks];
    const [movedBlock] = reorderedBlocks.splice(sourceIndex, 1);
    const normalizedTargetIndex = sourceIndex < targetIndex ? targetIndex - 1 : targetIndex;
    const insertIndex = placeAfter ? normalizedTargetIndex + 1 : normalizedTargetIndex;
    reorderedBlocks.splice(insertIndex, 0, movedBlock);
    const partById = new Map(rig.parts.map((part) => [part.id, part]));
    const reorderedParts = reorderedBlocks
      .flatMap((block) => block.partIds)
      .map((partId) => partById.get(partId))
      .filter((part): part is Part => !!part);
    commitRig({ ...rig, parts: reindexPartsFromFrontOrder(reorderedParts) }, "Reorder folders");
  }

  function handleMovePartUp(partId: string) {
    const sorted = [...rig.parts].sort((a, b) => a.zIndex - b.zIndex);
    const idx = sorted.findIndex((p) => p.id === partId);
    if (idx === -1 || idx === sorted.length - 1) return;
    [sorted[idx], sorted[idx + 1]] = [sorted[idx + 1], sorted[idx]];
    commitRig({ ...rig, parts: sorted.map((p, i) => ({ ...p, zIndex: i })) }, "Move part up");
  }

  function handleMovePartDown(partId: string) {
    const sorted = [...rig.parts].sort((a, b) => a.zIndex - b.zIndex);
    const idx = sorted.findIndex((p) => p.id === partId);
    if (idx <= 0) return;
    [sorted[idx], sorted[idx - 1]] = [sorted[idx - 1], sorted[idx]];
    commitRig({ ...rig, parts: sorted.map((p, i) => ({ ...p, zIndex: i })) }, "Move part down");
  }

  function handleMovePartToBack(partId: string) {
    const sorted = [...rig.parts].sort((a, b) => a.zIndex - b.zIndex);
    const idx = sorted.findIndex((p) => p.id === partId);
    if (idx <= 0) return;
    const part = sorted.splice(idx, 1)[0];
    sorted.unshift(part);
    commitRig({ ...rig, parts: sorted.map((p, i) => ({ ...p, zIndex: i })) }, "Move part to back");
  }

  function handleResetMovementPoint(partId: string) {
    commitRig({
      ...rig,
      parts: rig.parts.map((p) => {
        if (p.id !== partId || isPartEffectivelyLocked(p, rig.groups)) return p;
        return {
          ...p,
          movementPoint: {
            x: Math.round(p.bounds.x + p.bounds.width / 2),
            y: Math.round(p.bounds.y + p.bounds.height / 2),
          },
        };
      }),
    }, "Centered rotation point");
  }

  function handleMovePointToParent(partId: string) {
    const part = rig.parts.find((p) => p.id === partId);
    if (!part || !part.parentId) return;
    if (isPartEffectivelyLocked(part, rig.groups)) return;
    const parent = rig.parts.find((p) => p.id === part.parentId);
    if (!parent) return;
    if (!isPartEffectivelyVisible(parent, rig.groups)) return;
    commitRig({
      ...rig,
      parts: rig.parts.map((p) =>
        p.id === partId ? { ...p, movementPoint: { ...parent.movementPoint } } : p
      ),
    }, "Moved rotation point");
  }

  function handleSavePose() {
    const existingPoses = rig.poses ?? [];
    const usedNums = existingPoses
      .map((p) => { const m = p.name.match(/^Pose (\d+)$/); return m ? parseInt(m[1], 10) : 0; })
      .filter((n) => n > 0);
    const nextNum = usedNums.length > 0 ? Math.max(...usedNums) + 1 : 1;
    const rotations: Record<string, number> = {};
    for (const part of rig.parts) rotations[part.id] = part.rotation;
    const newPose: SavedPose = {
      id: crypto.randomUUID(),
      name: `Pose ${nextNum}`,
      rotations,
      createdAt: Date.now(),
    };
    commitRig({ ...rig, poses: [...existingPoses, newPose] }, "Saved pose");
  }

  function handleApplyPose(poseId: string) {
    const pose = (rig.poses ?? []).find((p) => p.id === poseId);
    if (!pose) return;
    commitRig({
      ...rig,
      parts: rig.parts.map((p) => {
        if (isPartEffectivelyLocked(p, rig.groups)) return p;
        if (pose.rotations[p.id] === undefined) return p;
        return { ...p, rotation: pose.rotations[p.id] };
      }),
    }, "Applied pose");
  }

  function handleRenamePose(poseId: string, name: string) {
    const poses = rig.poses ?? [];
    const pose = poses.find((p) => p.id === poseId);
    if (!pose) return;
    const finalName = name.trim() || "Untitled pose";
    if (pose.name === finalName) return;
    commitRig(
      { ...rig, poses: poses.map((p) => (p.id === poseId ? { ...p, name: finalName } : p)) },
      "Renamed pose"
    );
  }

  function handleDeletePose(poseId: string) {
    const poses = rig.poses ?? [];
    if (!poses.some((p) => p.id === poseId)) return;
    commitRig(
      {
        ...rig,
        poses: poses.filter((p) => p.id !== poseId),
        timeline: (rig.timeline ?? []).filter((s) => s.poseId !== poseId),
      },
      "Deleted pose"
    );
  }

  function handleStartPreview(
    fromPoseId: string,
    toPoseId: string,
    durationSecs: number,
    loop: boolean
  ) {
    const poses = rig.poses ?? [];
    const fromPose = poses.find((p) => p.id === fromPoseId);
    const toPose = poses.find((p) => p.id === toPoseId);
    if (!fromPose || !toPose || fromPoseId === toPoseId) return;

    // Cancel any in-flight RAF before starting fresh
    if (previewRafRef.current !== null) cancelAnimationFrame(previewRafRef.current);

    previewConfigRef.current = {
      fromRotations: fromPose.rotations,
      toRotations: toPose.rotations,
      duration: durationSecs,
      loop,
      startTime: performance.now(),
    };

    function tick(now: number) {
      const cfg = previewConfigRef.current;
      if (!cfg) return;
      const elapsed = (now - cfg.startTime) / 1000;
      let t = Math.min(elapsed / cfg.duration, 1);

      if (t >= 1) {
        if (cfg.loop) {
          cfg.startTime = now;
          t = 0;
        } else {
          t = 1;
          previewRafRef.current = null;
          previewConfigRef.current = null;
        }
      }

      const next: Record<string, number> = {};
      for (const id of Object.keys(cfg.fromRotations)) {
        if (cfg.toRotations[id] !== undefined) {
          next[id] = cfg.fromRotations[id] + (cfg.toRotations[id] - cfg.fromRotations[id]) * t;
        } else {
          next[id] = cfg.fromRotations[id];
        }
      }
      setPreviewRotations(next);

      if (previewConfigRef.current !== null) {
        previewRafRef.current = requestAnimationFrame(tick);
      }
    }

    previewRafRef.current = requestAnimationFrame(tick);
  }

  function handleStopPreview() {
    stopPreview();
  }

  function handleAddTimelineStep(poseId: string) {
    const poses = rig.poses ?? [];
    if (!poses.some((p) => p.id === poseId)) return;
    const step: TimelineStep = { id: crypto.randomUUID(), poseId, duration: 1 };
    commitRig({ ...rig, timeline: [...(rig.timeline ?? []), step] }, "Added timeline step");
  }

  function handleRemoveTimelineStep(stepId: string) {
    const timeline = rig.timeline ?? [];
    if (!timeline.some((s) => s.id === stepId)) return;
    commitRig(
      { ...rig, timeline: timeline.filter((s) => s.id !== stepId) },
      "Removed timeline step"
    );
  }

  function handleReorderTimelineStep(stepId: string, direction: "up" | "down") {
    const timeline = [...(rig.timeline ?? [])];
    const idx = timeline.findIndex((s) => s.id === stepId);
    if (idx < 0) return;
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= timeline.length) return;
    [timeline[idx], timeline[swapIdx]] = [timeline[swapIdx], timeline[idx]];
    commitRig({ ...rig, timeline }, "Reordered timeline");
  }

  function handleChangeTimelineStepDuration(stepId: string, duration: number) {
    const timeline = rig.timeline ?? [];
    if (!timeline.some((s) => s.id === stepId)) return;
    commitRig(
      {
        ...rig,
        timeline: timeline.map((s) =>
          s.id === stepId ? { ...s, duration: Math.max(0.1, duration) } : s
        ),
      },
      "Changed timeline duration"
    );
  }

  function handlePlayTimeline(loop: boolean) {
    const poses = rig.poses ?? [];
    const timeline = rig.timeline ?? [];
    if (timeline.length < 2) return;

    const stepRotations = timeline.map((step) => {
      const pose = poses.find((p) => p.id === step.poseId);
      return pose ? { ...pose.rotations } : {};
    });
    const durations = timeline.map((s) => Math.max(0.1, s.duration));

    if (previewRafRef.current !== null) cancelAnimationFrame(previewRafRef.current);
    previewConfigRef.current = null;

    timelineConfigRef.current = { stepRotations, durations, loop, startTime: performance.now() };
    setIsTimelinePlaying(true);

    function timelineTick(now: number) {
      const cfg = timelineConfigRef.current;
      if (!cfg) return;

      const N = cfg.stepRotations.length;
      const segCount = cfg.loop ? N : N - 1;
      const totalDur = cfg.durations.slice(0, segCount).reduce((a, b) => a + b, 0);
      if (totalDur <= 0) return;

      const elapsed = (now - cfg.startTime) / 1000;

      if (!cfg.loop && elapsed >= totalDur) {
        setPreviewRotations({ ...cfg.stepRotations[N - 1] });
        previewRafRef.current = null;
        return;
      }

      const t = cfg.loop ? elapsed % totalDur : Math.min(elapsed, totalDur);

      let segStart = 0;
      let fromIdx = 0;
      let localT = 0;
      for (let i = 0; i < segCount; i++) {
        const segEnd = segStart + cfg.durations[i];
        if (t < segEnd || i === segCount - 1) {
          fromIdx = i;
          const segDur = cfg.durations[i];
          localT = segDur > 0 ? Math.min((t - segStart) / segDur, 1) : 1;
          break;
        }
        segStart = segEnd;
      }

      const toIdx = (fromIdx + 1) % N;
      const from = cfg.stepRotations[fromIdx];
      const to = cfg.stepRotations[toIdx];

      const next: Record<string, number> = {};
      for (const id of Object.keys(from)) {
        next[id] = to[id] !== undefined ? from[id] + (to[id] - from[id]) * localT : from[id];
      }
      setPreviewRotations(next);

      if (timelineConfigRef.current !== null) {
        previewRafRef.current = requestAnimationFrame(timelineTick);
      }
    }

    previewRafRef.current = requestAnimationFrame(timelineTick);
  }

  function handleRotateLeft(partId: string) {
    commitRig({
      ...rig,
      parts: rig.parts.map((p) =>
        p.id === partId && !isPartEffectivelyLocked(p, rig.groups) ? { ...p, rotation: (p.rotation - 15 + 360) % 360 } : p
      ),
    }, "Rotate left");
  }

  function handleRotateRight(partId: string) {
    commitRig({
      ...rig,
      parts: rig.parts.map((p) =>
        p.id === partId && !isPartEffectivelyLocked(p, rig.groups) ? { ...p, rotation: (p.rotation + 15) % 360 } : p
      ),
    }, "Rotate right");
  }

  function handleResetRotation(partId: string) {
    commitRig({
      ...rig,
      parts: rig.parts.map((p) =>
        p.id === partId && !isPartEffectivelyLocked(p, rig.groups) ? { ...p, rotation: 0 } : p
      ),
    }, "Reset rotation");
  }

  function handleMoveGroup(groupId: string, dx: number, dy: number) {
    setRig((prev) => {
      const group = findGroupById(prev.groups, groupId);
      if (!group) return prev;

      const groupParts = prev.parts.filter((part) => part.groupId === groupId && isPartEffectivelyVisible(part, prev.groups));
      if (groupParts.length === 0) return prev;
      if (groupParts.some((part) => isPartEffectivelyLocked(part, prev.groups))) return prev;

      return {
        ...prev,
        parts: prev.parts.map((part) => {
          if (part.groupId !== groupId || !isPartEffectivelyVisible(part, prev.groups)) return part;
          return {
            ...part,
            bounds: {
              ...part.bounds,
              x: part.bounds.x + dx,
              y: part.bounds.y + dy,
            },
            movementPoint: {
              x: part.movementPoint.x + dx,
              y: part.movementPoint.y + dy,
            },
            polygonPoints: part.polygonPoints?.map((point) => ({
              x: point.x + dx,
              y: point.y + dy,
            })) ?? part.polygonPoints,
          };
        }),
      };
    });
  }

  function handleGroupDragEnd() {
    setPendingHistCommit("Move folder");
  }

  function handlePartLink(childId: string, parentId: string) {
    if (childId === parentId) return;
    const child = rig.parts.find((p) => p.id === childId);
    const parent = rig.parts.find((p) => p.id === parentId);
    if (!child || !parent) return;
    if (!isPartEffectivelyVisible(parent, rig.groups)) return;
    if (isPartEffectivelyLocked(parent, rig.groups)) return;
    if (isPartEffectivelyLocked(child, rig.groups)) return;
    if (wouldCreateParentCycle(rig.parts, childId, parentId)) return;
    commitRig(
      { ...rig, parts: rig.parts.map((p) => (p.id === childId ? { ...p, parentId } : p)) },
      "Changed follows"
    );
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
              {hasContent && (
                <span className="text-xs text-zinc-600 select-none">
                  {formatSaveLabel(lastSavedAt, hasUnsavedChanges, nowTick)}
                </span>
              )}
              <button
                onClick={handleUndo}
                disabled={hist.index <= 0}
                title="Undo (Ctrl+Z)"
                className={`text-sm px-2 py-1.5 rounded transition-colors ${
                  hist.index <= 0
                    ? "text-zinc-700 cursor-not-allowed"
                    : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
                }`}
              >
                ↩
              </button>
              <button
                onClick={handleRedo}
                disabled={hist.index >= hist.entries.length - 1}
                title="Redo (Ctrl+Shift+Z)"
                className={`text-sm px-2 py-1.5 rounded transition-colors ${
                  hist.index >= hist.entries.length - 1
                    ? "text-zinc-700 cursor-not-allowed"
                    : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
                }`}
              >
                ↪
              </button>
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
        showStructure={showStructure}
        onToggleStructure={() => setShowStructure((v) => !v)}
      />

      {/* Main area */}
      <div className="flex flex-1 overflow-hidden">
        <div className="flex flex-col flex-1 overflow-hidden">
          <div className="flex-1 relative overflow-hidden">
          <EditorCanvas
            rig={rig}
            activeTool={activeTool}
            selectedPartId={selectedPartId}
            selectedGroupId={selectedGroupId}
            onImageUpload={handleImageUpload}
            onSelectionComplete={handleSelectionComplete}
            onSelectPart={handleSelectPart}
            onMovementPointChange={handleMovementPointChange}
            onMoveGroup={handleMoveGroup}
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
            onGroupDragEnd={handleGroupDragEnd}
            showStructure={showStructure}
            onPartLink={handlePartLink}
            previewRotations={previewRotations}
          />
          </div>

          <TimelinePanel
            poses={rig.poses ?? []}
            timeline={rig.timeline ?? []}
            isTimelinePlaying={isTimelinePlaying}
            onAddTimelineStep={handleAddTimelineStep}
            onRemoveTimelineStep={handleRemoveTimelineStep}
            onReorderTimelineStep={handleReorderTimelineStep}
            onChangeTimelineStepDuration={handleChangeTimelineStepDuration}
            onPlayTimeline={handlePlayTimeline}
            onStopPreview={handleStopPreview}
          />
        </div>

        <PartsSidebar
          parts={rig.parts}
          groups={rig.groups ?? []}
          selectedPartId={selectedPartId}
          selectedGroupId={selectedGroupId}
          onSelectPart={handleSelectPart}
          onSelectGroup={handleSelectGroup}
          onCreateGroup={handleCreateGroup}
          onRenameGroup={handleRenameGroup}
          onDeleteGroup={handleDeleteGroup}
          onToggleGroupLock={handleToggleGroupLock}
          onToggleGroupVisibility={handleToggleGroupVisibility}
          onToggleGroupExpanded={handleToggleGroupExpanded}
          onPartGroupChange={handlePartGroupChange}
          onPartRename={handlePartRename}
          onPartParentChange={handlePartParentChange}
          onRemovePartLink={handleRemovePartLink}
          onPartReorderByDrag={handlePartReorderByDrag}
          onGroupReorderByDrag={handleGroupReorderByDrag}
          onDeletePart={handleDeletePart}
          onToggleLock={handleToggleLock}
          onToggleVisibility={handleToggleVisibility}
          onResetMovementPoint={handleResetMovementPoint}
          onMovePointToParent={handleMovePointToParent}
          onMoveToFront={handleMovePartToFront}
          onMoveUp={handleMovePartUp}
          onMoveDown={handleMovePartDown}
          onMoveToBack={handleMovePartToBack}
          onRotateLeft={handleRotateLeft}
          onRotateRight={handleRotateRight}
          onResetRotation={handleResetRotation}
          poses={rig.poses ?? []}
          isPreviewPlaying={!isTimelinePlaying && (previewRafRef.current !== null || previewRotations !== null)}
          onStartPreview={handleStartPreview}
          onStopPreview={handleStopPreview}
          onSavePose={handleSavePose}
          onApplyPose={handleApplyPose}
          onRenamePose={handleRenamePose}
          onDeletePose={handleDeletePose}
          history={hist.entries}
          historyIndex={hist.index}
          onHistoryJump={handleHistoryJump}
        />
      </div>

      {/* Part naming dialog */}
      {pendingBounds && (
        <NamePartDialog onConfirm={handleCreatePart} onCancel={handleCancelPart} />
      )}
    </div>
  );
}
