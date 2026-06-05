"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import { Stage, Layer, Image as KonvaImage, Rect as KonvaRect, Circle as KonvaCircle, Line as KonvaLine } from "react-konva";
import type { KonvaEventObject } from "konva/lib/Node";
import type { Stage as StageType } from "konva/lib/Stage";
import { findGroupById, isPartEffectivelyLocked, isPartEffectivelyVisible } from "@/lib/layers";
import type { BoundingBox, CharacterRig, LayerGroup, Part, Point } from "@/types/rig";

const MIN_ZOOM = 0.05;
const DEPTH_STRENGTH = 0.25;
const MAX_ZOOM = 8;
const ZOOM_STEP = 0.15;
const MIN_SELECTION_PX = 5;
const MAX_ANCESTOR_DEPTH = 20;

// Visual constants for the movement-point indicator (screen pixels)
const PIVOT_RING_R = 6;
const PIVOT_ARM_LEN = 9;
// Link handle — offset from pivot center and its own radius (screen pixels)
const LINK_HANDLE_OFFSET = 11;
const LINK_HANDLE_R = 4.5;

interface StageTransform {
  x: number;
  y: number;
  scale: number;
}

interface Preview2d {
  enabled: boolean;
  viewX: number;
  viewY: number;
}

interface EditorCanvasProps {
  rig: CharacterRig;
  activeTool: "select" | "move" | "point" | "pen";
  selectedPartId: string | null;
  selectedGroupId: string | null;
  onImageUpload: (dataUrl: string) => void;
  onSelectionComplete: (bounds: BoundingBox) => void;
  onSelectPart: (id: string | null) => void;
  onMovementPointChange: (partId: string, point: Point) => void;
  onMoveGroup: (groupId: string, dx: number, dy: number) => void;
  stageTransform: StageTransform;
  onStageTransformChange: (t: StageTransform) => void;
  resetKey: number;
  penPoints: Point[];
  penClosed: boolean;
  onPenAddPoint: (pt: Point) => void;
  onPenRemoveLastPoint: () => void;
  onPenComplete: (points: Point[]) => void;
  onPenCancel: () => void;
  onPolygonPointChange: (partId: string, pointIndex: number, nextPoint: Point) => void;
  onPolygonPointInsert: (partId: string, afterIndex: number, point: Point) => void;
  onPolygonPointDelete: (partId: string, pointIndex: number) => void;
  onGroupDragBegin?: () => void;
  onGroupDragEnd?: () => void;
  showStructure?: boolean;
  onPartLink?: (childId: string, parentId: string) => void;
  previewRotations?: Record<string, number> | null;
  preview2d?: Preview2d | null;
}

interface LinkDrag {
  fromPos: Point;
  currentPos: Point;
  hoverTargetId: string | null;
}

interface HoveredEdge {
  partId: string;
  edgeIndex: number;
  /** Unrotated image-local coord to insert into polygonPoints */
  insertPoint: Point;
  /** Display (layer) coords of the edge endpoints — for rendering the highlight */
  displayA: Point;
  displayB: Point;
  /** Display (layer) coord of the closest point on the edge — for the insertion marker */
  displayInsert: Point;
}

interface LiveVertex {
  partId: string;
  idx: number;
  /** Layer (image-local) position of the circle during drag — used as the circle's x/y prop */
  stagePos: Point;
  /** Inverse-rotated polygon coordinate — used to update KonvaLine points live */
  polygonPos: Point;
}

function inverseRotatePoint(point: Point, pivot: Point, rotation: number): Point {
  const rad = (rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const dx = point.x - pivot.x;
  const dy = point.y - pivot.y;
  return {
    x: cos * dx + sin * dy + pivot.x,
    y: -sin * dx + cos * dy + pivot.y,
  };
}

function rotatePoint(point: Point, pivot: Point, rotation: number): Point {
  const rad = (rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const dx = point.x - pivot.x;
  const dy = point.y - pivot.y;
  return {
    x: cos * dx - sin * dy + pivot.x,
    y: sin * dx + cos * dy + pivot.y,
  };
}

/** Returns ancestor chain from root down to immediate parent (not including `partId` itself). */
function getAncestorChain(parts: Part[], partId: string): Part[] {
  const chain: Part[] = [];
  const seen = new Set<string>();
  let current = parts.find((p) => p.id === partId);
  while (current?.parentId) {
    if (seen.has(current.parentId)) break; // cycle guard
    seen.add(current.parentId);
    const parent = parts.find((p) => p.id === current!.parentId);
    if (!parent || chain.length >= MAX_ANCESTOR_DEPTH) break;
    chain.unshift(parent); // prepend → chain is root-first order
    current = parent;
  }
  return chain;
}

/** Applies each ancestor's rotation (root first) to point `p`, respecting world-space pivots. */
function applyAncestorTransform(p: Point, ancestors: Part[]): Point {
  if (ancestors.length === 0) return p;
  // Pre-compute each ancestor's movementPoint in world space
  const worldMPs: Point[] = [];
  for (let i = 0; i < ancestors.length; i++) {
    let wmp = ancestors[i].movementPoint;
    for (let j = 0; j < i; j++) {
      wmp = rotatePoint(wmp, worldMPs[j], ancestors[j].rotation);
    }
    worldMPs.push(wmp);
  }
  let result = p;
  for (let i = 0; i < ancestors.length; i++) {
    result = rotatePoint(result, worldMPs[i], ancestors[i].rotation);
  }
  return result;
}

/** Inverse of applyAncestorTransform — world position → image-local. */
function inverseAncestorTransform(p: Point, ancestors: Part[]): Point {
  if (ancestors.length === 0) return p;
  const worldMPs: Point[] = [];
  for (let i = 0; i < ancestors.length; i++) {
    let wmp = ancestors[i].movementPoint;
    for (let j = 0; j < i; j++) {
      wmp = rotatePoint(wmp, worldMPs[j], ancestors[j].rotation);
    }
    worldMPs.push(wmp);
  }
  let result = p;
  for (let i = ancestors.length - 1; i >= 0; i--) {
    result = rotatePoint(result, worldMPs[i], -ancestors[i].rotation);
  }
  return result;
}

function isPointOnSegment(point: Point, a: Point, b: Point): boolean {
  const cross = (point.y - a.y) * (b.x - a.x) - (point.x - a.x) * (b.y - a.y);
  if (Math.abs(cross) > 1e-6) return false;

  const dot = (point.x - a.x) * (b.x - a.x) + (point.y - a.y) * (b.y - a.y);
  if (dot < 0) return false;

  const lenSq = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
  return dot <= lenSq;
}

function isPointInPolygon(point: Point, polygon: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[j];
    const b = polygon[i];

    if (isPointOnSegment(point, a, b)) return true;

    const intersects =
      (a.y > point.y) !== (b.y > point.y) &&
      point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x;

    if (intersects) inside = !inside;
  }

  return inside;
}

type DepthOffFn = (part: Part) => { ox: number; oy: number };

function isPointInPart(
  point: Point,
  part: Part,
  allParts?: Part[],
  depthOffFn?: DepthOffFn
): boolean {
  // Subtract the depth offset so the test point is back in the part's unshifted coordinate space
  const { ox = 0, oy = 0 } = depthOffFn?.(part) ?? { ox: 0, oy: 0 };
  const testPoint = { x: point.x - ox, y: point.y - oy };

  const ancestors = allParts ? getAncestorChain(allParts, part.id) : [];

  if (ancestors.length > 0 && ancestors.some((a) => a.rotation !== 0)) {
    return isPointInPolygon(testPoint, getPartDisplayPoints(part, allParts));
  }

  const unrotatedPoint = inverseRotatePoint(testPoint, part.movementPoint, part.rotation);

  if (part.polygonPoints && part.polygonPoints.length >= 3) {
    return isPointInPolygon(unrotatedPoint, part.polygonPoints);
  }

  const { bounds } = part;
  return (
    unrotatedPoint.x >= bounds.x &&
    unrotatedPoint.x <= bounds.x + bounds.width &&
    unrotatedPoint.y >= bounds.y &&
    unrotatedPoint.y <= bounds.y + bounds.height
  );
}

function findTopmostVisiblePartAtPoint(
  parts: Part[],
  groups: LayerGroup[] | undefined,
  point: Point,
  depthOffFn?: DepthOffFn
): Part | null {
  const visibleParts = [...parts]
    .filter((part) => isPartEffectivelyVisible(part, groups))
    .sort((a, b) => b.zIndex - a.zIndex);

  for (const part of visibleParts) {
    if (!isPartEffectivelyLocked(part, groups)) {
      if (isPointInPart(point, part, parts, depthOffFn)) return part;
    }
  }

  return null;
}

function getPartDisplayPoints(part: Part, allParts?: Part[]): Point[] {
  const ancestors = allParts ? getAncestorChain(allParts, part.id) : [];
  const displayMP = ancestors.length > 0
    ? applyAncestorTransform(part.movementPoint, ancestors)
    : part.movementPoint;

  const basePoints: Point[] = (part.polygonPoints && part.polygonPoints.length >= 3)
    ? part.polygonPoints
    : (() => {
        const { bounds } = part;
        return [
          { x: bounds.x, y: bounds.y },
          { x: bounds.x + bounds.width, y: bounds.y },
          { x: bounds.x + bounds.width, y: bounds.y + bounds.height },
          { x: bounds.x, y: bounds.y + bounds.height },
        ];
      })();

  return basePoints.map((p) => {
    const inherited = ancestors.length > 0 ? applyAncestorTransform(p, ancestors) : p;
    return rotatePoint(inherited, displayMP, part.rotation);
  });
}

function getAxisAlignedBounds(points: Point[]): BoundingBox | null {
  if (points.length === 0) return null;
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

/** World-space position of a part's movementPoint after applying all ancestor rotations. */
function getDisplayMP(part: Part, allParts: Part[]): Point {
  const ancestors = getAncestorChain(allParts, part.id);
  return ancestors.length > 0
    ? applyAncestorTransform(part.movementPoint, ancestors)
    : part.movementPoint;
}

function useContainerSize(ref: React.RefObject<HTMLDivElement | null>) {
  const [size, setSize] = useState({ width: 800, height: 600 });
  useEffect(() => {
    if (!ref.current) return;
    const obs = new ResizeObserver((entries) => {
      const e = entries[0];
      setSize({ width: e.contentRect.width, height: e.contentRect.height });
    });
    obs.observe(ref.current);
    setSize({ width: ref.current.clientWidth, height: ref.current.clientHeight });
    return () => obs.disconnect();
  }, [ref]);
  return size;
}

function UploadPrompt({ onFile }: { onFile: (file: File) => void }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  return (
    <div
      className="w-full h-full flex items-center justify-center"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) onFile(f); }}
    >
      <button
        onClick={() => fileInputRef.current?.click()}
        className="border-2 border-dashed border-zinc-700 hover:border-violet-500 rounded-xl px-12 py-16 text-center transition-colors group cursor-pointer"
      >
        <div className="text-4xl mb-3">🖼️</div>
        <p className="text-zinc-300 font-medium group-hover:text-violet-300 transition-colors">
          Drop a PNG here, or click to upload
        </p>
        <p className="text-zinc-600 text-sm mt-1">Transparent PNG works best</p>
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/gif,image/webp"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }}
      />
    </div>
  );
}

export default function EditorCanvas({
  rig,
  activeTool,
  selectedPartId,
  selectedGroupId,
  onImageUpload,
  onSelectionComplete,
  onSelectPart,
  onMovementPointChange,
  onMoveGroup,
  stageTransform,
  onStageTransformChange,
  resetKey,
  penPoints,
  penClosed,
  onPenAddPoint,
  onPenRemoveLastPoint,
  onPenComplete,
  onPenCancel,
  onPolygonPointChange,
  onPolygonPointInsert,
  onPolygonPointDelete,
  onGroupDragBegin,
  onGroupDragEnd,
  showStructure = false,
  onPartLink,
  previewRotations = null,
  preview2d = null,
}: EditorCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<StageType | null>(null);
  const size = useContainerSize(containerRef);

  const [konvaImage, setKonvaImage] = useState<HTMLImageElement | null>(null);
  const [isPanning, setIsPanning] = useState(false);
  const lastPointer = useRef<Point | null>(null);

  const [dragStart, setDragStart] = useState<Point | null>(null);
  const [dragCurrent, setDragCurrent] = useState<Point | null>(null);
  const [groupDragPointer, setGroupDragPointer] = useState<Point | null>(null);
  const [penMousePos, setPenMousePos] = useState<Point | null>(null);
  const [dashOffset, setDashOffset] = useState(0);
  const [liveVertex, setLiveVertex] = useState<LiveVertex | null>(null);
  const [hoveredEdge, setHoveredEdge] = useState<HoveredEdge | null>(null);
  const [vertexHovered, setVertexHovered] = useState(false);
  const [selectedPolygonPointIdx, setSelectedPolygonPointIdx] = useState<number | null>(null);
  const [linkDrag, setLinkDrag] = useState<LinkDrag | null>(null);
  const [linkHandleHovered, setLinkHandleHovered] = useState(false);

  // Clear transient interaction state when the selected part changes
  useEffect(() => {
    setLiveVertex(null); setHoveredEdge(null); setSelectedPolygonPointIdx(null);
    setLinkDrag(null); setLinkHandleHovered(false);
  }, [selectedPartId]);
  useEffect(() => {
    setGroupDragPointer(null);
  }, [selectedGroupId]);
  // Clear vertex cursor override and selection when switching tools
  useEffect(() => {
    setVertexHovered(false); setHoveredEdge(null); setSelectedPolygonPointIdx(null);
    setLinkDrag(null); setLinkHandleHovered(false);
  }, [activeTool]);
  useEffect(() => {
    const selectedPart = selectedPartId
      ? rig.parts.find((part) => part.id === selectedPartId)
      : null;
    if (isPartEffectivelyLocked(selectedPart, rig.groups)) {
      setLiveVertex(null);
      setHoveredEdge(null);
      setSelectedPolygonPointIdx(null);
      setVertexHovered(false);
    }
  }, [rig.groups, rig.parts, selectedPartId]);

  useEffect(() => {
    if (!rig.imageDataUrl) { setKonvaImage(null); return; }
    const img = new window.Image();
    img.src = rig.imageDataUrl;
    img.onload = () => setKonvaImage(img);
  }, [rig.imageDataUrl]);

  const centerImage = useCallback(() => {
    if (!konvaImage || size.width === 0 || size.height === 0) return;
    const scale = Math.min(
      (size.width * 0.8) / konvaImage.naturalWidth,
      (size.height * 0.8) / konvaImage.naturalHeight,
      1
    );
    const x = (size.width - konvaImage.naturalWidth * scale) / 2;
    const y = (size.height - konvaImage.naturalHeight * scale) / 2;
    onStageTransformChange({ x, y, scale });
  }, [konvaImage, size, onStageTransformChange]);

  const prevResetKey = useRef(-1);
  const hasCentered = useRef(false);
  useEffect(() => {
    if (!konvaImage) return;
    const isReset = resetKey !== prevResetKey.current && prevResetKey.current !== -1;
    if (!hasCentered.current || isReset) {
      centerImage();
      hasCentered.current = true;
      prevResetKey.current = resetKey;
    }
  }, [konvaImage, centerImage, resetKey]);

  useEffect(() => { hasCentered.current = false; }, [rig.imageDataUrl]);

  // Marching ants animation — runs whenever the pen polygon is visible
  const hasPenPoints = penPoints.length > 0;
  useEffect(() => {
    if (!hasPenPoints) return;
    const id = setInterval(() => setDashOffset((d) => d + 1), 50);
    return () => clearInterval(id);
  }, [hasPenPoints]);

  // Keyboard shortcuts active while pen tool is selected
  useEffect(() => {
    if (activeTool !== "pen") return;
    function onKeyDown(e: KeyboardEvent) {
      if (penClosed) return;
      if (e.key === "Escape") {
        onPenCancel();
      } else if (e.key === "Enter") {
        if (penPoints.length >= 3) {
          e.preventDefault();
          onPenComplete(penPoints);
        }
      } else if (e.key === "Backspace" || e.key === "Delete") {
        if (penPoints.length > 0) {
          // In-progress drawing: Backspace removes the last placed point
          if (e.key === "Backspace") {
            e.preventDefault();
            onPenRemoveLastPoint();
          }
      } else if (selectedPolygonPointIdx !== null && selectedPartId) {
        const selectedPart = rig.parts.find((p) => p.id === selectedPartId);
        if (isPartEffectivelyLocked(selectedPart, rig.groups)) return;
        // Existing polygon vertex selected: delete it
        e.preventDefault();
        onPolygonPointDelete(selectedPartId, selectedPolygonPointIdx);
          setSelectedPolygonPointIdx(null);
        }
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeTool, penClosed, penPoints, rig.groups, rig.parts, selectedPolygonPointIdx, selectedPartId,
      onPenComplete, onPenCancel, onPenRemoveLastPoint, onPolygonPointDelete]);

  function loadFile(file: File) {
    if (!file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      if (typeof e.target?.result === "string") onImageUpload(e.target.result);
    };
    reader.readAsDataURL(file);
  }

  /** Convert stage-container pixel coords to image-local (layer) coordinates. */
  function toImageCoords(screenX: number, screenY: number): Point {
    return {
      x: (screenX - stageTransform.x) / stageTransform.scale,
      y: (screenY - stageTransform.y) / stageTransform.scale,
    };
  }

  const selectedGroup = selectedGroupId
    ? findGroupById(rig.groups, selectedGroupId)
    : null;
  const selectedGroupParts = selectedGroupId
    ? rig.parts.filter((part) => part.groupId === selectedGroupId)
    : [];
  const selectedGroupVisibleParts = selectedGroupParts.filter((part) => isPartEffectivelyVisible(part, rig.groups));
  const selectedGroupOutline = getAxisAlignedBounds(
    selectedGroupVisibleParts.flatMap((part) => getPartDisplayPoints(part, rig.parts))
  );
  const selectedGroupCanMove =
    !!selectedGroup &&
    selectedGroupParts.length > 0 &&
    selectedGroupParts.every((part) => !isPartEffectivelyLocked(part, rig.groups));

  function shouldStartGroupDrag(point: Point): boolean {
    if (activeTool !== "select" || !selectedGroupId || !selectedGroupCanMove) return false;
    if (selectedGroupOutline) {
      const withinOutline =
        point.x >= selectedGroupOutline.x &&
        point.x <= selectedGroupOutline.x + selectedGroupOutline.width &&
        point.y >= selectedGroupOutline.y &&
        point.y <= selectedGroupOutline.y + selectedGroupOutline.height;
      if (withinOutline) return true;
    }

    return selectedGroupVisibleParts.some((part) => isPointInPart(point, part, rig.parts));
  }

  function handleWheel(e: KonvaEventObject<WheelEvent>) {
    e.evt.preventDefault();
    const stage = stageRef.current;
    if (!stage) return;
    const pointer = stage.getPointerPosition();
    if (!pointer) return;
    const oldScale = stageTransform.scale;
    const direction = e.evt.deltaY < 0 ? 1 : -1;
    const newScale = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, oldScale * (1 + direction * ZOOM_STEP)));
    const anchor = {
      x: (pointer.x - stageTransform.x) / oldScale,
      y: (pointer.y - stageTransform.y) / oldScale,
    };
    onStageTransformChange({
      scale: newScale,
      x: pointer.x - anchor.x * newScale,
      y: pointer.y - anchor.y * newScale,
    });
  }

  function handleMouseDown(e: KonvaEventObject<MouseEvent>) {
    const isLeft = e.evt.button === 0;
    const isMiddle = e.evt.button === 1;

    if (isMiddle || (activeTool === "move" && isLeft)) {
      e.evt.preventDefault();
      setIsPanning(true);
      lastPointer.current = { x: e.evt.clientX, y: e.evt.clientY };
      return;
    }

    if (activeTool === "select" && isLeft) {
      const stage = stageRef.current;
      if (!stage) return;
      const pos = stage.getPointerPosition();
      if (!pos) return;
      const imgPos = toImageCoords(pos.x, pos.y);
      if (shouldStartGroupDrag(imgPos)) {
        setGroupDragPointer(imgPos);
        onGroupDragBegin?.();
        return;
      }
      setDragStart(imgPos);
      setDragCurrent(imgPos);
    }

    if (activeTool === "pen" && isLeft) {
      // Insert a new vertex on an existing polygon edge when hovering one
      // (only when not currently drawing a new polygon)
      if (hoveredEdge && penPoints.length === 0) {
        onPolygonPointInsert(hoveredEdge.partId, hoveredEdge.edgeIndex, hoveredEdge.insertPoint);
        setHoveredEdge(null);
        return;
      }
      if (!penClosed) {
        const stage = stageRef.current;
        if (!stage) return;
        const pos = stage.getPointerPosition();
        if (!pos) return;
        const imgPos = toImageCoords(pos.x, pos.y);
        if (penPoints.length >= 3) {
          const first = penPoints[0];
          const snapDist = 12 / stageTransform.scale;
          if (Math.hypot(imgPos.x - first.x, imgPos.y - first.y) < snapDist) {
            onPenComplete(penPoints);
            return;
          }
        }
        onPenAddPoint(imgPos);
      }
    }
  }

  function handleMouseMove(e: KonvaEventObject<MouseEvent>) {
    if (isPanning && lastPointer.current) {
      const dx = e.evt.clientX - lastPointer.current.x;
      const dy = e.evt.clientY - lastPointer.current.y;
      lastPointer.current = { x: e.evt.clientX, y: e.evt.clientY };
      onStageTransformChange({ ...stageTransform, x: stageTransform.x + dx, y: stageTransform.y + dy });
      return;
    }

    if (linkDrag) {
      const stage = stageRef.current;
      if (!stage) return;
      const pos = stage.getPointerPosition();
      if (!pos) return;
      const imgPos = toImageCoords(pos.x, pos.y);
      const candidate = findTopmostVisiblePartAtPoint(rig.parts, rig.groups, imgPos);
      const hoverTargetId =
        candidate && candidate.id !== selectedPartId && !isPartEffectivelyLocked(candidate, rig.groups)
          ? candidate.id
          : null;
      setLinkDrag({ ...linkDrag, currentPos: imgPos, hoverTargetId });
      return;
    }

    if (dragStart) {
      const stage = stageRef.current;
      if (!stage) return;
      const pos = stage.getPointerPosition();
      if (!pos) return;
      setDragCurrent(toImageCoords(pos.x, pos.y));
      return;
    }

    if (groupDragPointer) {
      const stage = stageRef.current;
      if (!stage || !selectedGroupId) return;
      const pos = stage.getPointerPosition();
      if (!pos) return;
      const imgPos = toImageCoords(pos.x, pos.y);
      const dx = imgPos.x - groupDragPointer.x;
      const dy = imgPos.y - groupDragPointer.y;
      if (dx !== 0 || dy !== 0) {
        onMoveGroup(selectedGroupId, dx, dy);
        setGroupDragPointer(imgPos);
      }
      return;
    }

    if (activeTool === "pen" && !penClosed) {
      const pos = stageRef.current?.getPointerPosition();
      if (pos) setPenMousePos(toImageCoords(pos.x, pos.y));
    }

    // Edge hover for polygon point insertion — pen tool only, not while drawing a new polygon
    if (activeTool === "pen" && !liveVertex && penPoints.length === 0) {
      const selPart = selectedPartId
        ? rig.parts.find((p) => p.id === selectedPartId && isPartEffectivelyVisible(p, rig.groups))
        : null;
      if (isPartEffectivelyLocked(selPart, rig.groups)) {
        if (hoveredEdge) setHoveredEdge(null);
        return;
      }
      if (selPart?.polygonPoints && selPart.polygonPoints.length >= 3) {
        // Block edge hover when pen editing is disabled due to active ancestor rotation
        const selPartAncestors = getAncestorChain(rig.parts, selPart.id);
        if (selPartAncestors.some((a) => a.rotation !== 0)) {
          if (hoveredEdge) setHoveredEdge(null);
        } else {
        const stage = stageRef.current;
        const pos = stage?.getPointerPosition();
        if (pos) {
          const imgPos = toImageCoords(pos.x, pos.y);
          const mp = selPart.movementPoint;
          const rad = (selPart.rotation * Math.PI) / 180;
          const cos = Math.cos(rad);
          const sin = Math.sin(rad);
          const THRESHOLD = 8 / stageTransform.scale;
          const VERTEX_SNAP = 6 / stageTransform.scale;
          const pts = selPart.polygonPoints;
          const n = pts.length;
          // Forward-rotate each stored vertex to its display position
          const disp = pts.map((pt) => {
            const dx = pt.x - mp.x;
            const dy = pt.y - mp.y;
            return { x: cos * dx - sin * dy + mp.x, y: sin * dx + cos * dy + mp.y };
          });
          let bestDist = THRESHOLD;
          let best: HoveredEdge | null = null;
          for (let i = 0; i < n; i++) {
            const a = disp[i];
            const b = disp[(i + 1) % n];
            // Skip edge if pointer is within vertex-snap radius of either endpoint
            if (Math.hypot(imgPos.x - a.x, imgPos.y - a.y) < VERTEX_SNAP) continue;
            if (Math.hypot(imgPos.x - b.x, imgPos.y - b.y) < VERTEX_SNAP) continue;
            const abx = b.x - a.x;
            const aby = b.y - a.y;
            const ab2 = abx * abx + aby * aby;
            if (ab2 === 0) continue;
            const t = Math.max(0, Math.min(1, ((imgPos.x - a.x) * abx + (imgPos.y - a.y) * aby) / ab2));
            const qx = a.x + t * abx;
            const qy = a.y + t * aby;
            const dist = Math.hypot(imgPos.x - qx, imgPos.y - qy);
            if (dist < bestDist) {
              bestDist = dist;
              // Inverse-rotate closest point back to unrotated polygon storage coords
              const rdx = qx - mp.x;
              const rdy = qy - mp.y;
              best = {
                partId: selPart.id,
                edgeIndex: i,
                insertPoint: {
                  x: cos * rdx + sin * rdy + mp.x,
                  y: -sin * rdx + cos * rdy + mp.y,
                },
                displayA: a,
                displayB: b,
                displayInsert: { x: qx, y: qy },
              };
            }
          }
          setHoveredEdge(best);
        } else {
          setHoveredEdge(null);
        }
        } // end else (no active ancestor rotation)
      } else if (hoveredEdge) {
        setHoveredEdge(null);
      }
    } else if (hoveredEdge) {
      setHoveredEdge(null);
    }
  }

  function handleMouseUp() {
    if (linkDrag) {
      const targetId = linkDrag.hoverTargetId;
      setLinkDrag(null);
      if (targetId && selectedPartId) {
        onPartLink?.(selectedPartId, targetId);
      }
      return;
    }

    if (isPanning) {
      setIsPanning(false);
      lastPointer.current = null;
      return;
    }

    if (dragStart && dragCurrent) {
      const dx = Math.abs(dragCurrent.x - dragStart.x);
      const dy = Math.abs(dragCurrent.y - dragStart.y);

      if (dx > MIN_SELECTION_PX || dy > MIN_SELECTION_PX) {
        const iw = konvaImage?.naturalWidth ?? Infinity;
        const ih = konvaImage?.naturalHeight ?? Infinity;
        const rawX = Math.min(dragStart.x, dragCurrent.x);
        const rawY = Math.min(dragStart.y, dragCurrent.y);
        const clampedX = Math.max(0, rawX);
        const clampedY = Math.max(0, rawY);
        onSelectionComplete({
          x: Math.round(clampedX),
          y: Math.round(clampedY),
          width: Math.round(Math.min(dx, iw - clampedX)),
          height: Math.round(Math.min(dy, ih - clampedY)),
        });
      } else {
        const hitPart = findTopmostVisiblePartAtPoint(
          rig.parts,
          rig.groups,
          dragCurrent,
          preview2d?.enabled ? depthOff : undefined
        );
        onSelectPart(hitPart?.id ?? null);
      }

      setDragStart(null);
      setDragCurrent(null);
      return;
    }

    if (groupDragPointer) {
      setGroupDragPointer(null);
      onGroupDragEnd?.();
    }
  }

  function handleMouseLeave() {
    setIsPanning(false);
    lastPointer.current = null;
    setDragStart(null);
    setDragCurrent(null);
    if (groupDragPointer) onGroupDragEnd?.();
    setGroupDragPointer(null);
    setPenMousePos(null);
    setHoveredEdge(null);
    setLinkDrag(null);
    setLinkHandleHovered(false);
  }

  const liveRect = dragStart && dragCurrent ? {
    x: Math.min(dragStart.x, dragCurrent.x),
    y: Math.min(dragStart.y, dragCurrent.y),
    width: Math.abs(dragCurrent.x - dragStart.x),
    height: Math.abs(dragCurrent.y - dragStart.y),
  } : null;

  const cursor = linkDrag ? "crosshair"
    : linkHandleHovered ? "grab"
    : isPanning ? "grabbing"
    : groupDragPointer ? "grabbing"
    : (activeTool === "pen" && vertexHovered) ? "grab"
    : hoveredEdge ? "copy"
    : activeTool === "move" ? "grab"
    : activeTool === "select" ? "crosshair"
    : activeTool === "pen" ? "crosshair"
    : "default";

  // During animation preview, overlay preview rotations without mutating rig
  const displayParts = previewRotations
    ? rig.parts.map((p) =>
        previewRotations[p.id] !== undefined ? { ...p, rotation: previewRotations[p.id] } : p
      )
    : rig.parts;

  // The part whose pivot we show — must be selected and visible
  const selectedPart = displayParts.find(
    (p) => p.id === selectedPartId && isPartEffectivelyVisible(p, rig.groups)
  ) ?? null;

  // Scale-compensated sizes so the pivot indicator stays constant in screen pixels
  const sc = stageTransform.scale;
  const pivotR = PIVOT_RING_R / sc;
  const pivotArm = PIVOT_ARM_LEN / sc;

  function depthOff(part: Part): { ox: number; oy: number } {
    if (!preview2d?.enabled) return { ox: 0, oy: 0 };
    const d = part.depth ?? 0;
    return {
      ox: d * preview2d.viewX * DEPTH_STRENGTH,
      oy: d * preview2d.viewY * DEPTH_STRENGTH,
    };
  }

  if (!rig.imageDataUrl) {
    return (
      <div ref={containerRef} className="w-full h-full">
        <UploadPrompt onFile={loadFile} />
      </div>
    );
  }

  return (
    <div ref={containerRef} className="w-full h-full overflow-hidden bg-zinc-950" style={{ cursor }}>
      <Stage
        ref={stageRef}
        width={size.width}
        height={size.height}
        x={stageTransform.x}
        y={stageTransform.y}
        scaleX={sc}
        scaleY={sc}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
      >
        <Layer>
          {/* Character image */}
          {konvaImage && (
            <KonvaImage
              image={konvaImage}
              x={0}
              y={0}
              width={konvaImage.naturalWidth}
              height={konvaImage.naturalHeight}
              listening={false}
            />
          )}

          {/* Saved parts — sorted ascending so higher zIndex renders on top.
               Parts with active ancestor rotation render using fully computed display points.
               Others use Konva's native x/offsetX rotation trick for their local rotation. */}
          {[...displayParts].sort((a, b) => a.zIndex - b.zIndex).map((part) => {
            if (!isPartEffectivelyVisible(part, rig.groups)) return null;
            const sel = part.id === selectedPartId;
            const mp = part.movementPoint;
            const stroke = sel ? "rgba(167,139,250,1)" : "rgba(139,92,246,0.7)";
            const fill = sel ? "rgba(139,92,246,0.18)" : "rgba(139,92,246,0.06)";
            const strokeWidth = sel ? 2 : 1;
            const { ox, oy } = depthOff(part);

            // Render preview: apply inherited parent rotation transforms
            const partAncestors = getAncestorChain(displayParts, part.id);
            if (partAncestors.some((a) => a.rotation !== 0)) {
              const flatPts = getPartDisplayPoints(part, displayParts).flatMap((p) => [p.x + ox, p.y + oy]);
              return (
                <KonvaLine
                  key={part.id}
                  points={flatPts}
                  closed
                  stroke={stroke}
                  strokeWidth={strokeWidth}
                  strokeScaleEnabled={false}
                  fill={fill}
                />
              );
            }

            if (part.polygonPoints && part.polygonPoints.length >= 3) {
              const flatPts = part.polygonPoints.flatMap((p, i) => {
                if (liveVertex?.partId === part.id && liveVertex.idx === i) {
                  return [liveVertex.polygonPos.x, liveVertex.polygonPos.y];
                }
                return [p.x, p.y];
              });
              return (
                <KonvaLine
                  key={part.id}
                  points={flatPts}
                  x={mp.x + ox}
                  y={mp.y + oy}
                  offsetX={mp.x}
                  offsetY={mp.y}
                  rotation={part.rotation}
                  closed
                  stroke={stroke}
                  strokeWidth={strokeWidth}
                  strokeScaleEnabled={false}
                  fill={fill}
                />
              );
            }

            return (
              <KonvaRect
                key={part.id}
                x={mp.x + ox}
                y={mp.y + oy}
                offsetX={mp.x - part.bounds.x}
                offsetY={mp.y - part.bounds.y}
                width={part.bounds.width}
                height={part.bounds.height}
                rotation={part.rotation}
                stroke={stroke}
                strokeWidth={strokeWidth}
                strokeScaleEnabled={false}
                fill={fill}
              />
            );
          })}

          {/* Live drag selection rectangle */}
          {liveRect && (
            <KonvaRect
              x={liveRect.x}
              y={liveRect.y}
              width={liveRect.width}
              height={liveRect.height}
              stroke="rgba(167,139,250,0.9)"
              strokeWidth={1}
              strokeScaleEnabled={false}
              fill="rgba(139,92,246,0.05)"
              dash={[4, 4]}
              listening={false}
            />
          )}

          {selectedGroup && selectedGroupOutline && (
            <KonvaRect
              x={selectedGroupOutline.x}
              y={selectedGroupOutline.y}
              width={selectedGroupOutline.width}
              height={selectedGroupOutline.height}
              stroke="rgba(56,189,248,0.95)"
              strokeWidth={2}
              strokeScaleEnabled={false}
              dash={[8, 5]}
              fill="rgba(56,189,248,0.06)"
              listening={false}
            />
          )}

          {/* Structure overlay — parent→child connection lines */}
          {showStructure && (() => {
            const visibleIds = new Set(
              displayParts.filter((p) => isPartEffectivelyVisible(p, rig.groups)).map((p) => p.id)
            );
            const partsById = new Map(displayParts.map((p) => [p.id, p]));
            const lines: React.ReactNode[] = [];
            const dots = new Map<string, { pos: Point; isSelected: boolean }>();

            for (const child of displayParts) {
              if (!child.parentId || !visibleIds.has(child.id)) continue;
              const parent = partsById.get(child.parentId);
              if (!parent || !visibleIds.has(parent.id)) continue;

              const parentMp = getDisplayMP(parent, displayParts);
              const childMp = getDisplayMP(child, displayParts);
              const pOff = depthOff(parent);
              const cOff = depthOff(child);
              const parentPos = { x: parentMp.x + pOff.ox, y: parentMp.y + pOff.oy };
              const childPos = { x: childMp.x + cOff.ox, y: childMp.y + cOff.oy };
              const highlighted = child.id === selectedPartId || parent.id === selectedPartId;

              lines.push(
                <KonvaLine
                  key={`sl-${child.id}`}
                  points={[parentPos.x, parentPos.y, childPos.x, childPos.y]}
                  stroke={highlighted ? "rgba(167,139,250,0.9)" : "rgba(167,139,250,0.35)"}
                  strokeWidth={1.5 / sc}
                  strokeScaleEnabled={false}
                  lineCap="round"
                  listening={false}
                />
              );

              for (const [id, pos] of [[parent.id, parentPos], [child.id, childPos]] as [string, Point][]) {
                if (!dots.has(id)) {
                  dots.set(id, { pos, isSelected: id === selectedPartId });
                }
              }
            }

            const dotNodes = [...dots.entries()].map(([id, { pos, isSelected }]) => (
              <KonvaCircle
                key={`sd-${id}`}
                x={pos.x}
                y={pos.y}
                radius={3 / sc}
                fill={isSelected ? "rgba(167,139,250,1)" : "rgba(167,139,250,0.65)"}
                stroke="rgba(0,0,0,0.45)"
                strokeWidth={0.8 / sc}
                strokeScaleEnabled={false}
                listening={false}
              />
            ));

            return [...lines, ...dotNodes];
          })()}

          {/* Link drag — target highlight and preview line */}
          {linkDrag && (() => {
            const targetPart = linkDrag.hoverTargetId
              ? displayParts.find((p) => p.id === linkDrag.hoverTargetId)
              : null;
            return (
              <>
                {targetPart && (() => {
                  const { ox: tox, oy: toy } = depthOff(targetPart);
                  const pts = getPartDisplayPoints(targetPart, displayParts);
                  return (
                    <KonvaLine
                      points={pts.flatMap((p) => [p.x + tox, p.y + toy])}
                      closed
                      stroke="rgba(74,222,128,0.85)"
                      strokeWidth={2}
                      strokeScaleEnabled={false}
                      fill="rgba(74,222,128,0.07)"
                      listening={false}
                    />
                  );
                })()}
                <KonvaLine
                  points={[
                    linkDrag.fromPos.x, linkDrag.fromPos.y,
                    linkDrag.currentPos.x, linkDrag.currentPos.y,
                  ]}
                  stroke="rgba(74,222,128,0.85)"
                  strokeWidth={1.5}
                  strokeScaleEnabled={false}
                  dash={[6, 4]}
                  lineCap="round"
                  listening={false}
                />
              </>
            );
          })()}

          {/* Blue edge highlight + insertion marker when hovering a polygon edge */}
          {hoveredEdge && (
            <>
              <KonvaLine
                points={[
                  hoveredEdge.displayA.x, hoveredEdge.displayA.y,
                  hoveredEdge.displayB.x, hoveredEdge.displayB.y,
                ]}
                stroke="rgba(59,130,246,0.9)"
                strokeWidth={3 / sc}
                strokeScaleEnabled={false}
                lineCap="round"
                listening={false}
              />
              <KonvaCircle
                x={hoveredEdge.displayInsert.x}
                y={hoveredEdge.displayInsert.y}
                radius={4 / sc}
                fill="rgba(59,130,246,1)"
                stroke="rgba(255,255,255,0.8)"
                strokeWidth={1}
                strokeScaleEnabled={false}
                listening={false}
              />
            </>
          )}

          {/* Vertex markers for the selected polygon part.
               Read-only (dimmed, non-draggable) when an ancestor has active rotation — pen
               editing is blocked in that state to prevent corrupt stored coordinates. */}
          {(() => {
            if (!selectedPartId) return null;
            const part = displayParts.find((p) => p.id === selectedPartId && isPartEffectivelyVisible(p, rig.groups));
            if (!part?.polygonPoints || part.polygonPoints.length < 3 || isPartEffectivelyLocked(part, rig.groups)) return null;
            const mp = part.movementPoint;
            const rad = (part.rotation * Math.PI) / 180;
            const cos = Math.cos(rad);
            const sin = Math.sin(rad);

            const vtxAncestors = getAncestorChain(displayParts, part.id);
            const hasActiveAncestorRot = vtxAncestors.some((a) => a.rotation !== 0);
            const inheritedPts = hasActiveAncestorRot ? getPartDisplayPoints(part, displayParts) : null;
            const { ox: vtxOx, oy: vtxOy } = depthOff(part);
            const vtxEditBlocked = hasActiveAncestorRot || !!preview2d?.enabled;

            return (
              <>
                {part.polygonPoints.map((pt, i) => {
                  let cx: number, cy: number;
                  if (inheritedPts) {
                    cx = inheritedPts[i].x + vtxOx;
                    cy = inheritedPts[i].y + vtxOy;
                  } else {
                    const dx = pt.x - mp.x;
                    const dy = pt.y - mp.y;
                    const defaultX = cos * dx - sin * dy + mp.x;
                    const defaultY = sin * dx + cos * dy + mp.y;
                    const isLive = liveVertex?.partId === part.id && liveVertex.idx === i;
                    cx = (isLive ? liveVertex!.stagePos.x : defaultX) + vtxOx;
                    cy = (isLive ? liveVertex!.stagePos.y : defaultY) + vtxOy;
                  }

                  const canEdit = !vtxEditBlocked && !isPartEffectivelyLocked(part, rig.groups);
                  const isSelected = canEdit && activeTool === "pen" && selectedPolygonPointIdx === i;
                  return (
                    <KonvaCircle
                      key={`vtx-${part.id}-${i}`}
                      x={cx}
                      y={cy}
                      radius={isSelected ? 6 / sc : 4 / sc}
                      fill={vtxEditBlocked ? "rgba(167,139,250,0.45)" : (isSelected ? "rgba(255,255,255,1)" : "rgba(167,139,250,0.95)")}
                      stroke={isSelected ? "rgba(167,139,250,1)" : "rgba(255,255,255,0.5)"}
                      strokeWidth={isSelected ? 2 : 1}
                      strokeScaleEnabled={false}
                      draggable={canEdit && activeTool === "pen"}
                      onMouseEnter={() => { if (canEdit && activeTool === "pen") setVertexHovered(true); }}
                      onMouseLeave={() => setVertexHovered(false)}
                      onMouseDown={(e: KonvaEventObject<MouseEvent>) => {
                        if (canEdit && activeTool === "pen") e.cancelBubble = true;
                      }}
                      onClick={(e: KonvaEventObject<MouseEvent>) => {
                        if (!canEdit || activeTool !== "pen") return;
                        e.cancelBubble = true;
                        setSelectedPolygonPointIdx(selectedPolygonPointIdx === i ? null : i);
                      }}
                      onDragMove={(e) => {
                        if (!canEdit || activeTool !== "pen") return;
                        e.cancelBubble = true;
                        const sx = e.target.x();
                        const sy = e.target.y();
                        const rdx = sx - mp.x;
                        const rdy = sy - mp.y;
                        setLiveVertex({
                          partId: part.id,
                          idx: i,
                          stagePos: { x: sx, y: sy },
                          polygonPos: {
                            x: cos * rdx + sin * rdy + mp.x,
                            y: -sin * rdx + cos * rdy + mp.y,
                          },
                        });
                      }}
                      onDragEnd={(e) => {
                        if (!canEdit || activeTool !== "pen") return;
                        e.cancelBubble = true;
                        const sx = e.target.x();
                        const sy = e.target.y();
                        const rdx = sx - mp.x;
                        const rdy = sy - mp.y;
                        onPolygonPointChange(part.id, i, {
                          x: Math.round(cos * rdx + sin * rdy + mp.x),
                          y: Math.round(-sin * rdx + cos * rdy + mp.y),
                        });
                        setLiveVertex(null);
                      }}
                    />
                  );
                })}
              </>
            );
          })()}

          {/* Pen tool polygon overlay */}
          {activeTool === "pen" && penPoints.length > 0 && (() => {
            const flatPoints = penPoints.flatMap((p) => [p.x, p.y]);
            const SNAP = 12 / sc;
            const nearFirst =
              !penClosed &&
              penMousePos !== null &&
              penPoints.length >= 3 &&
              Math.hypot(penMousePos.x - penPoints[0].x, penMousePos.y - penPoints[0].y) < SNAP;

            return (
              <>
                {penClosed ? (
                  <>
                    {/* Marching ants — white pass */}
                    <KonvaLine
                      points={flatPoints}
                      closed
                      stroke="rgba(255,255,255,0.9)"
                      strokeWidth={1.5}
                      strokeScaleEnabled={false}
                      dash={[8, 6]}
                      dashOffset={-dashOffset}
                      fill="rgba(139,92,246,0.1)"
                      listening={false}
                    />
                    {/* Marching ants — dark pass offset by half pattern for contrast */}
                    <KonvaLine
                      points={flatPoints}
                      closed
                      stroke="rgba(0,0,0,0.65)"
                      strokeWidth={1.5}
                      strokeScaleEnabled={false}
                      dash={[8, 6]}
                      dashOffset={-dashOffset - 8}
                      listening={false}
                    />
                  </>
                ) : (
                  /* In-progress polygon with preview line to cursor */
                  <KonvaLine
                    points={[
                      ...flatPoints,
                      ...(penMousePos ? [penMousePos.x, penMousePos.y] : []),
                    ]}
                    stroke="rgba(255,255,255,0.85)"
                    strokeWidth={1.5}
                    strokeScaleEnabled={false}
                    dash={[4, 4]}
                    listening={false}
                  />
                )}
                {/* Point markers */}
                {penPoints.map((pt, i) => {
                  const isSnapTarget = i === 0 && nearFirst;
                  return (
                    <KonvaCircle
                      key={i}
                      x={pt.x}
                      y={pt.y}
                      radius={(isSnapTarget ? 6 : 4) / sc}
                      fill={isSnapTarget ? "rgba(167,139,250,1)" : "rgba(255,255,255,0.95)"}
                      stroke="rgba(0,0,0,0.55)"
                      strokeWidth={1}
                      strokeScaleEnabled={false}
                      listening={false}
                    />
                  );
                })}
              </>
            );
          })()}

          {/* Movement point indicator — shown whenever a visible part is selected.
               Displayed at the inherited world position so it stays "on" the rendered part.
               Drag end inverse-transforms back to image-local before storing. */}
          {selectedPart && (() => {
            const mpAncestors = getAncestorChain(displayParts, selectedPart.id);
            const rawDmp = applyAncestorTransform(selectedPart.movementPoint, mpAncestors);
            const { ox: pivOx, oy: pivOy } = depthOff(selectedPart);
            const dmp = { x: rawDmp.x + pivOx, y: rawDmp.y + pivOy };
            const isPointTool = activeTool === "point";
            const pivotDragBlocked = !!preview2d?.enabled;
            const color = isPointTool ? "rgba(251,191,36,1)" : "rgba(251,191,36,0.55)";
            const fillColor = isPointTool ? "rgba(251,191,36,0.2)" : "rgba(251,191,36,0.08)";

            return (
              <>
                <KonvaLine
                  points={[dmp.x - pivotArm, dmp.y, dmp.x + pivotArm, dmp.y]}
                  stroke={color}
                  strokeWidth={1.5}
                  strokeScaleEnabled={false}
                  listening={false}
                />
                <KonvaLine
                  points={[dmp.x, dmp.y - pivotArm, dmp.x, dmp.y + pivotArm]}
                  stroke={color}
                  strokeWidth={1.5}
                  strokeScaleEnabled={false}
                  listening={false}
                />
                {/* Ring — draggable in point-tool mode (disabled during 2.5D preview) */}
                <KonvaCircle
                  x={dmp.x}
                  y={dmp.y}
                  radius={pivotR}
                  fill={fillColor}
                  stroke={color}
                  strokeWidth={1.5}
                  strokeScaleEnabled={false}
                  draggable={isPointTool && !isPartEffectivelyLocked(selectedPart, rig.groups) && !pivotDragBlocked}
                  onMouseDown={(e: KonvaEventObject<MouseEvent>) => {
                    e.cancelBubble = true;
                  }}
                  onDragEnd={(e) => {
                    if (pivotDragBlocked) return;
                    e.cancelBubble = true;
                    const node = e.target;
                    // Subtract depth offset before inverse-transforming back to stored coords
                    const worldPos: Point = { x: Math.round(node.x()) - pivOx, y: Math.round(node.y()) - pivOy };
                    const stored = mpAncestors.length > 0
                      ? inverseAncestorTransform(worldPos, mpAncestors)
                      : worldPos;
                    onMovementPointChange(selectedPart.id, {
                      x: Math.round(stored.x),
                      y: Math.round(stored.y),
                    });
                  }}
                />
                {/* Link handle — only in point-tool + show-structure mode */}
                {showStructure && isPointTool && !isPartEffectivelyLocked(selectedPart, rig.groups) && (() => {
                  const hx = dmp.x + LINK_HANDLE_OFFSET / sc;
                  const hy = dmp.y - LINK_HANDLE_OFFSET / sc;
                  const hr = LINK_HANDLE_R / sc;
                  const active = linkHandleHovered || linkDrag !== null;
                  return (
                    <KonvaCircle
                      x={hx}
                      y={hy}
                      radius={hr}
                      fill={active ? "rgba(74,222,128,1)" : "rgba(74,222,128,0.7)"}
                      stroke="rgba(0,0,0,0.45)"
                      strokeWidth={1}
                      strokeScaleEnabled={false}
                      onMouseEnter={() => setLinkHandleHovered(true)}
                      onMouseLeave={() => setLinkHandleHovered(false)}
                      onMouseDown={(e: KonvaEventObject<MouseEvent>) => {
                        e.cancelBubble = true;
                        setLinkDrag({ fromPos: dmp, currentPos: dmp, hoverTargetId: null });
                      }}
                    />
                  );
                })()}
              </>
            );
          })()}
        </Layer>
      </Stage>
    </div>
  );
}
