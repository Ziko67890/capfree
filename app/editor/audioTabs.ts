import { AUDIO_CATALOG, type AudioCategory, type CatalogTrack } from "./data/audioCatalog";

export const AUDIO_TABS = [
  "Recommended",
  "My Audio",
  "Sound Effects",
  "Music",
  "Trending",
  "Vlog",
  "Cinematic",
  "Hip Hop",
  "Electronic",
  "Calm",
] as const;

export type AudioTab = (typeof AUDIO_TABS)[number];

/**
 * The catalog is tagged by twelve source categories, not by the ten tabs the
 * panel shows, so each tab is a query over the metadata that actually exists.
 * Genre tabs match the track title as well as its tags, because titles like
 * "Tech House Vibes" carry the genre the tags leave out.
 */
const SFX_CATEGORIES = new Set<AudioCategory>([
  "Sound effects",
  "Whoosh",
  "Impact",
  "UI / Pop",
  "Nature",
  "Crowd",
  "Comedy",
]);

const MUSIC_CATEGORIES = new Set<AudioCategory>(["Music", "Chill", "Upbeat"]);

const VLOG = /vlog|travel|summer|sunset|happy|\bfun\b|\bday\b|\bwalk\b|\bdrive\b|world/i;
const HIP_HOP = /hip ?hop|\btrap\b|funk|urban|boom/i;
const ELECTRONIC = /house|techno|electro|\bedm\b|synth|dance|\bdub\b|game|tech/i;
const CALM = /calm|serene|dream|ambient|\bsoft\b|\bslow\b|piano|night|chill|quiet|sleep/i;

function matches(track: CatalogTrack, genre: RegExp): boolean {
  return genre.test(track.title) || track.tags.some((tag) => genre.test(tag));
}

/** The catalog lists some cuts under more than one category. */
function unique(tracks: CatalogTrack[]): CatalogTrack[] {
  const seen = new Set<string>();
  return tracks.filter((track) => {
    if (seen.has(track.previewUrl)) return false;
    seen.add(track.previewUrl);
    return true;
  });
}

/**
 * Catalog tracks for a tab. "My Audio" is empty here on purpose: it is fed by
 * the media library, which holds the user's own imports and recordings.
 */
export function tracksForTab(tab: AudioTab): CatalogTrack[] {
  return unique(selectForTab(tab));
}

function selectForTab(tab: AudioTab): CatalogTrack[] {
  switch (tab) {
    case "Recommended":
      return AUDIO_CATALOG.filter((track) => track.category === "Recommended");
    case "My Audio":
      return [];
    case "Sound Effects":
      return AUDIO_CATALOG.filter((track) => SFX_CATEGORIES.has(track.category));
    case "Music":
      return AUDIO_CATALOG.filter((track) => MUSIC_CATEGORIES.has(track.category));
    case "Cinematic":
      return AUDIO_CATALOG.filter((track) => track.category === "Cinematic");
    case "Trending":
      // Nothing here counts plays, so "trending" is the up-tempo music rather
      // than a popularity figure the app cannot know.
      return AUDIO_CATALOG.filter((track) => MUSIC_CATEGORIES.has(track.category) && track.bpm >= 110);
    case "Vlog":
      return AUDIO_CATALOG.filter((track) => track.category === "Upbeat" || matches(track, VLOG));
    case "Hip Hop":
      return AUDIO_CATALOG.filter((track) => matches(track, HIP_HOP));
    case "Electronic":
      return AUDIO_CATALOG.filter((track) => matches(track, ELECTRONIC));
    case "Calm":
      return AUDIO_CATALOG.filter((track) => track.category === "Chill" || matches(track, CALM));
  }
}

/** Matches a track against the search box, across title, artist and tags. */
export function trackMatchesQuery(track: CatalogTrack, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return (
    track.title.toLowerCase().includes(needle) ||
    track.artist.toLowerCase().includes(needle) ||
    track.tags.some((tag) => tag.includes(needle))
  );
}
