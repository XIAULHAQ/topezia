"use client";

/**
 * Loads the posting, then hands it to the shared PostingForm. Fetched on the
 * client rather than server-rendered so the whole edit screen is the same
 * component tree as the create screen — see the note in the form itself.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import PostingForm, { type PostingDraft } from "@/app/employer/new/posting-form";
import { C } from "@/app/_components/ui";

export default function EditPosting({ id }: { id: string }) {
  const [posting, setPosting] = useState<PostingDraft | null | "missing">(null);

  useEffect(() => {
    fetch(`/api/postings/${id}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setPosting(d?.posting ?? "missing"))
      .catch(() => setPosting("missing"));
  }, [id]);

  if (posting === null) return <p style={{ fontSize: 13.5, color: C.mut }}>Loading…</p>;
  if (posting === "missing") {
    return (
      <div style={{ fontSize: 13.5, color: C.mut }}>
        That posting isn&apos;t yours, or no longer exists.{" "}
        <Link href="/employer/postings" style={{ color: "#4F46E5", fontWeight: 600 }}>Back to your postings</Link>
      </div>
    );
  }
  return <PostingForm existing={posting} />;
}
