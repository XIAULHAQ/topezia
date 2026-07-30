/**
 * /employer — the employer dashboard: company page + native postings +
 * their pipelines. Requires a signed-in account (not the anon cookie):
 * an employer must be reachable.
 *
 * Since migration 045 this is the Overview tab of a larger area — work,
 * testimonials, clients, articles and team each have their own page. The tab
 * strip lives here rather than inside EmployerClient so it still renders when
 * the dashboard is showing its signed-out state.
 */
import type { Metadata } from "next";
import AppShell from "@/app/_components/AppShell";
import EmployerTabs from "./_components/EmployerTabs";
import EmployerClient from "./employer-client";

export const metadata: Metadata = { title: "Post jobs & projects — Topezia", robots: { index: false } };

export default function EmployerPage() {
  return (
    <AppShell>
      <div style={{ maxWidth: 1080, margin: "0 auto", width: "100%" }}>
        <EmployerTabs />
        <EmployerClient />
      </div>
    </AppShell>
  );
}
