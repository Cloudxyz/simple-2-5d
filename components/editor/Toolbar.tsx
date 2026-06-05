"use client";

type Tool = "select" | "move" | "point" | "pen";

interface ToolbarProps {
  activeTool: Tool;
  onToolChange: (tool: Tool) => void;
  zoomPercent: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetView: () => void;
  hasImage: boolean;
  showStructure: boolean;
  onToggleStructure: () => void;
}

const tools: { id: Tool; label: string; icon: string; description: string }[] = [
  { id: "select", label: "Select", icon: "↖", description: "Select parts or drag a rectangle region" },
  { id: "pen", label: "Pen", icon: "✏", description: "Create or edit point-based parts" },
  { id: "move", label: "Move Canvas", icon: "✥", description: "Pan around the canvas" },
  { id: "point", label: "Rotation Point", icon: "⊕", description: "Set where the selected part rotates from" },
];

export default function Toolbar({
  activeTool,
  onToolChange,
  zoomPercent,
  onZoomIn,
  onZoomOut,
  onResetView,
  hasImage,
  showStructure,
  onToggleStructure,
}: ToolbarProps) {
  return (
    <div className="flex items-center justify-between px-3 py-1.5 bg-zinc-900 border-b border-zinc-800 flex-shrink-0">
      {/* Tool buttons */}
      <div className="flex items-center gap-1">
        {tools.map((tool) => (
          <button
            key={tool.id}
            onClick={() => onToolChange(tool.id)}
            title={tool.description}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-sm transition-colors ${
              activeTool === tool.id
                ? "bg-violet-700 text-white"
                : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
            }`}
          >
            <span className="font-mono text-xs">{tool.icon}</span>
            <span>{tool.label}</span>
          </button>
        ))}
      </div>

      {/* Structure toggle */}
      {hasImage && (
        <button
          onClick={onToggleStructure}
          title="Show parent-child connections between parts"
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-sm transition-colors ${
            showStructure
              ? "bg-violet-900/60 text-violet-300 ring-1 ring-violet-500/50"
              : "text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800"
          }`}
        >
          <span className="font-mono text-xs">⬡</span>
          <span>Structure</span>
        </button>
      )}

      {/* Zoom controls — only shown once an image is loaded */}
      {hasImage && (
        <div className="flex items-center gap-1">
          <button
            onClick={onZoomOut}
            title="Zoom out"
            className="w-7 h-7 flex items-center justify-center rounded text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors text-sm"
          >
            −
          </button>
          <span className="text-zinc-500 text-xs w-12 text-center tabular-nums">
            {zoomPercent}%
          </span>
          <button
            onClick={onZoomIn}
            title="Zoom in"
            className="w-7 h-7 flex items-center justify-center rounded text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors text-sm"
          >
            +
          </button>
          <button
            onClick={onResetView}
            title="Reset view"
            className="ml-1 px-2.5 py-1 rounded text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors text-xs"
          >
            Reset view
          </button>
        </div>
      )}
    </div>
  );
}
