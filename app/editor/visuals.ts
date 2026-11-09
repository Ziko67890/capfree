/** Real CDN assets and CSS looks for the editor library panels. */

export const SAMPLE_PHOTO =
  "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=160&h=100&fit=crop";
export const SAMPLE_PHOTO_TALL =
  "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=160&h=240&fit=crop";
export const SAMPLE_PHOTO_WIDE =
  "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=320&h=180&fit=crop";
export const TRANSITION_FROM =
  "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=80&h=120&fit=crop";
export const TRANSITION_TO =
  "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=80&h=120&fit=crop";

export const PORTRAITS = [
  "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&h=260&fit=crop",
  "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200&h=260&fit=crop",
  "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=200&h=260&fit=crop",
  "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=200&h=260&fit=crop",
  "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=200&h=260&fit=crop",
  "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200&h=260&fit=crop",
  "https://images.unsplash.com/photo-1539571696357-a21d4c2c2e8b?w=200&h=260&fit=crop",
  "https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=200&h=260&fit=crop",
  "https://images.unsplash.com/photo-1521119989659-a83eee488004?w=200&h=260&fit=crop",
  "https://images.unsplash.com/photo-1517841905240-472988babdf9?w=200&h=260&fit=crop",
  "https://images.unsplash.com/photo-1488426862026-3ee34a7d66df?w=200&h=260&fit=crop",
  "https://images.unsplash.com/photo-1531746020798-e6953c6c8e3a?w=200&h=260&fit=crop",
];

export const STICKER_CATEGORIES = [
  "Trending",
  "Halloween",
  "B_Duck",
  "Pumpkin Spice",
  "Classic",
  "NEW",
  "Animal Meme",
  "Hits",
  "Free Fire",
  "Party",
  "Emoji",
  "Emphasis",
  "Cover-ups",
  "Love",
  "LETTERS",
  "Mood",
  "Sale",
  "Gaming",
  "Kawaii",
] as const;

export const STICKER_QUERY: Record<string, string> = {
  Trending: "sticker",
  Halloween: "halloween",
  B_Duck: "duck cute",
  "Pumpkin Spice": "pumpkin",
  Classic: "classic cartoon",
  NEW: "sparkle",
  "Animal Meme": "animal funny",
  Hits: "fire",
  "Free Fire": "fire",
  Party: "party",
  Emoji: "emoji",
  Emphasis: "wow",
  "Cover-ups": "heart",
  Love: "love",
  LETTERS: "alphabet",
  Mood: "mood",
  Sale: "sale",
  Gaming: "gaming",
  Kawaii: "kawaii",
};

export interface FilterLook {
  name: string;
  css: string;
}

export const FILTER_LOOKS: FilterLook[] = [
  { name: "Original", css: "none" },
  { name: "Vivid", css: "saturate(1.8) contrast(1.1)" },
  { name: "Cinematic", css: "contrast(1.2) brightness(0.88) saturate(0.85)" },
  { name: "Golden Hour", css: "sepia(0.45) saturate(1.5) brightness(1.08) hue-rotate(-5deg)" },
  { name: "Moonlight", css: "brightness(0.72) contrast(1.25) hue-rotate(215deg) saturate(1.3)" },
  { name: "Warm Glow", css: "sepia(0.3) saturate(1.4) brightness(1.05)" },
  { name: "Cold Steel", css: "hue-rotate(185deg) saturate(0.75) brightness(0.95)" },
  { name: "Faded", css: "brightness(1.12) contrast(0.88) saturate(0.6)" },
  { name: "B&W Classic", css: "grayscale(1)" },
  { name: "B&W High", css: "grayscale(1) contrast(1.45) brightness(0.9)" },
  { name: "B&W Soft", css: "grayscale(0.95) brightness(1.12) contrast(0.92)" },
  { name: "Matte Green", css: "hue-rotate(115deg) saturate(0.65) contrast(1.12)" },
  { name: "Purple Dream", css: "hue-rotate(265deg) saturate(1.35) brightness(0.95)" },
  { name: "Sunset", css: "sepia(0.55) saturate(1.6) hue-rotate(-8deg) brightness(1.05)" },
  { name: "Y2K", css: "saturate(1.7) contrast(1.3) brightness(0.92)" },
  { name: "Film Burn", css: "sepia(0.6) contrast(1.15) brightness(0.9)" },
  { name: "Vogue", css: "contrast(1.4) saturate(0.5) brightness(1.05)" },
  { name: "Tokyo Heat", css: "hue-rotate(345deg) saturate(1.6) contrast(1.18)" },
  { name: "Neon Blush", css: "hue-rotate(315deg) saturate(1.85) brightness(1.1)" },
  { name: "Velvet Matte", css: "saturate(0.55) contrast(1.12) brightness(0.88)" },
  { name: "Clear 1", css: "brightness(1.18) contrast(0.93) saturate(0.88)" },
  { name: "Concrete Blue", css: "saturate(0.65) hue-rotate(195deg) contrast(1.22)" },
  { name: "Spotlight", css: "brightness(1.35) contrast(1.35) saturate(0.65)" },
  { name: "Rio Nights", css: "brightness(0.82) contrast(1.32) hue-rotate(18deg)" },
  { name: "Coastal", css: "hue-rotate(195deg) saturate(1.2) brightness(1.05)" },
  { name: "Forest", css: "hue-rotate(100deg) saturate(1.3) brightness(0.92)" },
  { name: "Desert", css: "sepia(0.35) hue-rotate(15deg) saturate(1.45)" },
  { name: "Arctic", css: "hue-rotate(190deg) saturate(0.7) brightness(1.15)" },
  { name: "Vintage", css: "sepia(0.7) contrast(0.9) saturate(0.8)" },
  { name: "Polaroid", css: "sepia(0.2) contrast(0.85) brightness(1.1) saturate(0.9)" },
];

const FILTER_TOKEN = /(brightness|contrast|saturate|sepia|grayscale|hue-rotate|blur)\(([^)]+)\)/g;

/** Mix a CSS filter toward identity so an intensity slider of 0 is a no-op. */
export function mixFilter(css: string, intensity: number): string {
  const amount = Math.min(1, Math.max(0, intensity / 100));
  if (!css || css === "none" || amount <= 0) return "none";
  if (amount >= 1) return css;
  return css.replace(FILTER_TOKEN, (_all, name: string, raw: string) => {
    const unit = raw.includes("deg") ? "deg" : raw.includes("px") ? "px" : "";
    const value = Number.parseFloat(raw);
    const identity = name === "brightness" || name === "contrast" || name === "saturate" ? 1 : 0;
    return `${name}(${(identity + (value - identity) * amount).toFixed(3)}${unit})`;
  });
}

export interface EffectLook {
  name: string;
  cls: string;
  overlay?: "scan" | "grain" | "vignette" | "shatter";
  stillCss: string;
}

export const EFFECT_LOOKS: EffectLook[] = [
  { name: "Fancy Border", cls: "capfree-fx-border", stillCss: "contrast(1.05)" },
  { name: "Camera Flash", cls: "capfree-fx-flash", stillCss: "brightness(1.8)" },
  { name: "Shutter Flash", cls: "capfree-fx-shutter", stillCss: "brightness(1.4) saturate(0.7)" },
  { name: "Off-Color Burst", cls: "capfree-fx-burst", stillCss: "hue-rotate(90deg)" },
  { name: "Night Wavy", cls: "capfree-fx-wavy", stillCss: "brightness(0.85) saturate(1.2)" },
  { name: "VHS Glitch", cls: "capfree-fx-vhs", overlay: "scan", stillCss: "contrast(1.2) hue-rotate(20deg)" },
  { name: "Elastic Rush", cls: "capfree-fx-elastic", stillCss: "contrast(1.1)" },
  { name: "Ghost Move", cls: "capfree-fx-ghost", stillCss: "opacity(0.7)" },
  { name: "Blur Focus", cls: "capfree-fx-blur", stillCss: "blur(2px)" },
  { name: "Shake", cls: "capfree-fx-shake", stillCss: "contrast(1.08)" },
  { name: "Zoom In", cls: "capfree-fx-zoom", stillCss: "contrast(1.05) brightness(1.05)" },
  { name: "Mirror", cls: "capfree-fx-mirror", stillCss: "hue-rotate(180deg)" },
  { name: "Neon Pulse", cls: "capfree-fx-neon", stillCss: "saturate(1.6) brightness(1.1)" },
  { name: "Film Burn", cls: "capfree-fx-burn", overlay: "vignette", stillCss: "sepia(0.8) brightness(1.2)" },
  { name: "Chromatic Split", cls: "capfree-fx-chroma", stillCss: "saturate(1.4)" },
  { name: "3D Tilt", cls: "capfree-fx-tilt", stillCss: "contrast(1.12)" },
  { name: "Vignette", cls: "capfree-fx-still", overlay: "vignette", stillCss: "brightness(0.9)" },
  { name: "Old Film", cls: "capfree-fx-old", overlay: "grain", stillCss: "grayscale(0.8) sepia(0.3)" },
  { name: "Dreamy", cls: "capfree-fx-dreamy", stillCss: "blur(1px) brightness(1.1) saturate(1.5)" },
  { name: "Hologram", cls: "capfree-fx-holo", overlay: "scan", stillCss: "hue-rotate(120deg)" },
];

export interface TransitionLook {
  name: string;
  cls: string;
  kind: "fade" | "slide" | "wipe" | "zoom" | "spin" | "whip" | "glitchCut" | "warpDissolve" | "lumaWipe";
  direction?: "left" | "right" | "up";
  /** A hard cut: it ignores the duration slider and stays as short as it can. */
  instant?: boolean;
}

/** The eight named in the brief lead; the rest follow in the same grid. */
export const TRANSITION_LOOKS: TransitionLook[] = [
  { name: "Fade", cls: "capfree-tr-black", kind: "fade" },
  { name: "Cut", cls: "capfree-tr-cut", kind: "fade", instant: true },
  { name: "Dissolve", cls: "capfree-tr-dissolve", kind: "fade" },
  { name: "Wipe Left", cls: "capfree-tr-wipe-l", kind: "wipe", direction: "left" },
  { name: "Wipe Right", cls: "capfree-tr-wipe-r", kind: "wipe", direction: "right" },
  { name: "Zoom In", cls: "capfree-tr-zoomin", kind: "zoom" },
  { name: "Zoom Out", cls: "capfree-tr-zoomout", kind: "zoom" },
  { name: "Slide", cls: "capfree-tr-slide-l", kind: "slide", direction: "left" },
  { name: "Fade White", cls: "capfree-tr-white", kind: "fade" },
  { name: "Slide Right", cls: "capfree-tr-slide-r", kind: "slide", direction: "right" },
  { name: "Slide Up", cls: "capfree-tr-slide-u", kind: "slide", direction: "up" },
  { name: "Push Left", cls: "capfree-tr-push", kind: "slide", direction: "left" },
  { name: "Flash", cls: "capfree-tr-flash", kind: "fade" },
  { name: "Spin CW", cls: "capfree-tr-spin", kind: "spin" },
  { name: "Flip H", cls: "capfree-tr-flip", kind: "spin" },
  { name: "Circle Open", cls: "capfree-tr-circle", kind: "lumaWipe" },
  { name: "Glitch Cut", cls: "capfree-tr-glitch", kind: "glitchCut" },
  { name: "Bounce", cls: "capfree-tr-bounce", kind: "zoom" },
  { name: "Elastic", cls: "capfree-tr-elastic", kind: "warpDissolve" },
  { name: "Shatter", cls: "capfree-tr-shatter", kind: "glitchCut" },
];

export interface TextPreset {
  id: string;
  label: string;
  sample: string;
  cardClass: string;
  fontFamily: string;
  fontSize: number;
  color: string;
  fontWeight: "normal" | "bold";
  outline?: { color: string; width: number };
  shadow?: { color: string; blur: number; offsetX: number; offsetY: number };
}

export const TEXT_PRESETS: TextPreset[] = [
  { id: "default", label: "Default", sample: "Sample Text", cardClass: "font-[Inter] text-[18px] text-white", fontFamily: "Inter", fontSize: 64, color: "#ffffff", fontWeight: "bold" },
  { id: "impact", label: "Bold Impact", sample: "IMPACT", cardClass: "font-[Anton] text-[28px] font-black text-white capfree-stroke", fontFamily: "Anton", fontSize: 84, color: "#ffffff", fontWeight: "bold", outline: { color: "#000000", width: 6 } },
  { id: "neon", label: "Neon Glow", sample: "Neon", cardClass: "font-[Poppins] text-[22px] text-[#00ffcc] [text-shadow:0_0_10px_#00ffcc]", fontFamily: "Poppins", fontSize: 72, color: "#00ffcc", fontWeight: "bold", shadow: { color: "#00ffcc", blur: 18, offsetX: 0, offsetY: 0 } },
  { id: "retro", label: "Retro Wave", sample: "RETRO", cardClass: "font-[Righteous] text-[22px] italic font-bold capfree-clip-text bg-gradient-to-b from-fuchsia-500 to-pink-400", fontFamily: "Righteous", fontSize: 72, color: "#e879f9", fontWeight: "bold" },
  { id: "minimal", label: "Minimal", sample: "Minimal.", cardClass: "font-[Inter] text-[16px] tracking-[0.1em] text-[#cccccc]", fontFamily: "Inter", fontSize: 42, color: "#cccccc", fontWeight: "normal" },
  { id: "cinematic", label: "Cinematic", sample: "THE TITLE", cardClass: "font-[Montserrat] text-[20px] uppercase tracking-[0.3em] text-white", fontFamily: "Montserrat", fontSize: 56, color: "#ffffff", fontWeight: "bold" },
  { id: "comic", label: "Comic Pop", sample: "WOW!", cardClass: "font-[Anton] text-[26px] text-yellow-300 -rotate-3 capfree-stroke-thick", fontFamily: "Anton", fontSize: 80, color: "#ffe600", fontWeight: "bold", outline: { color: "#000000", width: 8 } },
  { id: "lower", label: "Lower Third", sample: "John Smith", cardClass: "w-full px-2 text-left font-[Inter] text-[16px] text-white border-l-4 border-[#ffffff]", fontFamily: "Inter", fontSize: 48, color: "#ffffff", fontWeight: "bold" },
  { id: "meme", label: "Meme Top", sample: "WHEN YOU", cardClass: "font-[Anton] text-[24px] uppercase text-white capfree-stroke", fontFamily: "Anton", fontSize: 72, color: "#ffffff", fontWeight: "bold", outline: { color: "#000000", width: 5 } },
  { id: "gold", label: "Gold Gradient", sample: "Luxury", cardClass: "font-[Cinzel] text-[22px] font-semibold capfree-clip-text bg-gradient-to-b from-[#f5e6a3] to-[#c9a227]", fontFamily: "Cinzel", fontSize: 64, color: "#e8c547", fontWeight: "bold" },
  { id: "bubble", label: "Bubble", sample: "Cute!", cardClass: "rounded-full bg-white px-3 py-1 font-[Fredoka] text-[20px] text-[#333333]", fontFamily: "Fredoka", fontSize: 56, color: "#333333", fontWeight: "bold" },
  { id: "type", label: "Typewriter", sample: "Hello_", cardClass: "font-[Roboto_Mono] text-[16px] text-[#00ff00] capfree-cursor", fontFamily: "Roboto Mono", fontSize: 48, color: "#00ff00", fontWeight: "normal" },
  { id: "glitch", label: "Glitch", sample: "GLITCH", cardClass: "font-[Orbitron] text-[22px] text-white [text-shadow:3px_0_#f00,-3px_0_#0ff]", fontFamily: "Orbitron", fontSize: 64, color: "#ffffff", fontWeight: "bold", shadow: { color: "#ff0044", blur: 0, offsetX: 3, offsetY: 0 } },
  { id: "depth", label: "3D Depth", sample: "3D TEXT", cardClass: "font-[Oswald] text-[24px] text-white capfree-depth", fontFamily: "Oswald", fontSize: 72, color: "#ffffff", fontWeight: "bold", shadow: { color: "#111111", blur: 0, offsetX: 4, offsetY: 4 } },
  { id: "hand", label: "Handwritten", sample: "Hello!", cardClass: "font-['Dancing_Script'] text-[24px] text-[#f0a0a0]", fontFamily: "Dancing Script", fontSize: 64, color: "#f0a0a0", fontWeight: "normal" },
];

export const FONT_LIST = [
  "Inter",
  "Poppins",
  "Montserrat",
  "Playfair Display",
  "Oswald",
  "Raleway",
  "Bebas Neue",
  "Pacifico",
  "Dancing Script",
  "Lobster",
  "Roboto Mono",
  "Space Grotesk",
  "Anton",
  "Righteous",
  "Permanent Marker",
  "Fredoka",
  "Nunito",
  "Josefin Sans",
  "Cinzel",
  "Exo 2",
  "Quicksand",
  "Comfortaa",
  "Orbitron",
  "Press Start 2P",
  "Abril Fatface",
  "Shadows Into Light",
  "Great Vibes",
  "Baloo 2",
  "Zilla Slab",
  "Lato",
  "Impact",
];

export function hashHue(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return hash % 360;
}

export function portraitFor(id: string): string {
  return PORTRAITS[hashHue(id) % PORTRAITS.length];
}

export function initials(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "CF";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
}

export function waveBars(seed: string): number[] {
  let hash = hashHue(seed);
  return Array.from({ length: 8 }, () => {
    hash = (hash * 1103515245 + 12345) >>> 0;
    return 6 + (hash % 18);
  });
}

export function albumArt(name: string): { from: string; to: string } {
  const hue = hashHue(name);
  return { from: `hsl(${hue} 62% 38%)`, to: `hsl(${(hue + 48) % 360} 55% 18%)` };
}

export function templateGradient(category: string): { background: string; grain: boolean } {
  const looks: Record<string, { background: string; grain: boolean }> = {
    Travel: { background: "linear-gradient(180deg, #1d4ed8, #14b8a6)", grain: false },
    Food: { background: "linear-gradient(180deg, #f97316, #dc2626)", grain: false },
    Game: { background: "linear-gradient(180deg, #7c3aed, #1e1b4b)", grain: false },
    Gaming: { background: "linear-gradient(180deg, #7c3aed, #1e1b4b)", grain: false },
    Fashion: { background: "linear-gradient(180deg, #ec4899, #7e22ce)", grain: false },
    Beauty: { background: "linear-gradient(180deg, #f472b6, #7c3aed)", grain: false },
    Fitness: { background: "linear-gradient(180deg, #22c55e, #0f766e)", grain: false },
    Love: { background: "linear-gradient(180deg, #dc2626, #f472b6)", grain: false },
    Relationship: { background: "linear-gradient(180deg, #dc2626, #f472b6)", grain: false },
    Anniversary: { background: "linear-gradient(180deg, #be123c, #fb7185)", grain: false },
    Birthday: { background: "linear-gradient(180deg, #eab308, #ea580c)", grain: false },
    "For You": { background: "linear-gradient(180deg, #0a0a0a, #3f3f46)", grain: true },
    Pro: { background: "linear-gradient(180deg, #09090b, #27272a)", grain: true },
    Cinematic: { background: "linear-gradient(180deg, #000000, #3a3a3a)", grain: true },
  };
  return looks[category] ?? { background: "linear-gradient(180deg, #155e75, #042f2e)", grain: false };
}
