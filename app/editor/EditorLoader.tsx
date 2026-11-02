"use client";

import dynamic from "next/dynamic";

const EditorRuntime = dynamic(
  () => import("./EditorShell").then((mod) => ({ default: mod.EditorShell })),
  {
    ssr: false,
    loading: () => <div className="h-full bg-[#1a1a1e]" />,
  },
);

/** Client-only load so Next never prerenders EditorProvider (Math.random). */
export function EditorLoader() {
  return <EditorRuntime />;
}
