/**
 * /employer/postings — every job and project this account has posted.
 *
 * The list existed only halfway down the Overview page, under the stats,
 * while Work, Testimonials, Clients, Articles and Team each had their own
 * place in the rail. So the ONE thing the employer area is for was the one
 * thing with no home, and "I don't see anywhere to see job listings I have
 * posted" is what that produces.
 */
import type { Metadata } from "next";
import EmployerShell from "@/app/employer/_components/EmployerShell";
import PostingsClient from "./postings-client";

export const metadata: Metadata = { title: "Your postings — Topezia", robots: { index: false } };

export default function PostingsPage() {
  return (
    <EmployerShell>
      <PostingsClient />
    </EmployerShell>
  );
}
