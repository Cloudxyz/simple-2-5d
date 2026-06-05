"use client";

import { useEffect, useRef, useState } from "react";
import { findGroupById, isPartDirectlyLocked, isPartEffectivelyLocked, isPartEffectivelyVisible } from "@/lib/layers";
import type { CharacterRig, LayerGroup, Part, SavedPose } from "@/types/rig";

interface HistoryEntry {
  id: string;
  label: string;
  rig: CharacterRig;
  timestamp: number;
}

interface PartsSidebarProps {
  parts: Part[];
  groups: LayerGroup[];
  selectedPartId: string | null;
  selectedGroupId: string | null;
  onSelectPart: (id: string | null) => void;
  onSelectGroup: (id: string | null) => void;
  onCreateGroup: () => void;
  onRenameGroup: (groupId: string, name: string) => void;
  onDeleteGroup: (groupId: string) => void;
  onToggleGroupLock: (groupId: string) => void;
  onToggleGroupVisibility: (groupId: string) => void;
  onToggleGroupExpanded: (groupId: string) => void;
  onPartGroupChange: (partId: string, groupId: string) => void;
  onPartRename: (partId: string, name: string) => void;
  onPartParentChange: (partId: string, parentId: string) => void;
  onRemovePartLink: (partId: string) => void;
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
  onMovePointToParent: (id: string) => void;
  onMoveToFront: (id: string) => void;
  onMoveUp: (id: string) => void;
  onMoveDown: (id: string) => void;
  onMoveToBack: (id: string) => void;
  onRotateLeft: (id: string) => void;
  onRotateRight: (id: string) => void;
  onResetRotation: (id: string) => void;
  poses: SavedPose[];
  onSavePose: () => void;
  onApplyPose: (poseId: string) => void;
  onRenamePose: (poseId: string, name: string) => void;
  onDeletePose: (poseId: string) => void;
  history: HistoryEntry[];
  historyIndex: number;
  onHistoryJump: (index: number) => void;
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
  selectedGroupId,
  onSelectPart,
  onSelectGroup,
  onCreateGroup,
  onRenameGroup,
  onDeleteGroup,
  onToggleGroupLock,
  onToggleGroupVisibility,
  onToggleGroupExpanded,
  onPartGroupChange,
  onPartRename,
  onPartParentChange,
  onRemovePartLink,
  onPartReorderByDrag,
  onGroupReorderByDrag,
  onDeletePart,
  onToggleLock,
  onToggleVisibility,
  onResetMovementPoint,
  onMovePointToParent,
  onMoveToFront,
  onMoveUp,
  onMoveDown,
  onMoveToBack,
  onRotateLeft,
  onRotateRight,
  onResetRotation,
  poses,
  onSavePose,
  onApplyPose,
  onRenamePose,
  onDeletePose,
  history,
  historyIndex,
  onHistoryJump,
}: PartsSidebarProps) {
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const historyListRef = useRef<HTMLDivElement>(null);
  const [posesExpanded, setPosesExpanded] = useState(true);
  const [editingPoseId, setEditingPoseId] = useState<string | null>(null);
  const [editingPoseName, setEditingPoseName] = useState("");

  useEffect(() => {
    if (!historyExpanded || !historyListRef.current) return;
    const container = historyListRef.current;
    const reversedIdx = history.length - 1 - historyIndex;
    const item = container.children[reversedIdx] as HTMLElement | undefined;
    item?.scrollIntoView({ block: "nearest" });
  }, [historyIndex, historyExpanded]); // eslint-disable-line react-hooks/exhaustive-deps
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

  for (const group of groups) {
    if (seenGroupIds.has(group.id)) continue;
    layerBlocks.push({
      type: "group",
      group,
      items: groupedParts.get(group.id) ?? [],
    });
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
    const isEffectivelyVisible = isPartEffectivelyVisible(part, groups);
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
                  !isEffectivelyVisible ? "opacity-40" : ""
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
              const isSelected = selectedGroupId === group.id;
              const isAssignTarget = dragOverGroupId === group.id && draggingPartId !== null;
              const isReorderTarget = dragOverFolderReorderId === group.id && draggingGroupId !== group.id;

              return (
                <div key={group.id} className="mb-1">
                  <div
                    draggable
                    onClick={() => {
                      if (!isEditing) onSelectGroup(isSelected ? null : group.id);
                    }}
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
                    className={`flex items-center gap-1 px-2 py-1.5 cursor-grab border-l-2 ${
                      isAssignTarget || isReorderTarget
                        ? dragOverPosition === "after" && isReorderTarget
                          ? "border-violet-500 bg-zinc-800/90 ring-1 ring-inset ring-violet-500/60 border-b border-violet-500/70"
                          : "border-violet-500 bg-zinc-800/90 ring-1 ring-inset ring-violet-500/60"
                        : isSelected
                          ? "bg-violet-900/60 border-violet-400 shadow-[inset_0_0_0_1px_rgba(167,139,250,0.28)]"
                          : "border-transparent hover:bg-zinc-800/80"
                    } ${draggingGroupId === group.id ? "opacity-60" : ""}`}
                  >
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleGroupExpanded(group.id);
                      }}
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
                        onClick={(e) => e.stopPropagation()}
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
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectGroup(isSelected ? null : group.id);
                        }}
                        onDoubleClick={() => startGroupRename(group)}
                        className="flex-1 min-w-0 text-left"
                        title={group.name}
                      >
                        <span className={`block truncate text-sm ${isSelected ? "text-violet-200" : "text-zinc-200"}`}>📁 {group.name}</span>
                        <span className="block truncate text-[10px] text-zinc-500">
                          {groupParts.length} {groupParts.length === 1 ? "part" : "parts"}
                        </span>
                      </button>
                    )}

                    {!isEditing && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          startGroupRename(group);
                        }}
                        title="Rename folder"
                        className="flex-shrink-0 rounded px-1 text-xs text-zinc-500 hover:bg-zinc-700 hover:text-zinc-200 transition-colors"
                      >
                        ✎
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleGroupVisibility(group.id);
                      }}
                      title={group.isVisible === false ? "Show folder" : "Hide folder"}
                      className={`flex-shrink-0 p-1 rounded transition-colors ${
                        group.isVisible === false
                          ? "text-zinc-700 hover:text-zinc-400"
                          : "text-zinc-500 hover:text-zinc-200"
                      }`}
                    >
                      {group.isVisible === false ? <EyeClosedIcon /> : <EyeOpenIcon />}
                    </button>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleGroupLock(group.id);
                      }}
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
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteGroup(group.id);
                      }}
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
            {selectedPart.parentId && (
              <button
                onClick={() => onRemovePartLink(selectedPart.id)}
                disabled={selectedPartEffectiveLocked}
                className={`text-[11px] px-2 py-0.5 rounded border transition-colors ${
                  selectedPartEffectiveLocked
                    ? "cursor-not-allowed border-zinc-800 text-zinc-700"
                    : "border-zinc-700 text-zinc-400 hover:border-red-700 hover:text-red-400"
                }`}
              >
                Remove link
              </button>
            )}
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
              Rotation Point
            </span>
            <div className="flex items-center gap-2">
              {selectedPart.parentId && (() => {
                const parentPart = parts.find((p) => p.id === selectedPart.parentId);
                const parentVisible = isPartEffectivelyVisible(parentPart ?? null, groups);
                const disabled = selectedPartEffectiveLocked || !parentPart || !parentVisible;
                return (
                  <button
                    onClick={() => onMovePointToParent(selectedPart.id)}
                    disabled={disabled}
                    title="Move rotation point to parent's rotation point"
                    className={`text-xs transition-colors whitespace-nowrap ${
                      disabled
                        ? "text-zinc-700 cursor-not-allowed"
                        : "text-zinc-500 hover:text-zinc-200"
                    }`}
                  >
                    Move to parent
                  </button>
                );
              })()}
              <button
                onClick={() => onResetMovementPoint(selectedPart.id)}
                disabled={selectedPartEffectiveLocked}
                title="Center rotation point on bounds"
                className={`text-xs transition-colors whitespace-nowrap ${
                  selectedPartEffectiveLocked
                    ? "text-zinc-700 cursor-not-allowed"
                    : "text-zinc-500 hover:text-zinc-200"
                }`}
              >
                Center point
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Poses panel */}
      <div className="border-t border-zinc-800 flex-shrink-0">
        <button
          onClick={() => setPosesExpanded((v) => !v)}
          className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold text-zinc-500 uppercase tracking-wider hover:text-zinc-300 transition-colors"
        >
          <span>Poses</span>
          <span className="text-zinc-600">{posesExpanded ? "▾" : "▸"}</span>
        </button>
        {posesExpanded && (
          <div className="border-t border-zinc-800/60">
            <div className="px-3 py-1.5">
              <button
                onClick={onSavePose}
                className="w-full text-xs rounded border border-zinc-700 px-2 py-1 text-zinc-400 hover:border-violet-600 hover:text-violet-300 transition-colors"
              >
                + Save pose
              </button>
            </div>
            {poses.length === 0 ? (
              <p className="px-3 pb-2 text-[11px] text-zinc-600">No poses saved yet.</p>
            ) : (
              <ul className="pb-1">
                {poses.map((pose) => (
                  <li key={pose.id} className="flex items-center gap-1 px-2 py-0.5 group">
                    {editingPoseId === pose.id ? (
                      <input
                        autoFocus
                        value={editingPoseName}
                        onChange={(e) => setEditingPoseName(e.target.value)}
                        onBlur={() => {
                          onRenamePose(pose.id, editingPoseName);
                          setEditingPoseId(null);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            onRenamePose(pose.id, editingPoseName);
                            setEditingPoseId(null);
                          } else if (e.key === "Escape") {
                            setEditingPoseId(null);
                          }
                        }}
                        className="flex-1 min-w-0 bg-zinc-900 border border-violet-600 rounded px-1 py-0.5 text-xs text-zinc-200 outline-none"
                      />
                    ) : (
                      <span
                        className="flex-1 min-w-0 truncate text-[11px] text-zinc-300 cursor-default"
                        title={pose.name}
                      >
                        {pose.name}
                      </span>
                    )}
                    <button
                      onClick={() => onApplyPose(pose.id)}
                      title="Apply this pose"
                      className="flex-shrink-0 text-[10px] px-1.5 py-0.5 rounded border border-zinc-700 text-zinc-400 hover:border-violet-600 hover:text-violet-300 transition-colors"
                    >
                      Apply
                    </button>
                    <button
                      onClick={() => {
                        setEditingPoseId(pose.id);
                        setEditingPoseName(pose.name);
                      }}
                      title="Rename pose"
                      className="flex-shrink-0 text-[10px] px-1.5 py-0.5 rounded border border-zinc-700 text-zinc-400 hover:border-zinc-300 transition-colors opacity-0 group-hover:opacity-100"
                    >
                      ✎
                    </button>
                    <button
                      onClick={() => onDeletePose(pose.id)}
                      title="Delete pose"
                      className="flex-shrink-0 text-[10px] px-1.5 py-0.5 rounded border border-zinc-700 text-zinc-400 hover:border-red-700 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {/* History panel */}
      <div className="border-t border-zinc-800 flex-shrink-0">
        <button
          onClick={() => {
            setHistoryExpanded((v) => !v);
          }}
          className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold text-zinc-500 uppercase tracking-wider hover:text-zinc-300 transition-colors"
        >
          <span>History</span>
          <span className="text-zinc-600">{historyExpanded ? "▾" : "▸"}</span>
        </button>
        {historyExpanded && (
          <div
            ref={historyListRef}
            className="overflow-y-auto border-t border-zinc-800/60"
            style={{ maxHeight: "160px" }}
          >
            {history.length === 0 ? (
              <p className="px-3 py-2 text-[11px] text-zinc-600">No history yet.</p>
            ) : (
              [...history].reverse().map((entry, reversedIdx) => {
                const idx = history.length - 1 - reversedIdx;
                const isCurrent = idx === historyIndex;
                const isFuture = idx > historyIndex;
                const d = new Date(entry.timestamp);
                const timeStr = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
                return (
                  <button
                    key={entry.id}
                    onClick={() => onHistoryJump(idx)}
                    title={timeStr}
                    className={`w-full text-left px-3 py-1.5 flex items-center gap-2 transition-colors ${
                      isCurrent
                        ? "bg-violet-900/50 text-violet-200"
                        : isFuture
                        ? "text-zinc-600 hover:bg-zinc-800/60 hover:text-zinc-400"
                        : "text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200"
                    }`}
                  >
                    <span className="flex-1 truncate text-[11px]">{entry.label}</span>
                    <span className="text-[10px] text-zinc-600 flex-shrink-0 tabular-nums">{timeStr}</span>
                  </button>
                );
              })
            )}
          </div>
        )}
      </div>

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
