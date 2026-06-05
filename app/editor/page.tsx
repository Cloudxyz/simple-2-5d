"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import EditorLayout from "@/components/editor/EditorLayout";

function EditorContent() {
  const searchParams = useSearchParams();
  const name = searchParams.get("name") || "Untitled";
  const freshStart = searchParams.get("new") === "1";

  return <EditorLayout characterName={name} freshStart={freshStart} />;
}

export default function EditorPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center text-zinc-500">
          Loading editor…
        </div>
      }
    >
      <EditorContent />
    </Suspense>
  );
}
