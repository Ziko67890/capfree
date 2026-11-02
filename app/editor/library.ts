/** CapCut-style library names. Categories with no assigned items show "No content". */

export const AUDIO_CATEGORIES = [
  "Yours",
  "Trending",
  "Halloween",
  "Phunk",
  "Vlog",
  "Funny",
  "Reggaeton",
  "Beauty",
  "Fitness",
  "Travel",
  "Birthday",
  "Cafe",
  "Tense",
  "Dreamy",
  "Peace",
  "Romantic",
  "Sorrow",
  "Epic",
  "Hip-Hop",
  "Sound Effects",
] as const;

export interface MusicTrack {
  id: string;
  title: string;
  artist: string;
  duration: string;
  seconds: number;
  category: string;
  hue: number;
}

export const MUSIC_TRACKS: MusicTrack[] = [
  { id: "midnight-drive", title: "Midnight Drive", artist: "Nova Lane", duration: "2:14", seconds: 134, category: "Trending", hue: 174 },
  { id: "skyline-run", title: "Skyline Run", artist: "Kite Club", duration: "2:08", seconds: 128, category: "Trending", hue: 210 },
  { id: "slow-motion", title: "Slow Motion", artist: "Mara Vee", duration: "2:51", seconds: 171, category: "Trending", hue: 320 },
  { id: "pulse-check", title: "Pulse Check", artist: "PLY", duration: "1:54", seconds: 114, category: "Trending", hue: 12 },
  { id: "glasshouse", title: "Glasshouse", artist: "The Mild Ones", duration: "3:02", seconds: 182, category: "Dreamy", hue: 200 },
  { id: "neon-alley", title: "Neon Alley", artist: "Kite Club", duration: "2:41", seconds: 161, category: "Phunk", hue: 280 },
  { id: "soft-launch", title: "Soft Launch", artist: "Mara Vee", duration: "1:58", seconds: 118, category: "Vlog", hue: 28 },
  { id: "golden-hour", title: "Golden Hour", artist: "Field Notes", duration: "2:33", seconds: 153, category: "Travel", hue: 36 },
  { id: "paper-planes", title: "Paper Planes", artist: "Rio Santos", duration: "3:11", seconds: 191, category: "Reggaeton", hue: 12 },
  { id: "afterglow", title: "Afterglow", artist: "June Park", duration: "2:05", seconds: 125, category: "Romantic", hue: 330 },
  { id: "low-tide", title: "Low Tide", artist: "Harbor Kids", duration: "2:48", seconds: 168, category: "Peace", hue: 190 },
  { id: "sugar-static", title: "Sugar Static", artist: "PLY", duration: "1:47", seconds: 107, category: "Funny", hue: 48 },
  { id: "city-lights", title: "City Lights", artist: "Andre Cole", duration: "3:20", seconds: 200, category: "Hip-Hop", hue: 250 },
  { id: "warm-concrete", title: "Warm Concrete", artist: "Sable", duration: "2:22", seconds: 142, category: "Cafe", hue: 22 },
  { id: "last-train", title: "Last Train", artist: "Northroom", duration: "2:56", seconds: 176, category: "Sorrow", hue: 220 },
];

export const STICKER_CATEGORIES = [
  "Trending",
  "B_Duck",
  "Halloween",
  "Pumpkin Spice",
  "Black Friday",
  "Classic",
  "NEW",
  "Animal Meme",
  "Hits",
  "Free Fire",
  "Party",
  "Emoji",
  "Emphasis",
  "Cover-ups",
  "Wrong",
  "Love",
  "LETTERS",
  "Mood",
  "Sale",
  "Gaming",
] as const;

export interface StickerCard {
  emoji: string;
  label: string;
  category: string;
}

export const STICKER_CARDS: StickerCard[] = [
  { emoji: "🔥", label: "Fire", category: "Trending" },
  { emoji: "✨", label: "Spark", category: "Trending" },
  { emoji: "💯", label: "Hundred", category: "Trending" },
  { emoji: "🚀", label: "Launch", category: "Trending" },
  { emoji: "🦆", label: "Duck", category: "B_Duck" },
  { emoji: "🐣", label: "Chick", category: "B_Duck" },
  { emoji: "🫧", label: "Bubble", category: "B_Duck" },
  { emoji: "💛", label: "Yellow", category: "B_Duck" },
  { emoji: "🎃", label: "Pumpkin", category: "Halloween" },
  { emoji: "👻", label: "Ghost", category: "Halloween" },
  { emoji: "🦇", label: "Bat", category: "Halloween" },
  { emoji: "🕸️", label: "Web", category: "Halloween" },
  { emoji: "☕", label: "Latte", category: "Pumpkin Spice" },
  { emoji: "🍂", label: "Leaf", category: "Pumpkin Spice" },
  { emoji: "🥧", label: "Pie", category: "Pumpkin Spice" },
  { emoji: "🧣", label: "Scarf", category: "Pumpkin Spice" },
  { emoji: "🛍️", label: "Bag", category: "Black Friday" },
  { emoji: "💸", label: "Deal", category: "Black Friday" },
  { emoji: "🏷️", label: "Tag", category: "Black Friday" },
  { emoji: "🛒", label: "Cart", category: "Black Friday" },
  { emoji: "⭐", label: "Star", category: "Classic" },
  { emoji: "❤️", label: "Heart", category: "Classic" },
  { emoji: "👍", label: "Yes", category: "Classic" },
  { emoji: "👏", label: "Clap", category: "Classic" },
  { emoji: "🆕", label: "New", category: "NEW" },
  { emoji: "💥", label: "Pop", category: "NEW" },
  { emoji: "🌟", label: "Glow", category: "NEW" },
  { emoji: "⚡", label: "Bolt", category: "NEW" },
  { emoji: "🐱", label: "Cat", category: "Animal Meme" },
  { emoji: "🐶", label: "Dog", category: "Animal Meme" },
  { emoji: "🐸", label: "Frog", category: "Animal Meme" },
  { emoji: "🐵", label: "Monkey", category: "Animal Meme" },
  { emoji: "🎯", label: "Hit", category: "Hits" },
  { emoji: "🏆", label: "Trophy", category: "Hits" },
  { emoji: "💎", label: "Gem", category: "Hits" },
  { emoji: "📈", label: "Up", category: "Hits" },
  { emoji: "🔫", label: "Aim", category: "Free Fire" },
  { emoji: "🛡️", label: "Shield", category: "Free Fire" },
  { emoji: "🎮", label: "Pad", category: "Free Fire" },
  { emoji: "💀", label: "Knock", category: "Free Fire" },
  { emoji: "🎉", label: "Party", category: "Party" },
  { emoji: "🥳", label: "Cheer", category: "Party" },
  { emoji: "🎊", label: "Confetti", category: "Party" },
  { emoji: "🍾", label: "Toast", category: "Party" },
  { emoji: "😀", label: "Smile", category: "Emoji" },
  { emoji: "😂", label: "Laugh", category: "Emoji" },
  { emoji: "😍", label: "Love", category: "Emoji" },
  { emoji: "😎", label: "Cool", category: "Emoji" },
  { emoji: "❗", label: "Bang", category: "Emphasis" },
  { emoji: "⁉️", label: "What", category: "Emphasis" },
  { emoji: "‼️", label: "Stop", category: "Emphasis" },
  { emoji: "💬", label: "Speech", category: "Emphasis" },
  { emoji: "⬛", label: "Block", category: "Cover-ups" },
  { emoji: "🟦", label: "Patch", category: "Cover-ups" },
  { emoji: "⬜", label: "Plate", category: "Cover-ups" },
  { emoji: "🔲", label: "Frame", category: "Cover-ups" },
  { emoji: "❌", label: "Cross", category: "Wrong" },
  { emoji: "🚫", label: "No", category: "Wrong" },
  { emoji: "👎", label: "Nope", category: "Wrong" },
  { emoji: "🤦", label: "Facepalm", category: "Wrong" },
  { emoji: "💌", label: "Note", category: "Love" },
  { emoji: "💕", label: "Hearts", category: "Love" },
  { emoji: "💘", label: "Arrow", category: "Love" },
  { emoji: "😘", label: "Kiss", category: "Love" },
  { emoji: "🅰️", label: "A", category: "LETTERS" },
  { emoji: "🅱️", label: "B", category: "LETTERS" },
  { emoji: "🅾️", label: "O", category: "LETTERS" },
  { emoji: "🆒", label: "Cool", category: "LETTERS" },
  { emoji: "😊", label: "Glad", category: "Mood" },
  { emoji: "😭", label: "Cry", category: "Mood" },
  { emoji: "😡", label: "Mad", category: "Mood" },
  { emoji: "😴", label: "Sleep", category: "Mood" },
  { emoji: "💰", label: "Sale", category: "Sale" },
  { emoji: "🔖", label: "Save", category: "Sale" },
  { emoji: "🎁", label: "Gift", category: "Sale" },
  { emoji: "📢", label: "Shout", category: "Sale" },
  { emoji: "🕹️", label: "Arcade", category: "Gaming" },
  { emoji: "👾", label: "Alien", category: "Gaming" },
  { emoji: "🎲", label: "Dice", category: "Gaming" },
  { emoji: "🏅", label: "Medal", category: "Gaming" },
];

export const EFFECT_CATEGORIES = [
  "Favourites",
  "Trending",
  "B_Duck",
  "Halloween",
  "Pumpkin Spice",
  "Black Friday",
  "Classic",
  "NEW",
  "Hits",
  "Intro & Outro",
  "Wild Pics",
  "Party",
  "Motion",
  "3D",
  "Edits",
  "Light",
  "Retro",
  "Glitch",
  "Distortion",
] as const;

export const EFFECT_NAMES = [
  "Fancy Border",
  "Camera Flash",
  "Shutter Flash",
  "Off-color Burst",
  "Night - Wavy",
  "Static - Light",
  "Elastic Rush",
  "Visual - Anapest",
  "Matte - gelato",
  "Dynamic Smear",
  "Dream Light Tilt",
  "Snapshot Glam",
  "Right - ahop",
  "DOF Twin",
  "Blur Focus",
  "Zip Flip",
  "Heatwave Flash",
  "Flash Blast",
  "3D Zoom Shift",
  "Barrel Punch",
  "Silky Switch",
  "Ghost Move",
  "Paper Test",
  "Pet Shake",
  "Wavy Soul",
  "Shake & Flash",
  "Wavy Memory",
  "3D Card 2",
  "Blurry Tremble",
  "Split-off Cube",
  "Prism Drift",
  "Ink Bloom",
  "Velvet Scan",
  "Halo Pop",
];

export const BODY_EFFECTS = new Set([
  "Elastic Rush",
  "Ghost Move",
  "Pet Shake",
  "Wavy Soul",
  "Shake & Flash",
  "Blurry Tremble",
  "Paper Test",
  "Barrel Punch",
]);

export const TRANSITION_CATEGORIES = [
  "Favourites",
  "Trending",
  "B_Duck",
  "Halloween",
  "Pumpkin Spice",
  "Black Friday",
  "Classic",
  "NEW",
  "Hits",
  "Overlay",
  "Light",
  "Camera",
  "Blur",
  "Basic",
  "Mask",
  "Slide",
  "Glitch",
  "Distortion",
] as const;

export const TRANSITION_NAMES = [
  "Flash Slash",
  "Snap Slash",
  "Shutter Flash",
  "Off-color Burst",
  "Night – Stay",
  "Static – Light",
  "Elastic Rush",
  "Visual – Anapest",
  "Matte – gelato",
  "Dynamic Smear",
  "Dream Light Tilt",
  "Snapshot Glam",
  "Right – ahop",
  "DOF Twin",
  "Blur Focus",
  "Zip Flip",
  "Heatwave Touch",
  "Flash Blast",
  "3D Zoom Shift",
  "Barrel Punch",
  "Silky Switch",
  "Ghost Move",
  "Wavy Soul",
  "Shake & Flash",
  "Wavy Memory",
];

export const FILTER_CATEGORIES = [
  "Featured",
  "NEW",
  "Hits",
  "Life",
  "Landscape",
  "Portrait",
  "Mono",
  "Movies",
  "Retro",
  "Dark",
  "Alternative",
  "Night",
  "Cool Filter",
  "Warm Filter",
  "Food",
  "Photo Booth",
  "CCD",
  "Pet",
  "Natural",
] as const;

export const FILTER_NAMES = [
  "Stay in Barcelona",
  "Spring Mood",
  "Wild Education",
  "Clear 1",
  "Pink any",
  "Concrete Blue",
  "Colorful_carina",
  "Y2K Vogue",
  "Fresh Lime",
  "Vibrant View",
  "Cinema... Blure",
  "Mossy Full",
  "American Retro",
  "Spotlight",
  "Samba... Peach",
  "Cool Space",
  "Vivid Spring",
  "Voyager 3",
  "Cinema... Color",
  "Hollywood Flash",
  "Retro Pink",
  "Rio Nights",
  "Sleepless Haze",
  "Velvet Matte",
  "Tokyo Heat",
  "Brazel... Yellow",
  "Neon Blush",
];

export const TEMPLATE_CATEGORIES = [
  "For You",
  "Pro",
  "Daily life",
  "Selfie",
  "About Me",
  "Lyrics",
  "Relationship",
  "Music Festival",
  "Friendship",
  "Travel",
  "Pet",
  "Car",
  "School life",
  "Family",
  "Game",
  "Anniversary",
  "Motivation",
  "Fashion",
  "Beauty",
  "Housing",
  "Food",
  "Fitness",
  "Love",
  "Birthday",
  "Cinematic",
] as const;

export interface TemplateCard {
  id: string;
  title: string;
  duration: string;
  seconds: number;
  category: string;
  hue: number;
}

export const TEMPLATE_CARDS: TemplateCard[] = [
  { id: "intro-card", title: "Intro Card", duration: "0:06", seconds: 6, category: "For You", hue: 174 },
  { id: "quote-reel", title: "Quote Reel", duration: "0:10", seconds: 10, category: "For You", hue: 200 },
  { id: "product-spin", title: "Product Spin", duration: "0:12", seconds: 12, category: "Pro", hue: 262 },
  { id: "brand-opener", title: "Brand Opener", duration: "0:07", seconds: 7, category: "Pro", hue: 230 },
  { id: "morning-routine", title: "Morning Routine", duration: "0:15", seconds: 15, category: "Daily life", hue: 32 },
  { id: "desk-reset", title: "Desk Reset", duration: "0:12", seconds: 12, category: "Daily life", hue: 18 },
  { id: "window-light", title: "Window Light", duration: "0:08", seconds: 8, category: "Selfie", hue: 40 },
  { id: "about-me", title: "About Me Card", duration: "0:10", seconds: 10, category: "About Me", hue: 150 },
  { id: "lyric-pop", title: "Lyric Pop", duration: "0:18", seconds: 18, category: "Lyrics", hue: 300 },
  { id: "relationship", title: "Relationship Title", duration: "0:11", seconds: 11, category: "Relationship", hue: 340 },
  { id: "festival-cut", title: "Festival Cut", duration: "0:12", seconds: 12, category: "Music Festival", hue: 280 },
  { id: "friendship", title: "Friendship Montage", duration: "0:15", seconds: 15, category: "Friendship", hue: 48 },
  { id: "city-walk", title: "City Walk", duration: "0:20", seconds: 20, category: "Travel", hue: 190 },
  { id: "pet-cameo", title: "Pet Cameo", duration: "0:09", seconds: 9, category: "Pet", hue: 24 },
  { id: "family-table", title: "Family Table", duration: "0:16", seconds: 16, category: "Family", hue: 8 },
  { id: "game-night", title: "Game Night", duration: "0:14", seconds: 14, category: "Gaming", hue: 260 },
  { id: "anniversary", title: "Anniversary Title", duration: "0:08", seconds: 8, category: "Anniversary", hue: 350 },
  { id: "motivation", title: "Motivation Title", duration: "0:09", seconds: 9, category: "Motivation", hue: 16 },
  { id: "fit-check", title: "Fit Check", duration: "0:11", seconds: 11, category: "Fashion", hue: 310 },
  { id: "soft-glam", title: "Soft Glam", duration: "0:13", seconds: 13, category: "Beauty", hue: 330 },
  { id: "table-spread", title: "Table Spread", duration: "0:12", seconds: 12, category: "Food", hue: 18 },
  { id: "gym-cut", title: "Gym Cut", duration: "0:10", seconds: 10, category: "Fitness", hue: 142 },
  { id: "love-note", title: "Love Note", duration: "0:08", seconds: 8, category: "Love", hue: 350 },
  { id: "cake-spin", title: "Cake Spin", duration: "0:09", seconds: 9, category: "Birthday", hue: 36 },
  { id: "letterbox", title: "Letterbox Open", duration: "0:15", seconds: 15, category: "Cinematic", hue: 0 },
];

export const AVATAR_TABS = ["Avatar Story", "Fashion model...", "Photos to avatar", "AI dialogue sc..."] as const;

export const AVATAR_CATEGORIES = ["Marketing", "Stylised", "Green Screen", "Podcast", "Healing", "Health", "Sports"] as const;

export interface AvatarCard {
  id: string;
  name: string;
  category: string;
  tab: (typeof AVATAR_TABS)[number];
  hue: number;
}

export const AVATARS: AvatarCard[] = [
  { id: "dylan", name: "Dylan Marketing", category: "Marketing", tab: "Avatar Story", hue: 210 },
  { id: "jasmin", name: "Jasmin Marketing", category: "Marketing", tab: "Fashion model...", hue: 330 },
  { id: "max", name: "Max-kitchen", category: "Health", tab: "Avatar Story", hue: 28 },
  { id: "plastov", name: "Plastov Standing 4", category: "Stylised", tab: "Avatar Story", hue: 262 },
  { id: "leon", name: "Leon-Marketing", category: "Marketing", tab: "Avatar Story", hue: 200 },
  { id: "ava", name: "Ava Studio", category: "Podcast", tab: "AI dialogue sc...", hue: 174 },
  { id: "noah", name: "Noah Podcast", category: "Podcast", tab: "AI dialogue sc...", hue: 230 },
  { id: "priya", name: "Priya Health", category: "Health", tab: "Avatar Story", hue: 140 },
  { id: "ken", name: "Ken Sports", category: "Sports", tab: "Avatar Story", hue: 120 },
  { id: "mina", name: "Mina Healing", category: "Healing", tab: "Fashion model...", hue: 160 },
  { id: "omar", name: "Omar Green Screen", category: "Green Screen", tab: "Photos to avatar", hue: 130 },
  { id: "lila", name: "Lila Stylised", category: "Stylised", tab: "Fashion model...", hue: 300 },
];

export const SPOKEN_LANGUAGES = [
  { code: "en", label: "English" },
  { code: "es", label: "Spanish" },
  { code: "fr", label: "French" },
  { code: "pt", label: "Portuguese" },
  { code: "hi", label: "Hindi" },
  { code: "ar", label: "Arabic" },
  { code: "zh", label: "Chinese" },
  { code: "ja", label: "Japanese" },
  { code: "ko", label: "Korean" },
  { code: "de", label: "German" },
  { code: "it", label: "Italian" },
  { code: "ru", label: "Russian" },
] as const;

export const TRANSLATE_LANGUAGES = [
  ...SPOKEN_LANGUAGES.filter((item) => item.code !== "en"),
  { code: "nl", label: "Dutch" },
  { code: "tr", label: "Turkish" },
] as const;

export const TEXT_STYLES = [
  { id: "default", label: "Default", fontFamily: "Inter", fontWeight: "bold" as const, color: "#ffffff", fontSize: 64 },
  { id: "bold", label: "Bold", fontFamily: "Impact", fontWeight: "bold" as const, color: "#ffffff", fontSize: 80 },
  { id: "minimal", label: "Minimal", fontFamily: "Georgia", fontWeight: "normal" as const, color: "#f4f4f5", fontSize: 42 },
  { id: "neon", label: "Neon", fontFamily: "Arial", fontWeight: "bold" as const, color: "#39ff14", fontSize: 64 },
  { id: "cinematic", label: "Cinematic", fontFamily: "Georgia", fontWeight: "bold" as const, color: "#f3e6c8", fontSize: 56 },
  { id: "retro", label: "Retro", fontFamily: "Impact", fontWeight: "bold" as const, color: "#ffb703", fontSize: 68 },
  { id: "handwritten", label: "Handwritten", fontFamily: "Georgia", fontWeight: "normal" as const, color: "#fff7ed", fontSize: 52 },
  { id: "comic", label: "Comic", fontFamily: "Arial", fontWeight: "bold" as const, color: "#ffe600", fontSize: 72 },
];

export const TEXT_EFFECTS = ["Outline", "Shadow", "Glow", "Blur", "3D", "Gradient"] as const;

export const TEXT_MOTIONS = [
  { id: "fade", label: "Fade in", templateId: "template-elegant-reveal" },
  { id: "typewriter", label: "Typewriter", templateId: "template-ticker" },
  { id: "bounce", label: "Bounce", templateId: "template-kinetic-pop" },
  { id: "slide", label: "Slide", templateId: "template-lower-third" },
] as const;

/** Spread items across categories, leaving Favourites empty until the user hearts one. */
export function categoryFor(index: number, categories: readonly string[]): string {
  const homes = categories.filter((item) => item !== "Favourites");
  return homes[index % homes.length];
}

/** Approximate a graded look with CSS filter functions. */
export function filterCss(index: number): string {
  const brightness = (0.86 + (index % 5) * 0.07).toFixed(2);
  const contrast = (0.92 + (index % 4) * 0.1).toFixed(2);
  const saturate = (0.55 + (index % 6) * 0.28).toFixed(2);
  const sepia = ((index % 3) * 0.18).toFixed(2);
  const hue = (index * 17) % 50 - 20;
  return `brightness(${brightness}) contrast(${contrast}) saturate(${saturate}) sepia(${sepia}) hue-rotate(${hue}deg)`;
}

export function filterSwatch(index: number): string {
  const hue = (index * 23 + 12) % 360;
  return `linear-gradient(160deg, hsl(${hue} 55% 42%), hsl(${(hue + 40) % 360} 40% 18%))`;
}
