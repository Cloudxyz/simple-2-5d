"use client";

import { useEffect, useRef, useState } from "react";

interface NamePartDialogProps {
  onConfirm: (name: string) => void;
  onCancel: () => void;
}

export default function NamePartDialog({ onConfirm, onCancel }: NamePartDialogProps) {
  const [name, setName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onConfirm(name.trim() || "Part");
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onCancel}
    >
      <div
        className="bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl p-5 w-72"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-sm font-semibold text-zinc-200 mb-3">Name this part</h2>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label htmlFor="part-name" className="block text-xs text-zinc-500 mb-1">
              Part name
            </label>
            <input
              id="part-name"
              ref={inputRef}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Escape" && onCancel()}
              placeholder="e.g. Head, Left arm…"
              className="w-full bg-zinc-800 border border-zinc-600 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-violet-500 transition-colors"
            />
          </div>

          <div className="flex gap-2">
            <button
              type="submit"
              className="flex-1 bg-violet-600 hover:bg-violet-500 text-white text-sm px-3 py-2 rounded-lg font-medium transition-colors"
            >
              Create part
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="px-3 py-2 text-zinc-400 hover:text-zinc-200 text-sm rounded-lg hover:bg-zinc-800 transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
