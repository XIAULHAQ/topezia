/**
 * /employer/work — the company's own portfolio: case studies, shipped
 * products, campaigns. Requires a signed-in account that owns a company; the
 * API re-checks that independently on every write.
 */
import type { Metadata } from "next";
import AppShell from "@/app/_components/AppShell";
import WorkClient from "./work-client";

export const metadata: Metadata = { title: "Our work — Topezia", robots: { index: false } };

export default function EmployerWorkPage() {
  return (
    <AppShell>
      <WorkClient />
    </AppShell>
  );
}
