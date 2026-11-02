"use client";

import { useEffect, useState } from "react";
import { SAMPLE_PHOTO_WIDE } from "../../visuals";
import { cropForAspect, usePreviewLook } from "../../previewLook";
import { PanelBody, PreviewBanner } from "../chrome";

const RATIOS = ["16:9", "1:1", "9:16"] as const;

export function ReframePanel({ active }: { active: boolean }) {
  const look = usePreviewLook();
  const [ratio, setRatio] = useState<(typeof RATIOS)[number]>("9:16");
  const crop = cropForAspect(ratio);

  useEffect(() => {
    look.setReframe(active ? cropForAspect(ratio) : null);
    // Crop overlay is local; avoid looping on look identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, ratio]);

  return (
    <PanelBody>
      <PreviewBanner />
      <div className="relative overflow-hidden rounded-md bg-black">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={SAMPLE_PHOTO_WIDE} alt="Reframe preview" className="h-28 w-full object-cover" />
        <span
          className="pointer-events-none absolute border-2 border-[#00d4b4]"
          style={{
            left: `${crop.x * 100}%`,
            top: `${crop.y * 100}%`,
            width: `${crop.width * 100}%`,
            height: `${crop.height * 100}%`,
          }}
        />
      </div>
      <div className="mt-2 flex gap-1">
        {RATIOS.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setRatio(item)}
            className={`h-8 flex-1 rounded-md text-[12px] ${ratio === item ? "bg-[#00d4b4] text-black" : "bg-[#2a2a30] text-white"}`}
          >
            {item}
          </button>
        ))}
      </div>
    </PanelBody>
  );
}
