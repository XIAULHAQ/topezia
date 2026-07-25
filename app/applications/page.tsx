import type { Metadata } from "next";
import AppShell from "@/app/_components/AppShell";
import ApplicationsClient from "./applications-client";

export const metadata: Metadata = { title: "My applications — Topezia", robots: { index: false } };

export default function ApplicationsPage() {
  return (
    <AppShell>
      <ApplicationsClient />
    </AppShell>
  );
}
