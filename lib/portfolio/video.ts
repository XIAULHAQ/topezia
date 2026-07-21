/**
 * Video link handling: YouTube and Vimeo.
 *
 * Extracts a provider + id and stores only those — never the pasted URL.
 * Everything we render (embed src, poster, watch link) is BUILT from an id
 * matched against a strict pattern, so no user-controlled string ever reaches
 * an iframe src. Interpolating a pasted URL there is how you end up embedding
 * javascript: or an attacker's origin inside your own page.
 *
 * Unlisted Vimeo videos carry a private hash in the URL and won't embed
 * without it, so it's captured alongside the id and validated the same way.
 */

export type VideoProvider = "YOUTUBE" | "VIMEO";

/** A video, resolved to URLs only at render time. */
export type VideoRef = {
  provider: VideoProvider;
  id: string;
  /** Vimeo unlisted-video hash. Always null for YouTube. */
  hash: string | null;
};

const YT_ID = /^[A-Za-z0-9_-]{11}$/;
// Vimeo ids grew over time — 2008-era videos have as few as 5 digits, current
// ones have 9. Don't tighten this to the length of a modern id; it would
// silently reject anything older.
const VIMEO_ID = /^[0-9]{5,12}$/;
/** Vimeo's unlisted hash: hex, ~10 chars. Kept tight — it lands in a URL. */
const VIMEO_HASH = /^[0-9a-f]{6,20}$/i;

export const isYouTubeId = (v: string) => YT_ID.test(v);
export const isVimeoId = (v: string) => VIMEO_ID.test(v);

export function isVideoProvider(v: unknown): v is VideoProvider {
  return v === "YOUTUBE" || v === "VIMEO";
}

const YT_HOSTS = new Set([
  "youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com",
  "youtu.be", "www.youtu.be",
]);

const VIMEO_HOSTS = new Set([
  "vimeo.com", "www.vimeo.com", "player.vimeo.com",
]);

/**
 * The one entry point for a pasted link. Returns null for anything that isn't
 * a YouTube or Vimeo URL we recognise.
 */
export function parseVideo(input: string): VideoRef | null {
  const raw = input.trim();
  if (!raw) return null;

  let url: URL;
  try {
    url = new URL(raw.includes("://") ? raw : `https://${raw}`);
  } catch {
    return null;
  }

  // Only http(s). Blocks javascript:, data:, file: and friends.
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;

  const host = url.hostname.toLowerCase();
  if (YT_HOSTS.has(host)) return parseYouTube(url, host);
  if (VIMEO_HOSTS.has(host)) return parseVimeo(url);
  return null;
}

function parseYouTube(url: URL, host: string): VideoRef | null {
  const ref = (id: string): VideoRef | null =>
    YT_ID.test(id) ? { provider: "YOUTUBE", id, hash: null } : null;

  // youtu.be/<id>
  if (host.endsWith("youtu.be")) return ref(url.pathname.slice(1).split("/")[0]);

  // youtube.com/watch?v=<id>
  const v = url.searchParams.get("v");
  if (v) return ref(v);

  // /embed/<id>, /shorts/<id>, /live/<id>, /v/<id>
  const parts = url.pathname.split("/").filter(Boolean);
  if (parts.length >= 2 && ["embed", "shorts", "live", "v"].includes(parts[0])) {
    return ref(parts[1]);
  }
  return null;
}

function parseVimeo(url: URL): VideoRef | null {
  const parts = url.pathname.split("/").filter(Boolean);

  // The id is the last purely-numeric segment. That one rule covers every
  // shape Vimeo uses: /123, /channels/x/123, /groups/x/videos/123,
  // /album/x/video/123, /video/123 and /123/HASH.
  const idAt = parts.map((p) => VIMEO_ID.test(p)).lastIndexOf(true);
  if (idAt === -1) return null;
  const id = parts[idAt];

  // Unlisted hash: ?h=HASH (player.vimeo.com) or the segment after the id.
  const raw = url.searchParams.get("h") ?? parts[idAt + 1] ?? null;
  const hash = raw && VIMEO_HASH.test(raw) ? raw.toLowerCase() : null;

  return { provider: "VIMEO", id, hash };
}

/** True if this ref's parts still pass validation. Guards every built URL. */
function valid(ref: VideoRef): boolean {
  if (ref.provider === "YOUTUBE") return YT_ID.test(ref.id) && !ref.hash;
  return VIMEO_ID.test(ref.id) && (!ref.hash || VIMEO_HASH.test(ref.hash));
}

/**
 * YouTube player parameters, chosen to strip as much furniture as the embed
 * API still allows. Read the comments before adding to this list — several of
 * the parameters people recommend for this were removed by YouTube years ago
 * and do nothing now.
 */
const YT_PARAMS = {
  // Related videos at the end: keeps them to the SAME channel. There is no
  // longer any way to turn the end screen off — `rel=0` meant "none" until
  // Sept 2018, when YouTube redefined it. Setting it to 0 is still the least
  // bad option, it just isn't the off switch it reads as.
  rel: "0",
  iv_load_policy: "3",   // annotations / cards
  playsinline: "1",      // don't take over the screen on iOS
  color: "white",        // progress bar, not YouTube red
  // Do NOT add `modestbranding=1` (no-op since Aug 2023) or `showinfo=0`
  // (removed 2018). Both are still all over Stack Overflow. They are ignored.
} as const;

/**
 * Vimeo player parameters.
 *
 * These four DO work — verified in the browser, not assumed. Together they
 * remove the title, the "from <user>" byline and the uploader's avatar, so a
 * paused Vimeo player carries no attribution text.
 *
 * What they do NOT remove, despite being widely recommended: `like=0`,
 * `watchlater=0`, `share=0` and `pip=0` are ignored by the current player —
 * the heart / clock / share icons and the Vimeo wordmark in the control bar
 * stay put. Those are controlled by the VIDEO OWNER's plan settings (hiding
 * the logo and social buttons needs Vimeo Plus or above), not by the embed
 * URL, so nothing we do here can turn them off for a member's pasted link.
 * They were tested and dropped rather than left in as decoration.
 */
const VIMEO_PARAMS = {
  title: "0",     // video title overlay
  byline: "0",    // "from <user>"
  portrait: "0",  // uploader avatar
  badge: "0",     // staff-pick / award badge
  dnt: "1",       // do not track: no cookies, no analytics on the viewer
} as const;

/**
 * `autoplay` is for the click-to-play facade in video-embed.tsx — the iframe is
 * only created after a real click, so the browser honours it.
 */
export function videoEmbedUrl(ref: VideoRef, opts: { autoplay?: boolean } = {}): string | null {
  if (!valid(ref)) return null;

  if (ref.provider === "YOUTUBE") {
    const q = new URLSearchParams(YT_PARAMS);
    if (opts.autoplay) q.set("autoplay", "1");
    // Privacy-friendly host: no YouTube cookie until the visitor plays.
    return `https://www.youtube-nocookie.com/embed/${ref.id}?${q}`;
  }

  const q = new URLSearchParams(VIMEO_PARAMS);
  if (ref.hash) q.set("h", ref.hash); // required for unlisted videos
  if (opts.autoplay) q.set("autoplay", "1");
  return `https://player.vimeo.com/video/${ref.id}?${q}`;
}

/** Canonical watch URL. Used to round-trip a saved video back into the editor. */
export function videoWatchUrl(ref: VideoRef): string | null {
  if (!valid(ref)) return null;
  if (ref.provider === "YOUTUBE") return `https://www.youtube.com/watch?v=${ref.id}`;
  return ref.hash ? `https://vimeo.com/${ref.id}/${ref.hash}` : `https://vimeo.com/${ref.id}`;
}

/**
 * The poster, served from our own origin rather than the provider's CDN.
 *
 * Cosmetic but deliberate: with a direct i.ytimg.com or i.vimeocdn.com URL,
 * "copy image address" or one glance at the network tab names the source
 * before the video is ever played.
 */
export function videoPosterUrl(ref: VideoRef): string | null {
  if (!valid(ref)) return null;
  const q = ref.hash ? `?h=${ref.hash}` : "";
  return `/api/portfolio/video-poster/${ref.provider.toLowerCase()}/${ref.id}${q}`;
}

/** Where the poster actually lives, for the proxy route only. */
export const youTubeThumbUrls = (id: string) =>
  YT_ID.test(id)
    // maxres only exists for some videos; hqdefault always does.
    ? [`https://i.ytimg.com/vi/${id}/maxresdefault.jpg`, `https://i.ytimg.com/vi/${id}/hqdefault.jpg`]
    : [];

/**
 * Vimeo has no predictable thumbnail URL — it has to be looked up through
 * oEmbed, which is public and needs no API key.
 */
export function vimeoOEmbedUrl(id: string, hash: string | null): string | null {
  if (!VIMEO_ID.test(id)) return null;
  if (hash && !VIMEO_HASH.test(hash)) return null;
  const target = hash ? `https://vimeo.com/${id}/${hash}` : `https://vimeo.com/${id}`;
  return `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(target)}&width=1280`;
}

/** Hosts the poster proxy will actually fetch an image from. */
export const POSTER_HOSTS = new Set(["i.ytimg.com", "i.vimeocdn.com"]);
