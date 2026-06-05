"use client";

import { useEffect, useRef, useState } from "react";
import { findGroupById, isPartDirectlyLocked, isPartEffectivelyLocked } from "@/lib/layers";
import type { LayerGroup, Part } from "@/types/rig";

interface PartsSidebarProps {
  parts: Part[];
  groups: LayerGroup[];
  selectedPartId: string | null;
  onSelectPart: (id: string | null) => void;
  onCreateGroup: () => void;
  onRenameGroup: (groupId: string, name: string) => void;
  onDeleteGroup: (groupId: string) => void;
  onToggleGroupLock: (groupId: string) => void;
  onToggleGroupExpanded: (groupId: string) => void;
  onPartGroupChange: (partId: string, groupId: string) => void;
  onPartRename: (partId: string, name: string) => void;
  onPartParentChange: (partId: string, parentId: string) => void;
  onPartReorderByDrag: (sourcePartId: string, targetPartId: string, placeAfter: boolean) => void;
  onGroupReorderByDrag: (
    sourceGroupId: string,
    targetId: string,
    targetType: "group" | "part",
    placeAfter: boolean
  ) => void;
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
  groups,
  selectedPartId,
  onSelectPart,
  onCreateGroup,
  onRenameGroup,
  onDeleteGroup,
  onToggleGroupLock,
  onToggleGroupExpanded,
  onPartGroupChange,
  onPartRename,
  onPartParentChange,
  onPartReorderByDrag,
  onGroupReorderByDrag,
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
  const [draggingGroupId, setDraggingGroupId] = useState<string | null>(null);
  const [dragOverPartId, setDragOverPartId] = useState<string | null>(null);
  const [dragOverFolderReorderId, setDragOverFolderReorderId] = useState<string | null>(null);
  const [dragOverPosition, setDragOverPosition] = useState<"before" | "after" | null>(null);
  const [dragOverGroupId, setDragOverGroupId] = useState<string | null>(null);
  const [isRootDragOver, setIsRootDragOver] = useState(false);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editingGroupName, setEditingGroupName] = useState("");
  const [editingPartId, setEditingPartId] = useState<string | null>(null);
  const [editingPartName, setEditingPartName] = useState("");
  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const partsById = new Map(parts.map((part) => [part.id, part]));
  const groupsById = new Map(groups.map((group) => [group.id, group]));
  const sortedParts = [...parts]
    .sort((a, b) => b.zIndex - a.zIndex)
    .map((part) => ({
      part,
      parent: part.parentId ? partsById.get(part.parentId) ?? null : null,
      depth: getPartDepth(part, partsById),
      group: findGroupById(groups, part.groupId),
    }));

  const selectedPart = parts.find((part) => part.id === selectedPartId) ?? null;
  const selectedPartEffectiveLocked = isPartEffectivelyLocked(selectedPart, groups);
  const selectedPartGroup = findGroupById(groups, selectedPart?.groupId);
  const parentOptions = selectedPart
    ? sortedParts.map(({ part }) => part).filter((part) => part.id !== selectedPart.id)
    : [];
  const selectedSortedIdx = sortedParts.findIndex(({ part }) => part.id === selectedPartId);
  const isAtFront = selectedSortedIdx === 0;
  const isAtBack = selectedSortedIdx === sortedParts.length - 1;

  useEffect(() => {
    if (!selectedPartId) return;
    rowRefs.current[selectedPartId]?.scrollIntoView({ block: "nearest" });
  }, [selectedPartId]);

  useEffect(() => {
    if (editingGroupId && !groups.some((group) => group.id === editingGroupId)) {
      setEditingGroupId(null);
      setEditingGroupName("");
    }
  }, [editingGroupId, groups]);

  useEffect(() => {
    if (editingPartId && !parts.some((part) => part.id === editingPartId)) {
      setEditingPartId(null);
      setEditingPartName("");
    }
  }, [editingPartId, parts]);

  const groupedParts = new Map<string, typeof sortedParts>();
  for (const item of sortedParts) {
    if (!item.part.groupId || !groupsById.has(item.part.groupId)) continue;
    if (!groupedParts.has(item.part.groupId)) groupedParts.set(item.part.groupId, []);
    groupedParts.get(item.part.groupId)!.push(item);
  }
  const layerBlocks: Array<
    | { type: "group"; group: LayerGroup; items: typeof sortedParts }
    | { type: "part"; item: (typeof sortedParts)[number] }
  > = [];
  const seenGroupIds = new Set<string>();

  for (const item of sortedParts) {
    const groupId = item.part.groupId;
    if (groupId && groupsById.has(groupId)) {
      if (seenGroupIds.has(groupId)) continue;
      seenGroupIds.add(groupId);
      const group = groupsById.get(groupId);
      if (!group) continue;
      layerBlocks.push({
        type: "group",
        group,
        items: groupedParts.get(groupId) ?? [],
      });
      continue;
    }

    layerBlocks.push({ type: "part", item });
  }

  function startGroupRename(group: LayerGroup) {
    setEditingGroupId(group.id);
    setEditingGroupName(group.name);
  }

  function commitGroupRename() {
    if (!editingGroupId) return;
    onRenameGroup(editingGroupId, editingGroupName);
    setEditingGroupId(null);
    setEditingGroupName("");
  }

  function startPartRename(part: Part) {
    setEditingPartId(part.id);
    setEditingPartName(part.name);
  }

  function commitPartRename() {
    if (!editingPartId) return;
    onPartRename(editingPartId, editingPartName);
    setEditingPartId(null);
    setEditingPartName("");
  }

  function resetDragState() {
    setDraggingPartId(null);
    setDraggingGroupId(null);
    setDragOverPartId(null);
    setDragOverFolderReorderId(null);
    setDragOverPosition(null);
    setDragOverGroupId(null);
    setIsRootDragOver(false);
  }

  function renderPartRow(item: (typeof sortedParts)[number], baseIndent: number) {
    const { part, parent, depth } = item;
    const isSelected = part.id === selectedPartId;
    const isDirectlyLocked = isPartDirectlyLocked(part);
    const isEffectivelyLocked = isPartEffectivelyLocked(part, groups);
    const isDragging = draggingPartId === part.id;
    const isDragTarget =
      dragOverPartId === part.id && draggingPartId !== part.id && draggingGroupId === null;
    const isEditing = editingPartId === part.id;
    const indentPx = baseIndent + Math.min(depth, 4) * 12;

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
              setDragOverGroupId(null);
              setIsRootDragOver(false);
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
              onPartGroupChange(sourcePartId, part.groupId ?? "");
              onPartReorderByDrag(sourcePartId, part.id, dragOverPosition === "after");
            }
            if (draggingGroupId && draggingGroupId !== part.groupId) {
              onGroupReorderByDrag(draggingGroupId, part.id, "part", dragOverPosition === "after");
            }
            resetDragState();
          }}
          onDragEnd={resetDragState}
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
            {isEditing ? (
              <input
                autoFocus
                value={editingPartName}
                onChange={(e) => setEditingPartName(e.target.value)}
                onBlur={commitPartRename}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitPartRename();
                  if (e.key === "Escape") {
                    setEditingPartId(null);
                    setEditingPartName("");
                  }
                }}
                className="w-full rounded bg-zinc-950 border border-zinc-700 px-2 py-1 text-xs text-zinc-200 outline-none focus:border-violet-500"
              />
            ) : (
              <button
                onClick={() => onSelectPart(isSelected ? null : part.id)}
                onDoubleClick={() => startPartRename(part)}
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
            )}
          </div>

          {!isEditing && (
            <button
              onClick={() => startPartRename(part)}
              title="Rename part"
              className="flex-shrink-0 rounded px-1 text-xs text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200 transition-colors"
            >
              ✎
            </button>
          )}

          <button
            onClick={() => onToggleLock(part.id)}
            title={isDirectlyLocked ? "Unlock part" : "Lock part"}
            className={`flex-shrink-0 rounded px-1 text-xs transition-colors ${
              isDirectlyLocked
                ? "text-amber-300 hover:bg-zinc-800"
                : "text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
            }`}
          >
            {isDirectlyLocked ? "🔒" : "🔓"}
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
            disabled={isEffectivelyLocked}
            title={isEffectivelyLocked ? "Unlock part or folder to delete" : "Delete part"}
            className={`flex-shrink-0 p-1 rounded transition-colors ${
              isEffectivelyLocked
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
  }

  return (
    <aside className="w-56 bg-zinc-900 border-l border-zinc-800 flex flex-col flex-shrink-0">
      <div className="px-3 py-2 border-b border-zinc-800 flex items-center justify-between gap-2">
        <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Layers</h2>
        <button
          onClick={onCreateGroup}
          className="text-[11px] text-zinc-400 hover:text-zinc-200 transition-colors"
        >
          New folder
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {sortedParts.length === 0 && groups.length === 0 ? (
          <p className="px-3 py-4 text-zinc-600 text-xs leading-relaxed">
            No parts yet. Use Select to drag a region, or Pluma to click points around a shape.
          </p>
        ) : (
          <div className="py-1">
            {layerBlocks.map((block) => {
              if (block.type === "part") {
                return <ul key={block.item.part.id}>{renderPartRow(block.item, 0)}</ul>;
              }

              const { group, items: groupParts } = block;
              const isEditing = editingGroupId === group.id;
              const isAssignTarget = dragOverGroupId === group.id && draggingPartId !== null;
              const isReorderTarget = dragOverFolderReorderId === group.id && draggingGroupId !== group.id;

              return (
                <div key={group.id} className="mb-1">
                  <div
                    draggable
                    onDragStart={(e) => {
                      setDraggingGroupId(group.id);
                      e.dataTransfer.effectAllowed = "move";
                      e.dataTransfer.setData("text/plain", group.id);
                    }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "move";
                      setIsRootDragOver(false);
                      const bounds = e.currentTarget.getBoundingClientRect();
                      const halfwayY = bounds.top + bounds.height / 2;
                      setDragOverPosition(e.clientY < halfwayY ? "before" : "after");
                      if (draggingPartId) {
                        setDragOverGroupId(group.id);
                        setDragOverFolderReorderId(null);
                        setDragOverPartId(null);
                        return;
                      }
                      if (draggingGroupId && draggingGroupId !== group.id) {
                        setDragOverFolderReorderId(group.id);
                        setDragOverGroupId(null);
                        setDragOverPartId(null);
                      }
                    }}
                    onDragLeave={() => {
                      if (dragOverGroupId === group.id) setDragOverGroupId(null);
                      if (dragOverFolderReorderId === group.id) setDragOverFolderReorderId(null);
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (draggingPartId) {
                        onPartGroupChange(draggingPartId, group.id);
                      } else if (draggingGroupId && draggingGroupId !== group.id) {
                        onGroupReorderByDrag(draggingGroupId, group.id, "group", dragOverPosition === "after");
                      }
                      resetDragState();
                    }}
                    onDragEnd={resetDragState}
                    className={`flex items-center gap-1 px-2 py-1.5 hover:bg-zinc-800/80 border-l-2 cursor-grab ${
                      isAssignTarget || isReorderTarget
                        ? dragOverPosition === "after" && isReorderTarget
                          ? "border-violet-500 bg-zinc-800/90 ring-1 ring-inset ring-violet-500/60 border-b border-violet-500/70"
                          : "border-violet-500 bg-zinc-800/90 ring-1 ring-inset ring-violet-500/60"
                        : "border-transparent"
                    } ${draggingGroupId === group.id ? "opacity-60" : ""}`}
                  >
                    <button
                      onClick={() => onToggleGroupExpanded(group.id)}
                      title={group.isExpanded ? "Collapse folder" : "Expand folder"}
                      className="w-4 text-xs text-zinc-500 hover:text-zinc-200 transition-colors"
                    >
                      {group.isExpanded ? "▾" : "▸"}
                    </button>

                    {isEditing ? (
                      <input
                        autoFocus
                        value={editingGroupName}
                        onChange={(e) => setEditingGroupName(e.target.value)}
                        onBlur={commitGroupRename}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") commitGroupRename();
                          if (e.key === "Escape") {
                            setEditingGroupId(null);
                            setEditingGroupName("");
                          }
                        }}
                        className="flex-1 min-w-0 rounded bg-zinc-950 border border-zinc-700 px-2 py-1 text-xs text-zinc-200 outline-none focus:border-violet-500"
                      />
                    ) : (
                      <button
                        onDoubleClick={() => startGroupRename(group)}
                        onClick={() => onToggleGroupExpanded(group.id)}
                        className="flex-1 min-w-0 text-left"
                        title={group.name}
                      >
                        <span className="block truncate text-sm text-zinc-200">📁 {group.name}</span>
                        <span className="block truncate text-[10px] text-zinc-500">
                          {groupParts.length} {groupParts.length === 1 ? "part" : "parts"}
                        </span>
                      </button>
                    )}

                    {!isEditing && (
                      <button
                        onClick={() => startGroupRename(group)}
                        title="Rename folder"
                        className="flex-shrink-0 rounded px-1 text-xs text-zinc-500 hover:bg-zinc-700 hover:text-zinc-200 transition-colors"
                      >
                        ✎
                      </button>
                    )}

                    <button
                      onClick={() => onToggleGroupLock(group.id)}
                      title={group.isLocked ? "Unlock folder" : "Lock folder"}
                      className={`flex-shrink-0 rounded px-1 text-xs transition-colors ${
                        group.isLocked
                          ? "text-amber-300 hover:bg-zinc-700"
                          : "text-zinc-500 hover:bg-zinc-700 hover:text-zinc-200"
                      }`}
                    >
                      {group.isLocked ? "🔒" : "🔓"}
                    </button>

                    <button
                      onClick={() => onDeleteGroup(group.id)}
                      title="Delete folder"
                      className="flex-shrink-0 p-1 rounded text-zinc-700 hover:text-red-400 transition-colors"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  </div>

                  {group.isExpanded && groupParts.length > 0 && (
                    <ul>{groupParts.map((item) => renderPartRow(item, 12))}</ul>
                  )}
                </div>
              );
            })}

            <div
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                setIsRootDragOver(true);
                setDragOverGroupId(null);
                setDragOverFolderReorderId(null);
                setDragOverPartId(null);
                setDragOverPosition(null);
              }}
              onDragLeave={() => {
                setIsRootDragOver(false);
              }}
              onDrop={(e) => {
                e.preventDefault();
                const sourcePartId = draggingPartId ?? (draggingGroupId ? "" : e.dataTransfer.getData("text/plain"));
                if (sourcePartId) onPartGroupChange(sourcePartId, "");
                resetDragState();
              }}
              className={`mt-2 ${isRootDragOver ? "bg-zinc-800/60 ring-1 ring-inset ring-violet-500/60" : ""}`}
            >
              <div className="px-3 py-1 text-[10px] uppercase tracking-wider text-zinc-600">
                Root layers
              </div>
              <div className="px-3 py-2 text-[11px] text-zinc-600">
                Drop here to remove a folder
              </div>
            </div>
          </div>
        )}
      </div>

      {selectedPart && (
        <div className="border-t border-zinc-800 px-3 py-2.5 space-y-2.5">
          <p className="text-xs font-medium text-zinc-400 truncate" title={selectedPart.name}>
            {selectedPart.name}
          </p>

          <div className="space-y-1">
            <label htmlFor="part-group" className="text-xs text-zinc-600">
              Folder
            </label>
            <select
              id="part-group"
              value={selectedPart.groupId ?? ""}
              onChange={(e) => onPartGroupChange(selectedPart.id, e.target.value)}
              disabled={groups.length === 0 || selectedPartEffectiveLocked}
              className={`w-full rounded border bg-zinc-950 px-2 py-1 text-xs outline-none transition-colors ${
                groups.length === 0 || selectedPartEffectiveLocked
                  ? "cursor-not-allowed border-zinc-800 text-zinc-700"
                  : "border-zinc-800 text-zinc-300 hover:border-zinc-700 focus:border-violet-500"
              }`}
            >
              <option value="">None</option>
              {groups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </select>
            {selectedPartGroup?.isLocked && (
              <p className="text-[10px] text-zinc-500">Folder lock is active</p>
            )}
          </div>

          <div className="space-y-1">
            <label htmlFor="part-parent" className="text-xs text-zinc-600">
              Follows
            </label>
            <select
              id="part-parent"
              value={selectedPart.parentId ?? ""}
              onChange={(e) => onPartParentChange(selectedPart.id, e.target.value)}
              disabled={parentOptions.length === 0 || selectedPartEffectiveLocked}
              className={`w-full rounded border bg-zinc-950 px-2 py-1 text-xs outline-none transition-colors ${
                parentOptions.length === 0 || selectedPartEffectiveLocked
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
                  disabled={selectedPartEffectiveLocked}
                  title="Rotate left"
                >
                  ↺
                </OrderButton>
                <OrderButton
                  onClick={() => onRotateRight(selectedPart.id)}
                  disabled={selectedPartEffectiveLocked}
                  title="Rotate right"
                >
                  ↻
                </OrderButton>
                <OrderButton
                  onClick={() => onResetRotation(selectedPart.id)}
                  disabled={selectedPart.rotation === 0 || selectedPartEffectiveLocked}
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
              disabled={selectedPartEffectiveLocked}
              title="Reset movement point to center"
              className={`text-xs transition-colors whitespace-nowrap ${
                selectedPartEffectiveLocked
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
