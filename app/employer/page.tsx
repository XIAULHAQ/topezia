/**
 * /employer — the employer dashboard: company page + native postings +
 * their pipelines. Requires a signed-in account (not the anon cookie):
 * an employer must be reachable.
 *
 * Since migration 045 this is the Overview page of a larger area — work,
 * testimonials, clients, articles and team each have their own page, reached
 * from EmployerShell's sidebar. That shell is the COMPANY's, not the member's:
 * a Company is its own entity that happens to be owned by an account.
 */
import type { Metadata } from "next";
import EmployerShell from "@/app/employer/_components/EmployerShell";
import EmployerClient from "./employer-client";

export const metadata: Metadata = { title: "Post jobs & projects — Topezia", robots: { index: false } };

export default function EmployerPage() {
  return (
    <EmployerShell>
      <EmployerClient />
    </EmployerShell>
  );
}
