/**
 * /hq/posts/{id} — post editor, password protected. `id` may be the literal
 * string "new" (sentinel for "not created yet" — see post-editor.tsx).
 */
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { HQ_COOKIE, sessionValid, hqConfigured } from "@/lib/hq-auth";
import HqLogin from "../../hq-login";
import PostEditor from "./post-editor";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const metadata: Metadata = {
  title: "Edit post — Topezia HQ",
  robots: { index: false, follow: false, nocache: true },
};

export default function HqPostEditorPage({ params }: { params: { id: string } }) {
  const authed = sessionValid(cookies().get(HQ_COOKIE)?.value);
  return authed ? <PostEditor postId={params.id} /> : <HqLogin configured={hqConfigured()} />;
}
