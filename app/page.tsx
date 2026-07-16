import Link from "next/link";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { ANON_COOKIE } from "@/lib/anon-session";
import type { CSSProperties } from "react";

const INDIGO = "#4f46e5";
const INK = "#1a1a2e";
const MUTED = "#6b7280";

// The product home (spec §6.2: the feed is home). Returning visitors with a
// profile go straight to their feed; everyone else gets the landing + CTA into
// the résumé flow. The founding-employer waitlist still lives at /waitlist.
export default async function Home() {
  const uid = cookies().get(ANON_COOKIE)?.value;
  if (uid) {
    const profile = await prisma.profile.findUnique({ where: { userId: uid }, select: { id: true } });
    if (profile) redirect("/feed");
  }

  return (
    <main style={S.page}>
      <header style={S.nav}>
        <div style={S.brand}>topezia</div>
        <div style={{ display: "flex", gap: 22, alignItems: "center" }}>
          <Link href="/login" style={S.navLink}>Log in</Link>
          <Link href="/waitlist" style={S.navLink}>Hiring? Founding employer →</Link>
        </div>
      </header>

      <section style={S.hero}>
        <h1 style={S.h1}>
          Upload your résumé once.<br />
          <span style={{ color: INDIGO }}>See only the jobs worth your time.</span>
        </h1>
        <p style={S.sub}>
          Topezia scans thousands of sources and shows you honest, explained matches — real scores,
          visible skill gaps, and why each job fits. Then it sends you straight to the source.
        </p>
        <Link href="/onboard" style={S.cta}>Show me my matches →</Link>
        <p style={S.note}>No account needed to start. Paste your résumé and go.</p>
      </section>

      <section style={S.pillars}>
        {PILLARS.map((p) => (
          <div key={p.title} style={S.pillar}>
            <div style={S.pillarTitle}>{p.title}</div>
            <div style={S.pillarBody}>{p.body}</div>
          </div>
        ))}
      </section>
    </main>
  );
}

const PILLARS = [
  { title: "Honest scores", body: "Real match scores including the low ones, with visible skill gaps — never inflated to upsell you." },
  { title: "Straight to the source", body: "We send you to the original posting. No application trapping, no middleman." },
  { title: "One profile, zero tailoring", body: "The parse and per-job why-lines do the tailoring — you never rewrite your résumé." },
  { title: "Fresh, verified", body: "Aggressive expiry checking. Every card shows when the job was last verified live." },
];

const S: Record<string, CSSProperties> = {
  page: { minHeight: "100vh", background: "#f7f7fb", fontFamily: "'Plus Jakarta Sans', sans-serif", color: INK },
  nav: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 32px", maxWidth: 1080, margin: "0 auto", flexWrap: "wrap", gap: 12 },
  brand: { fontFamily: "'Sora', sans-serif", fontWeight: 800, fontSize: 24, color: INDIGO },
  navLink: { color: MUTED, textDecoration: "none", fontSize: 14, fontWeight: 600 },
  hero: { maxWidth: 780, margin: "0 auto", padding: "72px 24px 48px", textAlign: "center" },
  h1: { fontFamily: "'Sora', sans-serif", fontWeight: 800, fontSize: 46, lineHeight: 1.1, margin: "0 0 20px" },
  sub: { color: MUTED, fontSize: 19, lineHeight: 1.55, margin: "0 auto 32px", maxWidth: 620 },
  cta: { display: "inline-block", padding: "16px 32px", background: INDIGO, color: "#fff", borderRadius: 14, fontWeight: 700, fontSize: 18, textDecoration: "none" },
  note: { color: MUTED, fontSize: 14, marginTop: 14 },
  pillars: { maxWidth: 1000, margin: "0 auto", padding: "16px 24px 80px", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 20 },
  pillar: { background: "#fff", border: "1px solid #ececf2", borderRadius: 16, padding: 22 },
  pillarTitle: { fontFamily: "'Sora', sans-serif", fontWeight: 700, fontSize: 17, marginBottom: 8 },
  pillarBody: { color: MUTED, fontSize: 15, lineHeight: 1.5 },
};
