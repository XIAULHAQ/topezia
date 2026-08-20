import type { Metadata } from "next";
import EmployerShell from "@/app/employer/_components/EmployerShell";
import InviteClient from "./invite-client";

export const metadata: Metadata = { title: "Invite people to apply — Topezia", robots: { index: false } };

export default function InvitePage({ params }: { params: { id: string } }) {
  return (
    <EmployerShell>
      <InviteClient jobId={params.id} />
    </EmployerShell>
  );
}
