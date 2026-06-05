"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

const STORAGE_KEY = "simple2_5d_project_v1";

export default function Home() {
  const [hasProject, setHasProject] = useState(false);

  useEffect(() => {
    setHasProject(!!localStorage.getItem(STORAGE_KEY));
  }, []);

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-4 py-16">
      <div className="max-w-2xl w-full space-y-12">

        {/* Hero */}
        <div className="text-center space-y-4">
          <h1 className="text-5xl font-bold tracking-tight">
            SIMPLE <span className="text-violet-400">2.5D</span>
          </h1>
          <p className="text-zinc-400 text-lg max-w-lg mx-auto">
            Turn a transparent PNG into a 2.5D character you can pose and export.
            No 3D software. No rigging experience needed.
          </p>
        </div>

        {/* CTAs */}
        <div className="flex flex-col items-center gap-3">
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href="/new"
              className="bg-violet-600 hover:bg-violet-500 text-white px-6 py-3 rounded-lg font-medium transition-colors text-center"
            >
              New character
            </Link>

            {hasProject && (
              <Link
                href="/editor"
                className="border border-zinc-600 hover:border-zinc-400 text-zinc-200 hover:text-white px-6 py-3 rounded-lg font-medium transition-colors text-center"
              >
                Continue editing
              </Link>
            )}

            <a
              href="https://github.com/cloudzeroxyz/simple-2-5d"
              target="_blank"
              rel="noopener noreferrer"
              className="border border-zinc-700 hover:border-zinc-500 text-zinc-400 hover:text-zinc-200 px-6 py-3 rounded-lg font-medium transition-colors text-center"
            >
              View on GitHub
            </a>
          </div>

          {hasProject && (
            <Link
              href="/export"
              className="text-zinc-500 hover:text-zinc-300 text-sm transition-colors"
            >
              Export project →
            </Link>
          )}
        </div>

        {/* Feature cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          <FeatureCard
            icon="🖼️"
            title="Upload your PNG"
            description="Drop in any transparent PNG character or sprite. Zoom and pan to get a good look."
          />
          <FeatureCard
            icon="✂️"
            title="Select parts"
            description="Drag rectangles to define named body parts — head, arms, legs, whatever fits your character."
          />
          <FeatureCard
            icon="⊕"
            title="Set movement points"
            description="Place a pivot on each part. That's the point it rotates around when you pose it."
          />
          <FeatureCard
            icon="↻"
            title="Preview rotation"
            description="Rotate parts around their pivot to check how your character will look in different poses."
          />
          <FeatureCard
            icon="💾"
            title="Save locally"
            description="Your work saves to your browser. No account, no server, no cloud required."
          />
          <FeatureCard
            icon="📦"
            title="Export PNG + JSON"
            description="Download each part as a transparent PNG crop, plus a JSON file that describes the whole rig."
          />
        </div>

        {/* Footer note */}
        <div className="text-center space-y-1">
          <p className="text-zinc-600 text-sm">
            Runs in your browser · No accounts needed · Open source on GitHub
          </p>
        </div>

      </div>
    </main>
  );
}

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: string;
  title: string;
  description: string;
}) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 space-y-2">
      <div className="text-xl">{icon}</div>
      <h3 className="font-semibold text-zinc-100 text-sm">{title}</h3>
      <p className="text-zinc-500 text-xs leading-relaxed">{description}</p>
    </div>
  );
}
