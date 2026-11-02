/** Static library content for the left-hand editor panels. */

export interface EffectPreset {
  id: string;
  label: string;
  kind: string;
  /** Optional param overrides on top of the effect defaults. */
  params?: Record<string, number | string | boolean>;
}

export const EFFECT_PRESETS: EffectPreset[] = [
  { id: "blur", label: "Blur", kind: "gaussianBlur" },
  { id: "glitch", label: "Glitch", kind: "glitchBlocks" },
  { id: "vhs", label: "VHS", kind: "vhs" },
  {
    id: "shake",
    label: "Shake",
    kind: "wave",
    params: { amplitude: 0.04, frequency: 22, speed: 8 },
  },
  { id: "rgb-split", label: "RGB Split", kind: "rgbSplit" },
  { id: "pixelate", label: "Pixelate", kind: "pixelate" },
  { id: "crt", label: "CRT", kind: "crt" },
  { id: "grain", label: "Film Grain", kind: "grain" },
  { id: "bloom", label: "Bloom", kind: "bloom" },
  { id: "scanlines", label: "Scanlines", kind: "scanlines" },
];

export interface FilterPreset {
  id: string;
  label: string;
  swatch: string;
  presetId?: string;
  params?: Record<string, number>;
}

export const FILTER_PRESETS: FilterPreset[] = [
  { id: "cinematic", label: "Cinematic", swatch: "linear-gradient(135deg,#0e7490,#ea580c)", presetId: "teal-orange" },
  { id: "warm", label: "Warm", swatch: "#c47a3a", params: { temperature: 0.45, saturation: 1.08, contrast: 1.05 } },
  { id: "cold", label: "Cold", swatch: "#6ea8c9", params: { temperature: -0.45, tint: 0.08, saturation: 0.95 } },
  { id: "bw", label: "B&W", swatch: "#8a8a8a", presetId: "noir" },
  { id: "vivid", label: "Vivid", swatch: "#e23d6a", params: { saturation: 1.65, contrast: 1.12, gain: 1.05 } },
];

export const CAPTION_FONTS = [
  "Inter",
  "Arial",
  "Impact",
  "Georgia",
  "Montserrat",
  "Oswald",
  "Bebas Neue",
  "Anton",
];
