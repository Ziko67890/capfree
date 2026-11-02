/**
 * Stickers ride the editor's text-element drag. The timeline only reads that
 * payload, so we remember the emoji and rewrite the new text clip on drop.
 */
let pendingEmoji: string | null = null;
let suppressClick = false;

export function armSticker(emoji: string): void {
  pendingEmoji = emoji;
}

/** A real drag moved the pointer. The following click should not also insert a sticker. */
export function noteStickerDrag(): void {
  suppressClick = true;
}

export function disarmStickerSoon(): void {
  window.setTimeout(() => {
    pendingEmoji = null;
    suppressClick = false;
  }, 80);
}

export function stickerDragShouldIgnoreClick(): boolean {
  if (!suppressClick) return false;
  suppressClick = false;
  return true;
}

export function consumeSticker(clip: { type: string; content?: string }): string | null {
  if (!pendingEmoji || clip.type !== "text") return null;
  if (!/^Text \d+$/.test(clip.content ?? "")) return null;
  const emoji = pendingEmoji;
  pendingEmoji = null;
  suppressClick = false;
  return emoji;
}
