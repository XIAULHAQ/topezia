/**
 * /r/{token} — where the recommender writes.
 *
 * Public and account-free by design: requiring the author to sign up would
 * cost most of the responses, and the value here is that the words are not
 * the member's, which does not depend on the author having an account.
 *
 * noindex: these are one-time private links, not pages for search.
 */
import type { Metadata } from "next";
import RespondClient from "./respond-client";

export const metadata: Metadata = {
  title: "Write a recommendation — Topezia",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

export default function RespondPage({ params }: { params: { token: string } }) {
  return <RespondClient token={params.token} />;
}
