import type { Metadata } from "next";
import { Suspense } from "react";
import AppShell from "@/app/_components/AppShell";
import NetworkClient from "./network-client";

export const metadata: Metadata = { title: "Your network — Topezia", robots: { index: false } };

export default function NetworkPage() {
  return (
    <AppShell>
      {/* useSearchParams needs a boundary or the whole route opts out of
          static rendering with a build-time warning. */}
      <Suspense fallback={null}>
        <NetworkClient />
      </Suspense>
    </AppShell>
  );
}
