"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

const STORAGE_KEY = "simple2_5d_project_v1";

export default function NewCharacter() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [hasProject, setHasProject] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    setHasProject(!!localStorage.getItem(STORAGE_KEY));
  }, []);

  function handleStart(e: React.FormEvent) {
    e.preventDefault();
    const slug = name.trim() || "untitled";
    const url = dismissed
      ? `/editor?name=${encodeURIComponent(slug)}&new=1`
      : `/editor?name=${encodeURIComponent(slug)}`;
    router.push(url);
  }

  const showWarning = hasProject && !dismissed;

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-4">
      <div className="max-w-md w-full space-y-6">
        <div>
          <Link href="/" className="text-zinc-500 hover:text-zinc-300 text-sm transition-colors">
            ← Back
          </Link>
          <h1 className="text-3xl font-bold mt-4">New character</h1>
          <p className="text-zinc-400 mt-1 text-sm">
            Give your character a name to get started.
          </p>
        </div>

        {/* Overwrite warning */}
        {showWarning && (
          <div className="bg-amber-950/40 border border-amber-800/60 rounded-lg px-4 py-4 space-y-3">
            <div>
              <p className="text-amber-300 font-medium text-sm">You have a saved project</p>
              <p className="text-amber-500/80 text-xs mt-0.5 leading-relaxed">
                Starting a new character will replace it the next time you save.
              </p>
            </div>
            <div className="flex gap-2">
              <Link
                href="/editor"
                className="flex-1 text-center text-sm px-3 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition-colors"
              >
                Continue editing
              </Link>
              <button
                onClick={() => setDismissed(true)}
                className="flex-1 text-sm px-3 py-1.5 rounded border border-amber-800/60 hover:border-amber-700 text-amber-400 hover:text-amber-300 transition-colors"
              >
                Start new anyway
              </button>
            </div>
          </div>
        )}

        <form onSubmit={handleStart} className="space-y-4">
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-zinc-300 mb-1">
              Character name
            </label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Character"
              className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-2.5 text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-violet-500 transition-colors"
            />
          </div>

          <button
            type="submit"
            className="w-full bg-violet-600 hover:bg-violet-500 text-white px-6 py-3 rounded-lg font-medium transition-colors"
          >
            Open editor
          </button>
        </form>

        <div className="border border-zinc-800 rounded-lg p-4 space-y-2">
          <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">
            What happens next
          </h2>
          <ul className="text-sm text-zinc-500 space-y-1 list-disc list-inside">
            <li>Upload a transparent PNG</li>
            <li>Select and name each body part</li>
            <li>Set movement points</li>
            <li>Preview your character moving</li>
            <li>Save and export</li>
          </ul>
        </div>
      </div>
    </main>
  );
}
