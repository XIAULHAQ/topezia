/**
 * One-click unsubscribe landing (linked from every alert email).
 *
 * Deliberately a GET page with no confirmation step: making people log in or
 * click twice to stop emails is how you earn spam complaints. The token is a
 * random uuid, so it's unguessable, and it only ever disables one saved search.
 */
import Link from "next/link";
import type { CSSProperties } from "react";
import { prisma } from "@/lib/prisma";

const INDIGO = "#4f46e5";
const INK = "#1a1a2e";
const MUTED = "#6b7280";

export const dynamic = "force-dynamic";

export default async function UnsubscribePage({ searchParams }: { searchParams: { token?: string } }) {
  const token = searchParams.token;
  let label: string | null = null;
  let ok = false;

  if (token) {
    const alert = await prisma.jobAlert.findUnique({ where: { unsubToken: token }, select: { id: true, label: true } });
    if (alert) {
      await prisma.jobAlert.update({ where: { id: alert.id }, data: { unsubscribedAt: new Date() } });
      label = alert.label;
      ok = true;
    }
  }

  return (
    <main style={S.page}>
      <div style={S.card}>
        <div style={S.brand}>topezia</div>
        <h1 style={S.h1}>{ok ? "You're unsubscribed." : "Link not recognized"}</h1>
        <p style={S.p}>
          {ok
            ? `We've stopped sending alerts for ${label}. No hard feelings — no more emails about it.`
            : "That unsubscribe link is invalid or already used. If you're still getting emails you don't want, reply to one and we'll sort it out."}
        </p>
        <Link href="/" style={S.cta}>Back to Topezia</Link>
      </div>
    </main>
  );
}

const S: Record<string, CSSProperties> = {
  page: { minHeight: "100vh", background: "#f7f7fb", fontFamily: "'Plus Jakarta Sans', sans-serif", color: INK, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 },
  card: { maxWidth: 460, textAlign: "center", background: "#fff", border: "1px solid #ececf2", borderRadius: 20, padding: "40px 32px" },
  brand: { fontFamily: "'Sora', sans-serif", fontWeight: 800, fontSize: 22, color: INDIGO, marginBottom: 20 },
  h1: { fontFamily: "'Sora', sans-serif", fontWeight: 800, fontSize: 26, margin: "0 0 12px" },
  p: { color: MUTED, fontSize: 16, lineHeight: 1.55, margin: "0 0 24px" },
  cta: { display: "inline-block", padding: "12px 24px", background: INDIGO, color: "#fff", borderRadius: 12, fontWeight: 700, fontSize: 15, textDecoration: "none" },
};
