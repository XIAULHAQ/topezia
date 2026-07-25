import type { Metadata } from "next";
import AppShell from "@/app/_components/AppShell";
import PipelineClient from "./pipeline-client";

export const metadata: Metadata = { title: "Applicant pipeline — Topezia", robots: { index: false } };

export default function PipelinePage({ params }: { params: { id: string } }) {
  return (
    <AppShell>
      <PipelineClient jobId={params.id} />
    </AppShell>
  );
}
