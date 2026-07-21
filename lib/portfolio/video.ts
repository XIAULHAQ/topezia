/**
 * YouTube link handling.
 *
 * Extracts the video ID and stores only that — never the pasted URL. Everything
 * we render (embed src, thumbnail, watch link) is then BUILT from an id matched
 * against `[A-Za-z0-9_-]{11}`, so no user-controlled string ever reaches an
 * iframe src. Interpolating a pasted URL there is how you end up embedding
 * javascript: or an attacker's origin inside your own page.
 *
 * Videos are links for now. When uploads move to Vimeo, this stays the shape of
 * the seam: a provider plus an id, resolved to URLs at render time.
 */

const ID = /^[A-Za-z0-9_-]{11}$/;

/** The gate every built URL passes through. Exported for the poster route. */
export const isYouTubeId = (v: string) => ID.test(v);

/** Hosts we accept a paste from. Anything else is rejected outright. */
const HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtu.be",
  "www.youtu.be",
]);

/** The 11-char id, or null if this isn't a YouTube URL we recognise. */
export function youTubeId(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;

  // A bare id pasted on its own.
  if (ID.test(raw)) return raw;

  let url: URL;
  try {
    url = new URL(raw.includes("://") ? raw : `https://${raw}`);
  } catch {
    return null;
  }

  // Only http(s). Blocks javascript:, data:, file: and friends.
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (!HOSTS.has(url.hostname.toLowerCase())) return null;

  // youtu.be/<id>
  if (url.hostname.toLowerCase().endsWith("youtu.be")) {
    const id = url.pathname.slice(1).split("/")[0];
    return ID.test(id) ? id : null;
  }

  // youtube.com/watch?v=<id>
  const v = url.searchParams.get("v");
  if (v && ID.test(v)) return v;

  // /embed/<id>, /shorts/<id>, /live/<id>, /v/<id>
  const parts = url.pathname.split("/").filter(Boolean);
  if (parts.length >= 2 && ["embed", "shorts", "live", "v"].includes(parts[0])) {
    return ID.test(parts[1]) ? parts[1] : null;
  }

  return null;
}

/**
 * Player parameters, chosen to strip as much YouTube furniture as the embed
 * API still allows. Read the comments before adding to this list — several of
 * the parameters people recommend for this were removed by YouTube years ago
 * and do nothing now.
 */
const PLAYER_PARAMS = {
  // Related videos at the end: keeps them to the SAME channel. There is no
  // longer any way to turn the end screen off — `rel=0` meant "none" until
  // Sept 2018, when YouTube redefined it. Setting it to 0 is still the least
  // bad option, it just isn't the off switch it reads as.
  rel: "0",
  // Annotations / cards overlaid on the video.
  iv_load_policy: "3",
  // Play inline on iOS instead of taking over the screen.
  playsinline: "1",
  // Progress bar in white rather than YouTube red — one less brand cue.
  color: "white",
  // Do NOT add `modestbranding=1` (no-op since Aug 2023) or `showinfo=0`
  // (removed 2018). Both are still all over Stack Overflow. They are ignored.
} as const;

/**
 * Privacy-friendly host: no YouTube cookie until the visitor actually plays.
 *
 * `autoplay` is for the click-to-play facade in video-embed.tsx — the iframe is
 * only created after a real click, so the browser honours it.
 */
export function youTubeEmbedUrl(id: string, opts: { autoplay?: boolean } = {}): string | null {
  if (!ID.test(id)) return null;
  const q = new URLSearchParams(PLAYER_PARAMS);
  if (opts.autoplay) q.set("autoplay", "1");
  return `https://www.youtube-nocookie.com/embed/${id}?${q}`;
}

export const youTubeThumbUrl = (id: string) =>
  ID.test(id) ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : null;

/**
 * The poster, served from our own origin instead of i.ytimg.com.
 *
 * Cosmetic but the point of the exercise: with a direct ytimg URL, "copy image
 * address" or one glance at the network tab names the source before the video
 * is ever played.
 */
export const portfolioVideoPosterUrl = (id: string) =>
  ID.test(id) ? `/api/portfolio/video-poster/${id}` : null;

export const youTubeWatchUrl = (id: string) =>
  ID.test(id) ? `https://www.youtube.com/watch?v=${id}` : null;
