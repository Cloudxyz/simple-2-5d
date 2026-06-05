"use client";

type Tool = "select" | "move" | "point";

interface ToolbarProps {
  activeTool: Tool;
  onToolChange: (tool: Tool) => void;
  zoomPercent: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetView: () => void;
  hasImage: boolean;
}

const tools: { id: Tool; label: string; icon: string; description: string }[] = [
  { id: "select", label: "Select", icon: "↖", description: "Select and define a part" },
  { id: "move", label: "Move", icon: "✥", description: "Drag to pan the canvas" },
  { id: "point", label: "Movement point", icon: "⊕", description: "Set the pivot for a part" },
];

export default function Toolbar({
  activeTool,
  onToolChange,
  zoomPercent,
  onZoomIn,
  onZoomOut,
  onResetView,
  hasImage,
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
