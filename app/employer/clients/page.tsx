/**
 * /employer/clients — the logo wall, each logo optionally linking to the
 * client's own site.
 */
import type { Metadata } from "next";
import EmployerShell from "@/app/employer/_components/EmployerShell";
import ClientsClient from "./clients-client";

export const metadata: Metadata = { title: "Clients — Topezia", robots: { index: false } };

export default function EmployerClientsPage() {
  return (
    <EmployerShell>
      <ClientsClient />
    </EmployerShell>
  );
}
