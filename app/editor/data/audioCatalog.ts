/** Mixkit CDN previews verified via their public item pages (active_storage + music/{id}). */

export const AUDIO_CATEGORIES = [
  "Recommended",
  "Sound effects",
  "Music",
  "Whoosh",
  "Impact",
  "UI / Pop",
  "Nature",
  "Crowd",
  "Comedy",
  "Cinematic",
  "Chill",
  "Upbeat",
] as const;

export type AudioCategory = (typeof AUDIO_CATEGORIES)[number];

export interface CatalogTrack {
  id: string;
  title: string;
  artist: string;
  durationSec: number;
  bpm: number;
  category: AudioCategory;
  tags: string[];
  previewUrl: string;
}

function sfx(id: number): string {
  return `https://assets.mixkit.co/active_storage/sfx/${id}/${id}-preview.mp3`;
}

function song(id: number): string {
  return `https://assets.mixkit.co/music/${id}/${id}.mp3`;
}

function t(
  id: string,
  title: string,
  artist: string,
  durationSec: number,
  bpm: number,
  category: AudioCategory,
  tags: string[],
  previewUrl: string,
): CatalogTrack {
  return { id, title, artist, durationSec, bpm, category, tags, previewUrl };
}

export const AUDIO_CATALOG: CatalogTrack[] = [
  t("rec-1", "Tech House Vibes", "Mixkit", 95, 124, "Recommended", ["house", "beat"], song(130)),
  t("rec-2", "Hip Hop 02", "Mixkit", 88, 90, "Recommended", ["hiphop"], song(738)),
  t("rec-3", "Driving Ambition", "Mixkit", 110, 118, "Recommended", ["drive"], song(32)),
  t("rec-4", "Serene View", "Mixkit", 102, 80, "Recommended", ["calm"], song(443)),
  t("rec-5", "Cat Walk", "Mixkit", 76, 112, "Recommended", ["groove"], song(371)),
  t("rec-6", "Games Worldbeat", "Mixkit", 84, 128, "Recommended", ["game"], song(466)),
  t("rec-7", "Whoosh Fast", "Mixkit", 1, 0, "Recommended", ["whoosh"], sfx(1492)),
  t("rec-8", "UI Click", "Mixkit", 1, 0, "Recommended", ["ui"], sfx(1109)),
  t("rec-9", "Crowd Clap", "Mixkit", 4, 0, "Recommended", ["crowd"], sfx(424)),

  t("sfx-1", "Arcade Coin", "Mixkit", 1, 0, "Sound effects", ["game"], sfx(211)),
  t("sfx-2", "Unlock Notify", "Mixkit", 1, 0, "Sound effects", ["ui"], sfx(253)),
  t("sfx-3", "Software Start", "Mixkit", 2, 0, "Sound effects", ["ui"], sfx(2574)),
  t("sfx-4", "Sci-Fi Click", "Mixkit", 1, 0, "Sound effects", ["ui"], sfx(900)),
  t("sfx-5", "Hard Pop", "Mixkit", 1, 0, "Sound effects", ["pop"], sfx(2364)),
  t("sfx-6", "Game Punch", "Mixkit", 1, 0, "Sound effects", ["hit"], sfx(2047)),
  t("sfx-7", "Bell Ding", "Mixkit", 2, 0, "Sound effects", ["bell"], sfx(933)),
  t("sfx-8", "Wrong Buzz", "Mixkit", 1, 0, "Sound effects", ["fail"], sfx(473)),
  t("sfx-9", "Magic Sweep", "Mixkit", 2, 0, "Sound effects", ["magic"], sfx(2350)),

  t("mus-1", "Tech House Vibes", "Mixkit", 95, 124, "Music", ["house"], song(130)),
  t("mus-2", "Hip Hop 02", "Mixkit", 88, 90, "Music", ["hiphop"], song(738)),
  t("mus-3", "Driving Ambition", "Mixkit", 110, 118, "Music", ["drive"], song(32)),
  t("mus-4", "Serene View", "Mixkit", 102, 80, "Music", ["calm"], song(443)),
  t("mus-5", "Cat Walk", "Mixkit", 76, 112, "Music", ["funk"], song(371)),
  t("mus-6", "Games Worldbeat", "Mixkit", 84, 128, "Music", ["world"], song(466)),
  t("mus-7", "Deep Urban", "Mixkit", 98, 92, "Music", ["urban"], song(623)),
  t("mus-8", "Beautiful Dream", "Mixkit", 120, 72, "Music", ["dream"], song(493)),
  t("mus-9", "Spirit in the Woods", "Mixkit", 108, 78, "Music", ["folk"], song(139)),

  t("who-1", "Air Woosh", "Mixkit", 2, 0, "Whoosh", ["air"], sfx(1489)),
  t("who-2", "Cinematic Whoosh Fast", "Mixkit", 1, 0, "Whoosh", ["fast"], sfx(1492)),
  t("who-3", "Arrow Whoosh", "Mixkit", 1, 0, "Whoosh", ["arrow"], sfx(1491)),
  t("who-4", "Fast Rocket Whoosh", "Mixkit", 4, 0, "Whoosh", ["rocket"], sfx(1714)),
  t("who-5", "Fast Whoosh Transition", "Mixkit", 1, 0, "Whoosh", ["cut"], sfx(1490)),
  t("who-6", "Tunnel Reverb Woosh", "Mixkit", 6, 0, "Whoosh", ["reverb"], sfx(1486)),
  t("who-7", "Magic Sparkle Whoosh", "Mixkit", 3, 0, "Whoosh", ["magic"], sfx(2350)),
  t("who-8", "Explainer Pop Whoosh", "Mixkit", 1, 0, "Whoosh", ["pop"], sfx(3005)),
  t("who-9", "Ghostly Whoosh", "Mixkit", 3, 0, "Whoosh", ["ghost"], sfx(2623)),

  t("imp-1", "Cinematic Hit", "Mixkit", 2, 0, "Impact", ["boom"], sfx(1143)),
  t("imp-2", "Trailer Impact", "Mixkit", 3, 0, "Impact", ["trailer"], sfx(788)),
  t("imp-3", "Heavy Slam", "Mixkit", 1, 0, "Impact", ["slam"], sfx(2908)),
  t("imp-4", "Bass Drop Hit", "Mixkit", 2, 0, "Impact", ["bass"], sfx(2198)),
  t("imp-5", "Metal Crash", "Mixkit", 2, 0, "Impact", ["metal"], sfx(2782)),
  t("imp-6", "Drum Hit", "Mixkit", 1, 0, "Impact", ["drum"], sfx(498)),
  t("imp-7", "Wood Hit", "Mixkit", 1, 0, "Impact", ["wood"], sfx(2182)),
  t("imp-8", "Punch Impact", "Mixkit", 1, 0, "Impact", ["punch"], sfx(2589)),
  t("imp-9", "Epic Whoosh Impact", "Mixkit", 3, 0, "Impact", ["whoosh"], sfx(1492)),

  t("ui-1", "Select Click", "Mixkit", 1, 0, "UI / Pop", ["click"], sfx(1109)),
  t("ui-2", "Interface Click", "Mixkit", 1, 0, "UI / Pop", ["click"], sfx(1133)),
  t("ui-3", "Sci-Fi Click", "Mixkit", 1, 0, "UI / Pop", ["sci-fi"], sfx(900)),
  t("ui-4", "Light Button", "Mixkit", 1, 0, "UI / Pop", ["button"], sfx(275)),
  t("ui-5", "Pop Click", "Mixkit", 1, 0, "UI / Pop", ["pop"], sfx(2364)),
  t("ui-6", "Start Chime", "Mixkit", 2, 0, "UI / Pop", ["start"], sfx(2574)),
  t("ui-7", "Confirm Tone", "Mixkit", 1, 0, "UI / Pop", ["ok"], sfx(2575)),
  t("ui-8", "Alert Ping", "Mixkit", 1, 0, "UI / Pop", ["alert"], sfx(2870)),
  t("ui-9", "Game Notify", "Mixkit", 1, 0, "UI / Pop", ["game"], sfx(2531)),

  t("nat-1", "Forest Birds", "Mixkit", 12, 0, "Nature", ["birds"], sfx(2393)),
  t("nat-2", "Water Flow", "Mixkit", 10, 0, "Nature", ["water"], sfx(2472)),
  t("nat-3", "Wind Trees", "Mixkit", 10, 0, "Nature", ["wind"], sfx(2485)),
  t("nat-4", "Thunder Storm", "Mixkit", 12, 0, "Nature", ["storm"], sfx(2390)),
  t("nat-5", "Rain Loop", "Mixkit", 10, 0, "Nature", ["rain"], sfx(2658)),
  t("nat-6", "Ocean Waves", "Mixkit", 12, 0, "Nature", ["ocean"], sfx(2415)),
  t("nat-7", "Campfire", "Mixkit", 10, 0, "Nature", ["fire"], sfx(2473)),
  t("nat-8", "Night Crickets", "Mixkit", 12, 0, "Nature", ["night"], sfx(2395)),
  t("nat-9", "River Bed", "Mixkit", 10, 0, "Nature", ["river"], sfx(2472)),

  t("crd-1", "Crowd Laugh", "Mixkit", 4, 0, "Crowd", ["laugh"], sfx(424)),
  t("crd-2", "Applause", "Mixkit", 5, 0, "Crowd", ["clap"], sfx(478)),
  t("crd-3", "Stadium Cheer", "Mixkit", 6, 0, "Crowd", ["cheer"], sfx(444)),
  t("crd-4", "Small Claps", "Mixkit", 3, 0, "Crowd", ["clap"], sfx(429)),
  t("crd-5", "Busy Room", "Mixkit", 8, 0, "Crowd", ["room"], sfx(476)),
  t("crd-6", "Murmur", "Mixkit", 8, 0, "Crowd", ["talk"], sfx(462)),
  t("crd-7", "Arena Hit", "Mixkit", 3, 0, "Crowd", ["arena"], sfx(610)),
  t("crd-8", "Soft Audience", "Mixkit", 4, 0, "Crowd", ["soft"], sfx(368)),
  t("crd-9", "Comedy Crowd", "Mixkit", 3, 0, "Crowd", ["comedy"], sfx(414)),

  t("com-1", "Clown Horn", "Mixkit", 1, 0, "Comedy", ["horn"], sfx(616)),
  t("com-2", "Funny Notify", "Mixkit", 1, 0, "Comedy", ["toon"], sfx(2358)),
  t("com-3", "Squeak Hit", "Mixkit", 1, 0, "Comedy", ["squeak"], sfx(2882)),
  t("com-4", "Pop Gag", "Mixkit", 1, 0, "Comedy", ["pop"], sfx(2364)),
  t("com-5", "Fail Piano", "Mixkit", 2, 0, "Comedy", ["fail"], sfx(473)),
  t("com-6", "Crowd Laugh", "Mixkit", 4, 0, "Comedy", ["laugh"], sfx(424)),
  t("com-7", "Cartoon Boing", "Mixkit", 1, 0, "Comedy", ["boing"], sfx(414)),
  t("com-8", "Slide Whistle", "Mixkit", 2, 0, "Comedy", ["slide"], sfx(471)),
  t("com-9", "Toy Hit", "Mixkit", 1, 0, "Comedy", ["toy"], sfx(2882)),

  t("cin-1", "Cinematic Whoosh", "Mixkit", 1, 0, "Cinematic", ["whoosh"], sfx(1492)),
  t("cin-2", "Cinematic Hit", "Mixkit", 2, 0, "Cinematic", ["hit"], sfx(1143)),
  t("cin-3", "Trailer Boom", "Mixkit", 3, 0, "Cinematic", ["boom"], sfx(488)),
  t("cin-4", "Sweep Hit", "Mixkit", 2, 0, "Cinematic", ["sweep"], sfx(788)),
  t("cin-5", "Orchestra Hit", "Mixkit", 3, 0, "Cinematic", ["orch"], sfx(2290)),
  t("cin-6", "Tunnel Whoosh", "Mixkit", 6, 0, "Cinematic", ["tunnel"], sfx(1486)),
  t("cin-7", "Riser Hit", "Mixkit", 3, 0, "Cinematic", ["riser"], sfx(790)),
  t("cin-8", "Braam", "Mixkit", 3, 0, "Cinematic", ["braam"], sfx(1287)),
  t("cin-9", "Trailer Music", "Mixkit", 90, 100, "Cinematic", ["score"], song(32)),

  t("ch-1", "Serene View", "Mixkit", 102, 80, "Chill", ["calm"], song(443)),
  t("ch-2", "Beautiful Dream", "Mixkit", 120, 72, "Chill", ["dream"], song(493)),
  t("ch-3", "Spirit Woods", "Mixkit", 108, 78, "Chill", ["acoustic"], song(139)),
  t("ch-4", "Valley Sunset", "Mixkit", 96, 76, "Chill", ["sunset"], song(127)),
  t("ch-5", "Hazy Hours", "Mixkit", 88, 84, "Chill", ["lofi"], song(580)),
  t("ch-6", "Soft Pads", "Mixkit", 100, 70, "Chill", ["pad"], song(587)),
  t("ch-7", "Night Walk", "Mixkit", 92, 82, "Chill", ["night"], song(595)),
  t("ch-8", "Easy Pulse", "Mixkit", 86, 90, "Chill", ["pulse"], song(614)),
  t("ch-9", "Quiet Room", "Mixkit", 94, 68, "Chill", ["quiet"], song(657)),

  t("up-1", "Tech House Vibes", "Mixkit", 95, 124, "Upbeat", ["house"], song(130)),
  t("up-2", "Games Worldbeat", "Mixkit", 84, 128, "Upbeat", ["game"], song(466)),
  t("up-3", "Cat Walk", "Mixkit", 76, 112, "Upbeat", ["funk"], song(371)),
  t("up-4", "Hip Hop 02", "Mixkit", 88, 90, "Upbeat", ["rap"], song(738)),
  t("up-5", "Driving Ambition", "Mixkit", 110, 118, "Upbeat", ["drive"], song(32)),
  t("up-6", "Raise Higher", "Mixkit", 90, 120, "Upbeat", ["lift"], song(695)),
  t("up-7", "Happy Bells", "Mixkit", 80, 126, "Upbeat", ["bells"], song(897)),
  t("up-8", "Island Beat", "Mixkit", 82, 122, "Upbeat", ["island"], song(671)),
  t("up-9", "Fun Times", "Mixkit", 78, 130, "Upbeat", ["fun"], song(752)),
];
