/**
 * /employer/team — who's on the team, and who's been invited.
 */
import type { Metadata } from "next";
import EmployerShell from "@/app/employer/_components/EmployerShell";
import TeamClient from "./team-client";

export const metadata: Metadata = { title: "Team — Topezia", robots: { index: false } };

export default function EmployerTeamPage() {
  return (
    <EmployerShell>
      <TeamClient />
    </EmployerShell>
  );
}
