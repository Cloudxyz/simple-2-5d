"use client";

import { useEffect, useState } from "react";
import type { SavedPose, TimelineStep } from "@/types/rig";

interface TimelinePanelProps {
  poses: SavedPose[];
  timeline: TimelineStep[];
  isTimelinePlaying: boolean;
  onAddTimelineStep: (poseId: string) => void;
  onRemoveTimelineStep: (stepId: string) => void;
  onReorderTimelineStep: (stepId: string, direction: "up" | "down") => void;
  onChangeTimelineStepDuration: (stepId: string, duration: number) => void;
  onPlayTimeline: (loop: boolean) => void;
  onStopPreview: () => void;
}

export default function TimelinePanel({
  poses,
  timeline,
  isTimelinePlaying,
  onAddTimelineStep,
  onRemoveTimelineStep,
  onReorderTimelineStep,
  onChangeTimelineStepDuration,
  onPlayTimeline,
  onStopPreview,
}: TimelinePanelProps) {
  const [addPoseId, setAddPoseId] = useState("");
  const [loop, setLoop] = useState(false);

  useEffect(() => {
    const ids = poses.map((p) => p.id);
    if (!ids.includes(addPoseId)) setAddPoseId(ids[0] ?? "");
  }, [poses]); // eslint-disable-line react-hooks/exhaustive-deps

  const canPlay = timeline.length >= 2;

  return (
    <div
      className="border-t border-zinc-800 bg-zinc-900/50 flex-shrink-0 flex flex-col"
      style={{ height: "148px" }}
    >
      {/* Header row */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-zinc-800/60 flex-shrink-0">
        <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">
          Timeline
        </span>

        {/* Playback controls */}
        <div className="flex items-center gap-1.5 ml-1">
          {isTimelinePlaying ? (
            <button
              onClick={onStopPreview}
              className="text-[11px] px-2 py-0.5 rounded border border-zinc-700 text-zinc-300 hover:border-red-600 hover:text-red-400 transition-colors"
            >
              ■ Stop
            </button>
          ) : (
            <button
              onClick={() => canPlay && onPlayTimeline(loop)}
              disabled={!canPlay}
              title={canPlay ? undefined : "Add at least 2 steps to play"}
              className={`text-[11px] px-2 py-0.5 rounded border transition-colors ${
                canPlay
                  ? "border-zinc-700 text-zinc-300 hover:border-violet-600 hover:text-violet-300"
                  : "border-zinc-800 text-zinc-700 cursor-not-allowed"
              }`}
            >
              ▶ Play Timeline
            </button>
          )}
          <label className="flex items-center gap-1 cursor-pointer">
            <input
              type="checkbox"
              checked={loop}
              onChange={(e) => setLoop(e.target.checked)}
              className="accent-violet-500"
            />
            <span className="text-[11px] text-zinc-400">Loop</span>
          </label>
        </div>

        <div className="flex-1" />

        {/* Add-step controls */}
        {poses.length > 0 && (
          <div className="flex items-center gap-1.5">
            <select
              value={addPoseId}
              onChange={(e) => setAddPoseId(e.target.value)}
              className="rounded border border-zinc-800 bg-zinc-950 px-1.5 py-0.5 text-[11px] text-zinc-300 outline-none hover:border-zinc-700 focus:border-violet-500"
            >
              {poses.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <button
              onClick={() => addPoseId && onAddTimelineStep(addPoseId)}
              disabled={!addPoseId}
              className="text-[11px] px-2 py-0.5 rounded border border-zinc-700 text-zinc-300 hover:border-violet-600 hover:text-violet-300 disabled:border-zinc-800 disabled:text-zinc-700 disabled:cursor-not-allowed transition-colors"
            >
              + Add
            </button>
          </div>
        )}
      </div>

      {/* Steps — horizontal scroll */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden px-3 flex items-center gap-0 min-w-0">
        {poses.length === 0 ? (
          <p className="text-[11px] text-zinc-700">Save poses to build a timeline.</p>
        ) : timeline.length === 0 ? (
          <p className="text-[11px] text-zinc-700">No steps yet. Add a pose above.</p>
        ) : (
          timeline.map((step, idx) => {
            const poseName = poses.find((p) => p.id === step.poseId)?.name ?? "?";
            return (
              <div key={step.id} className="flex items-center gap-0 flex-shrink-0">
                {/* Step card */}
                <div className="flex flex-col gap-1.5 px-2.5 py-1.5 rounded-lg border border-zinc-800 bg-zinc-950 w-[116px]">
                  <span className="text-[11px] text-zinc-200 font-medium truncate leading-tight">
                    {poseName}
                  </span>
                  <div className="flex items-center gap-0.5">
                    <input
                      type="number"
                      min={0.1}
                      max={60}
                      step={0.1}
                      value={step.duration}
                      onChange={(e) => {
                        const v = parseFloat(e.target.value);
                        if (!isNaN(v)) onChangeTimelineStepDuration(step.id, v);
                      }}
                      className="w-11 rounded border border-zinc-800 bg-zinc-900 px-1 py-0.5 text-[11px] text-zinc-300 outline-none hover:border-zinc-700 focus:border-violet-500"
                      title="Duration to next step (s)"
                    />
                    <span className="text-[10px] text-zinc-600 mr-1">s</span>
                    <button
                      onClick={() => onReorderTimelineStep(step.id, "up")}
                      disabled={idx === 0}
                      title="Move left"
                      className="text-[11px] w-5 h-5 flex items-center justify-center rounded text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 disabled:opacity-25 disabled:cursor-not-allowed transition-colors"
                    >
                      ←
                    </button>
                    <button
                      onClick={() => onReorderTimelineStep(step.id, "down")}
                      disabled={idx === timeline.length - 1}
                      title="Move right"
                      className="text-[11px] w-5 h-5 flex items-center justify-center rounded text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 disabled:opacity-25 disabled:cursor-not-allowed transition-colors"
                    >
                      →
                    </button>
                    <button
                      onClick={() => onRemoveTimelineStep(step.id)}
                      title="Remove step"
                      className="text-[11px] w-5 h-5 flex items-center justify-center rounded text-zinc-600 hover:text-red-400 hover:bg-zinc-800 transition-colors"
                    >
                      ✕
                    </button>
                  </div>
                </div>

                {/* Arrow connector */}
                {idx < timeline.length - 1 && (
                  <span className="text-zinc-700 text-xs px-2 flex-shrink-0 select-none">→</span>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
