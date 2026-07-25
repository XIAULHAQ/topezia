/**
 * /employer — the employer dashboard: company page + native postings +
 * their pipelines. Requires a signed-in account (not the anon cookie):
 * an employer must be reachable.
 */
import type { Metadata } from "next";
import AppShell from "@/app/_components/AppShell";
import EmployerClient from "./employer-client";

export const metadata: Metadata = { title: "Post jobs & projects — Topezia", robots: { index: false } };

export default function EmployerPage() {
  return (
    <AppShell>
      <EmployerClient />
    </AppShell>
  );
}
