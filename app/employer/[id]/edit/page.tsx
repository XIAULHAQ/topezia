/**
 * /employer/{id}/edit — change a posting after it exists.
 *
 * Until now a posting was write-once: a typo in a live title, a wrong salary
 * or a role picked in haste could only be fixed by closing the posting and
 * writing it again, which threw away its pipeline. Reported as "no way to
 * edit a job I have posted", which was exactly right.
 *
 * The form is the SAME component as the post form, handed the existing
 * posting — a second copy would have drifted from it within a release.
 */
import type { Metadata } from "next";
import EmployerShell from "@/app/employer/_components/EmployerShell";
import EditPosting from "./edit-client";

export const metadata: Metadata = { title: "Edit posting — Topezia", robots: { index: false } };

export default function EditPostingPage({ params }: { params: { id: string } }) {
  return (
    <EmployerShell>
      <EditPosting id={params.id} />
    </EmployerShell>
  );
}
