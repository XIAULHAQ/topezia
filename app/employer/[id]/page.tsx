import type { Metadata } from "next";
import EmployerShell from "@/app/employer/_components/EmployerShell";
import PipelineClient from "./pipeline-client";

export const metadata: Metadata = { title: "Applicant pipeline — Topezia", robots: { index: false } };

export default function PipelinePage({ params }: { params: { id: string } }) {
  return (
    <EmployerShell>
      <PipelineClient jobId={params.id} />
    </EmployerShell>
  );
}
