/**
 * Video poster proxy: /api/portfolio/video-poster/{youtube|vimeo}/{id}[?h=hash]
 *
 * Serves the provider's thumbnail from our own origin, so a portfolio page
 * makes no visible request to i.ytimg.com or i.vimeocdn.com before playback.
 * Without this the poster's URL names the source in the network tab and in
 * "copy image address".
 *
 * SSRF: this route must only ever fetch URLs it BUILT from a validated id, or
 * — for Vimeo, whose thumbnail URL can only be discovered via oEmbed — a URL
 * whose host is on POSTER_HOSTS. Never fetch a caller-supplied URL, and never
 * trust the oEmbed response's host without checking it.
 */
import { NextResponse } from "next/server";
import {
  isVimeoId,
  isYouTubeId,
  vimeoOEmbedUrl,
  youTubeThumbUrls,
  POSTER_HOSTS,
} from "@/lib/portfolio/video";

export const runtime = "edge";

const DAY = 86_400;
const notFound = () => new NextResponse("Not found", { status: 404 });

export async function GET(req: Request, { params }: { params: { provider: string; id: string } }) {
  const hash = new URL(req.url).searchParams.get("h");

  const candidates =
    params.provider === "youtube" && isYouTubeId(params.id)
      ? youTubeThumbUrls(params.id)
      : params.provider === "vimeo" && isVimeoId(params.id)
        ? await vimeoThumbUrls(params.id, hash)
        : null;

  if (!candidates?.length) return notFound();

  for (const url of candidates) {
    // Belt and braces: even our own built URLs go through the host check, so
    // this stays true if someone edits the builders later. The oEmbed response
    // is a third party's string, so it can also simply be unparseable.
    let host: string;
    try {
      host = new URL(url).hostname;
    } catch {
      continue;
    }
    if (!POSTER_HOSTS.has(host)) continue;

    const res = await fetch(url, { next: { revalidate: DAY } });
    // YouTube answers a missing maxresdefault with a placeholder under a 404,
    // so the status alone is enough to fall through to hqdefault.
    if (!res.ok) continue;

    return new NextResponse(res.body, {
      headers: {
        "content-type": res.headers.get("content-type") ?? "image/jpeg",
        "cache-control": "public, max-age=86400, s-maxage=604800, immutable",
      },
    });
  }

  return notFound();
}

/**
 * Vimeo thumbnails have no predictable URL, so they come from oEmbed — public,
 * no API key. An unlisted video needs its hash here too, or oEmbed 404s.
 */
async function vimeoThumbUrls(id: string, hash: string | null): Promise<string[]> {
  const oembed = vimeoOEmbedUrl(id, hash);
  if (!oembed) return [];

  try {
    const res = await fetch(oembed, { next: { revalidate: DAY } });
    if (!res.ok) return [];
    const data = (await res.json()) as { thumbnail_url?: unknown };
    return typeof data.thumbnail_url === "string" ? [data.thumbnail_url] : [];
  } catch {
    // oEmbed is a third party in our render path — a failure here should cost
    // the poster, not the page.
    return [];
  }
}
