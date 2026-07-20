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

/** Privacy-friendly host: no YouTube cookie until the visitor actually plays. */
export const youTubeEmbedUrl = (id: string) =>
  ID.test(id) ? `https://www.youtube-nocookie.com/embed/${id}` : null;

export const youTubeThumbUrl = (id: string) =>
  ID.test(id) ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : null;

export const youTubeWatchUrl = (id: string) =>
  ID.test(id) ? `https://www.youtube.com/watch?v=${id}` : null;
