"use client";

import { useEffect, useRef, useState } from "react";
import type { Part } from "@/types/rig";

interface PartsSidebarProps {
  parts: Part[];
  selectedPartId: string | null;
  onSelectPart: (id: string | null) => void;
  onPartParentChange: (partId: string, parentId: string) => void;
  onPartReorderByDrag: (sourcePartId: string, targetPartId: string, placeAfter: boolean) => void;
  onDeletePart: (id: string) => void;
  onToggleLock: (id: string) => void;
  onToggleVisibility: (id: string) => void;
  onResetMovementPoint: (id: string) => void;
  onMoveToFront: (id: string) => void;
  onMoveUp: (id: string) => void;
  onMoveDown: (id: string) => void;
  onMoveToBack: (id: string) => void;
  onRotateLeft: (id: string) => void;
  onRotateRight: (id: string) => void;
  onResetRotation: (id: string) => void;
}

function isPartLocked(part: Part | null | undefined): boolean {
  return part?.isLocked === true;
}

function getPartDepth(part: Part, partsById: Map<string, Part>): number {
  let depth = 0;
  let currentParentId = part.parentId;
  const visited = new Set<string>([part.id]);

  while (currentParentId && depth < 4) {
    const parent = partsById.get(currentParentId);
    if (!parent || visited.has(currentParentId)) break;
    visited.add(currentParentId);
    depth += 1;
    currentParentId = parent.parentId;
  }

  return depth;
}

function EyeOpenIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeClosedIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
      <path d="M14.12 14.12a3 3 0 0 1-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}

export default function PartsSidebar({
  parts,
  selectedPartId,
  onSelectPart,
  onPartParentChange,
  onPartReorderByDrag,
  onDeletePart,
  onToggleLock,
  onToggleVisibility,
  onResetMovementPoint,
  onMoveToFront,
  onMoveUp,
  onMoveDown,
  onMoveToBack,
  onRotateLeft,
  onRotateRight,
  onResetRotation,
}: PartsSidebarProps) {
  const [draggingPartId, setDraggingPartId] = useState<string | null>(null);
  const [dragOverPartId, setDragOverPartId] = useState<string | null>(null);
  const [dragOverPosition, setDragOverPosition] = useState<"before" | "after" | null>(null);
  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const partsById = new Map(parts.map((part) => [part.id, part]));
  const sortedParts = [...parts]
    .sort((a, b) => b.zIndex - a.zIndex)
    .map((part) => ({
      part,
      parent: part.parentId ? partsById.get(part.parentId) ?? null : null,
      depth: getPartDepth(part, partsById),
    }));

  const selectedPart = parts.find((p) => p.id === selectedPartId) ?? null;
  const parentOptions = selectedPart
    ? sortedParts.map(({ part }) => part).filter((part) => part.id !== selectedPart.id)
    : [];

  const selectedSortedIdx = sortedParts.findIndex(({ part }) => part.id === selectedPartId);
  const isAtFront = selectedSortedIdx === 0;
  const isAtBack = selectedSortedIdx === sortedParts.length - 1;

  useEffect(() => {
    if (!selectedPartId) return;
    rowRefs.current[selectedPartId]?.scrollIntoView({
      block: "nearest",
    });
  }, [selectedPartId]);

  return (
    <aside className="w-56 bg-zinc-900 border-l border-zinc-800 flex flex-col flex-shrink-0">
      <div className="px-3 py-2 border-b border-zinc-800">
        <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Layers</h2>
      </div>

      <div className="flex-1 overflow-y-auto">
        {sortedParts.length === 0 ? (
          <p className="px-3 py-4 text-zinc-600 text-xs leading-relaxed">
            No parts yet. Use Select to drag a region, or Pluma to click points around a shape.
          </p>
        ) : (
          <ul className="py-1">
            {sortedParts.map(({ part, parent, depth }) => {
              const isSelected = part.id === selectedPartId;
              const isLocked = isPartLocked(part);
              const isDragging = draggingPartId === part.id;
              const isDragTarget = dragOverPartId === part.id && draggingPartId !== part.id;
              const indentPx = Math.min(depth, 4) * 12;

              return (
                <li key={part.id}>
                  <div
                    ref={(node) => {
                      rowRefs.current[part.id] = node;
                    }}
                    draggable
                    onDragStart={(e) => {
                      setDraggingPartId(part.id);
                      e.dataTransfer.effectAllowed = "move";
                      e.dataTransfer.setData("text/plain", part.id);
                    }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      if (draggingPartId !== part.id) {
                        e.dataTransfer.dropEffect = "move";
                        setDragOverPartId(part.id);
                        const bounds = e.currentTarget.getBoundingClientRect();
                        const halfwayY = bounds.top + bounds.height / 2;
                        setDragOverPosition(e.clientY < halfwayY ? "before" : "after");
                      }
                    }}
                    onDragLeave={() => {
                      if (dragOverPartId === part.id) {
                        setDragOverPartId(null);
                        setDragOverPosition(null);
                      }
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      const sourcePartId = draggingPartId ?? e.dataTransfer.getData("text/plain");
                      if (sourcePartId && sourcePartId !== part.id) {
                        onPartReorderByDrag(sourcePartId, part.id, dragOverPosition === "after");
                      }
                      setDraggingPartId(null);
                      setDragOverPartId(null);
                      setDragOverPosition(null);
                    }}
                    onDragEnd={() => {
                      setDraggingPartId(null);
                      setDragOverPartId(null);
                      setDragOverPosition(null);
                    }}
                    className={`flex items-center gap-1 px-2 py-1.5 group cursor-grab border-l-2 ${
                      isSelected
                        ? "bg-violet-900/60 border-violet-400 shadow-[inset_0_0_0_1px_rgba(167,139,250,0.28)]"
                        : "border-transparent hover:bg-zinc-800"
                    } ${isDragging ? "opacity-60" : ""} ${
                      isDragTarget
                        ? dragOverPosition === "after"
                          ? "bg-zinc-800 ring-1 ring-inset ring-violet-500/70 border-b border-violet-500/70"
                          : "bg-zinc-800 ring-1 ring-inset ring-violet-500/70 border-t border-violet-500/70"
                        : ""
                    }`}
                  >
                    <div className="flex-1 min-w-0" style={{ paddingLeft: `${indentPx}px` }}>
                      <button
                        onClick={() => onSelectPart(isSelected ? null : part.id)}
                        aria-current={isSelected ? "true" : undefined}
                        className={`w-full text-left transition-colors ${
                          !part.isVisible ? "opacity-40" : ""
                        }`}
                        title={part.name}
                      >
                        <span
                          className={`block truncate text-sm ${
                            isSelected ? "text-violet-200" : "text-zinc-300"
                          }`}
                        >
                          {depth > 0 ? "↳ " : ""}{part.name}
                        </span>
                        {parent && (
                          <span className="block truncate text-[10px] text-zinc-500">
                            follows {parent.name}
                          </span>
                        )}
                      </button>
                    </div>

                    <button
                      onClick={() => onToggleLock(part.id)}
                      title={isLocked ? "Unlock" : "Lock"}
                      className={`flex-shrink-0 rounded px-1 text-xs transition-colors ${
                        isLocked
                          ? "text-amber-300 hover:bg-zinc-800"
                          : "text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
                      }`}
                    >
                      {isLocked ? "🔒" : "🔓"}
                    </button>

                    <button
                      onClick={() => onToggleVisibility(part.id)}
                      title={part.isVisible ? "Hide" : "Show"}
                      className={`flex-shrink-0 p-1 rounded transition-colors ${
                        part.isVisible
                          ? "text-zinc-500 hover:text-zinc-200"
                          : "text-zinc-700 hover:text-zinc-400"
                      }`}
                    >
                      {part.isVisible ? <EyeOpenIcon /> : <EyeClosedIcon />}
                    </button>

                    <button
                      onClick={() => onDeletePart(part.id)}
                      disabled={isLocked}
                      title={isLocked ? "Unlock to delete" : "Delete part"}
                      className={`flex-shrink-0 p-1 rounded transition-colors ${
                        isLocked
                          ? "text-zinc-800 cursor-not-allowed opacity-40"
                          : "text-zinc-700 hover:text-red-400 opacity-0 group-hover:opacity-100"
                      }`}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {selectedPart && (
        <div className="border-t border-zinc-800 px-3 py-2.5 space-y-2.5">
          <p className="text-xs font-medium text-zinc-400 truncate" title={selectedPart.name}>
            {selectedPart.name}
          </p>

          <div className="space-y-1">
            <label htmlFor="part-parent" className="text-xs text-zinc-600">
              Follows
            </label>
            <select
              id="part-parent"
              value={selectedPart.parentId ?? ""}
              onChange={(e) => onPartParentChange(selectedPart.id, e.target.value)}
              disabled={parentOptions.length === 0 || isPartLocked(selectedPart)}
              className={`w-full rounded border bg-zinc-950 px-2 py-1 text-xs outline-none transition-colors ${
                parentOptions.length === 0 || isPartLocked(selectedPart)
                  ? "cursor-not-allowed border-zinc-800 text-zinc-700"
                  : "border-zinc-800 text-zinc-300 hover:border-zinc-700 focus:border-violet-500"
              }`}
            >
              <option value="">None</option>
              {parentOptions.map((part) => (
                <option key={part.id} value={part.id}>
                  {part.name}
                </option>
              ))}
            </select>
          </div>

          {parts.length > 1 && (
            <div className="space-y-1">
              <p className="text-xs text-zinc-600">Layer order</p>
              <div className="flex gap-1">
                <OrderButton
                  onClick={() => onMoveToFront(selectedPart.id)}
                  disabled={isAtFront}
                  title="In front"
                >
                  ⇧
                </OrderButton>
                <OrderButton
                  onClick={() => onMoveUp(selectedPart.id)}
                  disabled={isAtFront}
                  title="Move up"
                >
                  ↑
                </OrderButton>
                <OrderButton
                  onClick={() => onMoveDown(selectedPart.id)}
                  disabled={isAtBack}
                  title="Move down"
                >
                  ↓
                </OrderButton>
                <OrderButton
                  onClick={() => onMoveToBack(selectedPart.id)}
                  disabled={isAtBack}
                  title="Behind"
                >
                  ⇩
                </OrderButton>
              </div>
            </div>
          )}

          {selectedPart.isVisible && (
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <p className="text-xs text-zinc-600">Preview rotation</p>
                <span className="text-xs text-zinc-500 tabular-nums">
                  {selectedPart.rotation}°
                </span>
              </div>
              <div className="flex gap-1">
                <OrderButton
                  onClick={() => onRotateLeft(selectedPart.id)}
                  disabled={isPartLocked(selectedPart)}
                  title="Rotate left"
                >
                  ↺
                </OrderButton>
                <OrderButton
                  onClick={() => onRotateRight(selectedPart.id)}
                  disabled={isPartLocked(selectedPart)}
                  title="Rotate right"
                >
                  ↻
                </OrderButton>
                <OrderButton
                  onClick={() => onResetRotation(selectedPart.id)}
                  disabled={selectedPart.rotation === 0 || isPartLocked(selectedPart)}
                  title="Reset rotation"
                >
                  0°
                </OrderButton>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-zinc-600 flex items-center gap-1">
              <span className="text-amber-500/70">⊕</span>
              Movement point set
            </span>
            <button
              onClick={() => onResetMovementPoint(selectedPart.id)}
              disabled={isPartLocked(selectedPart)}
              title="Reset movement point to center"
              className={`text-xs transition-colors whitespace-nowrap ${
                isPartLocked(selectedPart)
                  ? "text-zinc-700 cursor-not-allowed"
                  : "text-zinc-500 hover:text-zinc-200"
              }`}
            >
              Reset point
            </button>
          </div>
        </div>
      )}

      <div className="px-3 py-2 border-t border-zinc-800">
        <p className="text-zinc-700 text-xs">
          {parts.length} {parts.length === 1 ? "part" : "parts"}
        </p>
      </div>
    </aside>
  );
}

function OrderButton({
  onClick,
  disabled,
  title,
  children,
}: {
  onClick: () => void;
  disabled: boolean;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`flex-1 py-1 rounded text-sm transition-colors ${
        disabled
          ? "text-zinc-700 cursor-not-allowed"
          : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
      }`}
    >
      {children}
    </button>
  );
}
