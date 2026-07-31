import type { Metadata } from "next";
import AppShell from "@/app/_components/AppShell";
import MessagesClient from "./messages-client";

export const metadata: Metadata = { title: "Messages — Topezia", robots: { index: false } };

export default function MessagesPage() {
  return (
    <AppShell>
      <MessagesClient />
    </AppShell>
  );
}
