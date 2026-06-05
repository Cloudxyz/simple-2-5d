"use client";

import type { Part } from "@/types/rig";

interface PartsSidebarProps {
  parts: Part[];
  selectedPartId: string | null;
  onSelectPart: (id: string | null) => void;
  onDeletePart: (id: string) => void;
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
  onDeletePart,
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
  // Display order: highest zIndex first (in front at top — matches Figma/Photoshop convention)
  const sortedParts = [...parts].sort((a, b) => b.zIndex - a.zIndex);
  const selectedPart = parts.find((p) => p.id === selectedPartId) ?? null;

  // Position of the selected part in sorted order (0 = front)
  const selectedSortedIdx = sortedParts.findIndex((p) => p.id === selectedPartId);
  const isAtFront = selectedSortedIdx === 0;
  const isAtBack = selectedSortedIdx === sortedParts.length - 1;

  return (
    <aside className="w-56 bg-zinc-900 border-l border-zinc-800 flex flex-col flex-shrink-0">
      <div className="px-3 py-2 border-b border-zinc-800">
        <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Layers</h2>
      </div>

      <div className="flex-1 overflow-y-auto">
        {sortedParts.length === 0 ? (
          <p className="px-3 py-4 text-zinc-600 text-xs leading-relaxed">
            No parts yet. Choose the Select tool, then drag a rectangle over any body part.
          </p>
        ) : (
          <ul className="py-1">
            {sortedParts.map((part) => {
              const isSelected = part.id === selectedPartId;
              return (
                <li key={part.id}>
                  <div
                    className={`flex items-center gap-1 px-2 py-1.5 group ${
                      isSelected ? "bg-violet-900/50" : "hover:bg-zinc-800"
                    }`}
                  >
                    {/* Part name — click to select */}
                    <button
                      onClick={() => onSelectPart(isSelected ? null : part.id)}
                      className={`flex-1 text-left text-sm truncate transition-colors ${
                        isSelected ? "text-violet-200" : "text-zinc-300"
                      } ${!part.isVisible ? "opacity-40" : ""}`}
                      title={part.name}
                    >
                      {part.name}
                    </button>

                    {/* Visibility toggle */}
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

                    {/* Delete */}
                    <button
                      onClick={() => onDeletePart(part.id)}
                      title="Delete part"
                      className="flex-shrink-0 p-1 rounded text-zinc-700 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
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

      {/* Selected part detail panel */}
      {selectedPart && (
        <div className="border-t border-zinc-800 px-3 py-2.5 space-y-2.5">
          <p className="text-xs font-medium text-zinc-400 truncate" title={selectedPart.name}>
            {selectedPart.name}
          </p>

          {/* Layer order controls */}
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

          {/* Rotation preview — only when the part is visible */}
          {selectedPart.isVisible && (
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <p className="text-xs text-zinc-600">Preview rotation</p>
                <span className="text-xs text-zinc-500 tabular-nums">
                  {selectedPart.rotation}°
                </span>
              </div>
              <div className="flex gap-1">
                <button
                  onClick={() => onRotateLeft(selectedPart.id)}
                  title="Rotate left"
                  className="flex-1 py-1 rounded text-sm text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
                >
                  ↺
                </button>
                <button
                  onClick={() => onRotateRight(selectedPart.id)}
                  title="Rotate right"
                  className="flex-1 py-1 rounded text-sm text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
                >
                  ↻
                </button>
                <button
                  onClick={() => onResetRotation(selectedPart.id)}
                  disabled={selectedPart.rotation === 0}
                  title="Reset rotation"
                  className={`flex-1 py-1 rounded text-xs transition-colors ${
                    selectedPart.rotation === 0
                      ? "text-zinc-700 cursor-not-allowed"
                      : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
                  }`}
                >
                  0°
                </button>
              </div>
            </div>
          )}

          {/* Movement point */}
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-zinc-600 flex items-center gap-1">
              <span className="text-amber-500/70">⊕</span>
              Movement point set
            </span>
            <button
              onClick={() => onResetMovementPoint(selectedPart.id)}
              title="Reset movement point to center"
              className="text-xs text-zinc-500 hover:text-zinc-200 transition-colors whitespace-nowrap"
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
