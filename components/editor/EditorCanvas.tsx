"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import dynamic from "next/dynamic";
import type { KonvaEventObject } from "konva/lib/Node";
import type { Stage as StageType } from "konva/lib/Stage";
import type { BoundingBox, CharacterRig, Point } from "@/types/rig";

const Stage = dynamic(() => import("react-konva").then((m) => m.Stage), { ssr: false });
const Layer = dynamic(() => import("react-konva").then((m) => m.Layer), { ssr: false });
const KonvaImage = dynamic(() => import("react-konva").then((m) => m.Image), { ssr: false });
const KonvaRect = dynamic(() => import("react-konva").then((m) => m.Rect), { ssr: false });
const KonvaCircle = dynamic(() => import("react-konva").then((m) => m.Circle), { ssr: false });
const KonvaLine = dynamic(() => import("react-konva").then((m) => m.Line), { ssr: false });

const MIN_ZOOM = 0.05;
const MAX_ZOOM = 8;
const ZOOM_STEP = 0.15;
const MIN_SELECTION_PX = 5;

// Visual constants for the movement-point indicator (screen pixels)
const PIVOT_RING_R = 6;
const PIVOT_ARM_LEN = 9;

interface StageTransform {
  x: number;
  y: number;
  scale: number;
}

interface EditorCanvasProps {
  rig: CharacterRig;
  activeTool: "select" | "move" | "point";
  selectedPartId: string | null;
  onImageUpload: (dataUrl: string) => void;
  onSelectionComplete: (bounds: BoundingBox) => void;
  onSelectPart: (id: string | null) => void;
  onMovementPointChange: (partId: string, point: Point) => void;
  stageTransform: StageTransform;
  onStageTransformChange: (t: StageTransform) => void;
  resetKey: number;
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
  onImageUpload,
  onSelectionComplete,
  onSelectPart,
  onMovementPointChange,
  stageTransform,
  onStageTransformChange,
  resetKey,
}: EditorCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<StageType | null>(null);
  const size = useContainerSize(containerRef);

  const [konvaImage, setKonvaImage] = useState<HTMLImageElement | null>(null);
  const [isPanning, setIsPanning] = useState(false);
  const lastPointer = useRef<Point | null>(null);

  const [dragStart, setDragStart] = useState<Point | null>(null);
  const [dragCurrent, setDragCurrent] = useState<Point | null>(null);

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
      setDragStart(imgPos);
      setDragCurrent(imgPos);
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

    if (dragStart) {
      const stage = stageRef.current;
      if (!stage) return;
      const pos = stage.getPointerPosition();
      if (!pos) return;
      setDragCurrent(toImageCoords(pos.x, pos.y));
    }
  }

  function handleMouseUp() {
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
        onSelectPart(null);
      }

      setDragStart(null);
      setDragCurrent(null);
    }
  }

  function handleMouseLeave() {
    setIsPanning(false);
    lastPointer.current = null;
    setDragStart(null);
    setDragCurrent(null);
  }

  const liveRect = dragStart && dragCurrent ? {
    x: Math.min(dragStart.x, dragCurrent.x),
    y: Math.min(dragStart.y, dragCurrent.y),
    width: Math.abs(dragCurrent.x - dragStart.x),
    height: Math.abs(dragCurrent.y - dragStart.y),
  } : null;

  const cursor = isPanning ? "grabbing"
    : activeTool === "move" ? "grab"
    : activeTool === "select" ? "crosshair"
    : "default";

  // The part whose pivot we show — must be selected and visible
  const selectedPart = rig.parts.find(
    (p) => p.id === selectedPartId && p.isVisible
  ) ?? null;

  // Scale-compensated sizes so the pivot indicator stays constant in screen pixels
  const sc = stageTransform.scale;
  const pivotR = PIVOT_RING_R / sc;
  const pivotArm = PIVOT_ARM_LEN / sc;

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

          {/* Saved part rectangles — sorted ascending so higher zIndex renders on top */}
          {[...rig.parts].sort((a, b) => a.zIndex - b.zIndex).map((part) => {
            if (!part.isVisible) return null;
            const sel = part.id === selectedPartId;
            const mp = part.movementPoint;
            return (
              <KonvaRect
                key={part.id}
                // Position at movement point so rotation pivots around it
                x={mp.x}
                y={mp.y}
                offsetX={mp.x - part.bounds.x}
                offsetY={mp.y - part.bounds.y}
                width={part.bounds.width}
                height={part.bounds.height}
                rotation={part.rotation}
                stroke={sel ? "rgba(167,139,250,1)" : "rgba(139,92,246,0.7)"}
                strokeWidth={sel ? 2 : 1}
                strokeScaleEnabled={false}
                fill={sel ? "rgba(139,92,246,0.18)" : "rgba(139,92,246,0.06)"}
                onMouseDown={(e: KonvaEventObject<MouseEvent>) => {
                  if (activeTool === "select" && e.evt.button === 0) e.cancelBubble = true;
                }}
                onClick={(e: KonvaEventObject<MouseEvent>) => {
                  e.cancelBubble = true;
                  onSelectPart(part.id);
                }}
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

          {/* Movement point indicator — shown whenever a visible part is selected */}
          {selectedPart && (() => {
            const mp = selectedPart.movementPoint;
            const isPointTool = activeTool === "point";
            const color = isPointTool ? "rgba(251,191,36,1)" : "rgba(251,191,36,0.55)";
            const fillColor = isPointTool ? "rgba(251,191,36,0.2)" : "rgba(251,191,36,0.08)";

            return (
              <>
                {/* Horizontal crosshair arm */}
                <KonvaLine
                  points={[mp.x - pivotArm, mp.y, mp.x + pivotArm, mp.y]}
                  stroke={color}
                  strokeWidth={1.5}
                  strokeScaleEnabled={false}
                  listening={false}
                />
                {/* Vertical crosshair arm */}
                <KonvaLine
                  points={[mp.x, mp.y - pivotArm, mp.x, mp.y + pivotArm]}
                  stroke={color}
                  strokeWidth={1.5}
                  strokeScaleEnabled={false}
                  listening={false}
                />
                {/* Ring — draggable in point-tool mode */}
                <KonvaCircle
                  x={mp.x}
                  y={mp.y}
                  radius={pivotR}
                  fill={fillColor}
                  stroke={color}
                  strokeWidth={1.5}
                  strokeScaleEnabled={false}
                  draggable={isPointTool}
                  onMouseDown={(e: KonvaEventObject<MouseEvent>) => {
                    // Always stop bubbling so pan/selection don't fire
                    e.cancelBubble = true;
                  }}
                  onDragEnd={(e) => {
                    e.cancelBubble = true;
                    const node = e.target;
                    onMovementPointChange(selectedPart.id, {
                      x: Math.round(node.x()),
                      y: Math.round(node.y()),
                    });
                  }}
                />
              </>
            );
          })()}
        </Layer>
      </Stage>
    </div>
  );
}
