import { Suspense } from "react";
import { EditorLoader } from "./EditorLoader";

export const metadata = {
  title: "Editor — CapFree",
};

export default function EditorPage() {
  return (
    <Suspense fallback={<div className="h-full bg-[#1a1a1e]" />}>
      <EditorLoader />
    </Suspense>
  );
}
