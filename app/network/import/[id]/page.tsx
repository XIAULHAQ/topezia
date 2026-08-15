import type { Metadata } from "next";
import AppShell from "@/app/_components/AppShell";
import ImportClient from "./import-client";

export const metadata: Metadata = { title: "Your contacts — Topezia", robots: { index: false } };

export default function ImportPage({ params }: { params: { id: string } }) {
  return (
    <AppShell>
      {/* The id alone is not a capability — /api/network/import/[id] scopes
          every read to the profile that ran the import. */}
      <ImportClient importId={params.id} />
    </AppShell>
  );
}
