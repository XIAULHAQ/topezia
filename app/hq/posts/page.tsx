/**
 * /hq/posts — blog post list, password protected.
 *
 * Same gate shape as app/hq/page.tsx: the check runs server-side, so an
 * unauthenticated request never gets the list markup, and the data endpoint
 * (/api/hq/posts) re-checks the same session independently.
 */
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { HQ_COOKIE, sessionValid, hqConfigured } from "@/lib/hq-auth";
import HqLogin from "../hq-login";
import PostsList from "./posts-list";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const metadata: Metadata = {
  title: "Blog posts — Topezia HQ",
  robots: { index: false, follow: false, nocache: true },
};

export default function HqPostsPage() {
  const authed = sessionValid(cookies().get(HQ_COOKIE)?.value);
  return authed ? <PostsList /> : <HqLogin configured={hqConfigured()} />;
}
