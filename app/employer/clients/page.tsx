/**
 * /employer/clients — the logo wall, each logo optionally linking to the
 * client's own site.
 */
import type { Metadata } from "next";
import AppShell from "@/app/_components/AppShell";
import ClientsClient from "./clients-client";

export const metadata: Metadata = { title: "Clients — Topezia", robots: { index: false } };

export default function EmployerClientsPage() {
  return (
    <AppShell>
      <ClientsClient />
    </AppShell>
  );
}
