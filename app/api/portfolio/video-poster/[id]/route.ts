/**
 * Video poster proxy: /api/portfolio/video-poster/{id}
 *
 * Serves the YouTube thumbnail from our own origin so the portfolio page makes
 * no visible request to i.ytimg.com before playback. Without this, the poster's
 * URL names the source in the network tab and in "copy image address".
 *
 * The id is matched against the 11-char pattern and the URL is BUILT from it —
 * the same rule as the embed src. This route must never fetch a caller-supplied
 * URL, or it becomes an open proxy / SSRF hole.
 */
import { NextResponse } from "next/server";
import { isYouTubeId } from "@/lib/portfolio/video";

export const runtime = "edge";

/** hqdefault always exists; maxres only sometimes, so it needs a fallback. */
const SIZES = ["maxresdefault", "hqdefault"] as const;

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  if (!isYouTubeId(params.id)) {
    return new NextResponse("Not found", { status: 404 });
  }

  for (const size of SIZES) {
    const res = await fetch(`https://i.ytimg.com/vi/${params.id}/${size}.jpg`, {
      // Poster art for a published portfolio: cache hard at the edge.
      next: { revalidate: 86_400 },
    });

    // YouTube answers a missing maxresdefault with a 120x90 placeholder under a
    // 404, so checking the status is enough to fall through to hqdefault.
    if (!res.ok) continue;

    return new NextResponse(res.body, {
      headers: {
        "content-type": res.headers.get("content-type") ?? "image/jpeg",
        "cache-control": "public, max-age=86400, s-maxage=604800, immutable",
      },
    });
  }

  return new NextResponse("Not found", { status: 404 });
}
