/**
 * /company/{slug} — an employer's public page: who they are and what they're
 * hiring for right now. Only companies that exist ON Topezia get one (native
 * posters); crawled jobs keep pointing at their real employers' own sites.
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import type { CSSProperties } from "react";
import { prisma } from "@/lib/prisma";
import SiteNav from "@/app/_components/SiteNav";
import { SiteFooter } from "@/app/_components/SiteChrome";

export const revalidate = 900;

const INK = "#1a1a2e";
const MUTED = "#6b7280";
const LINE = "#e5e7eb";

async function getCompany(slug: string) {
  return prisma.company.findUnique({
    where: { slug },
    select: {
      name: true, slug: true, tagline: true, about: true, website: true, location: true,
      jobs: {
        where: { status: "LIVE" },
        orderBy: { createdAt: "desc" },
        select: { id: true, titleRaw: true, kind: true, locationRaw: true, remoteType: true, employmentType: true, createdAt: true },
      },
    },
  });
}

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const c = await getCompany(params.slug);
  if (!c) return { title: "Company — Topezia" };
  const title = `${c.name} — jobs & projects | Topezia`;
  const description = c.tagline ?? `${c.name} is hiring on Topezia.`;
  return { title, description, alternates: { canonical: `/company/${c.slug}` }, openGraph: { title, description } };
}

const label = (s: string) => s.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (ch) => ch.toUpperCase()).replace("Us", "US");

export default async function CompanyPage({ params }: { params: { slug: string } }) {
  const c = await getCompany(params.slug);
  if (!c) notFound();

  return (
    <main style={{ background: "#F7F8FB", minHeight: "100vh", display: "flex", flexDirection: "column", fontFamily: "var(--font-jakarta), sans-serif" }}>
      <SiteNav />
      <div style={{ maxWidth: 760, margin: "0 auto", padding: "36px 24px 60px", width: "100%", flex: 1 }}>
        <div style={{ display: "flex", gap: 18, alignItems: "center" }}>
          <div style={S.logo}>{c.name.slice(0, 2).toUpperCase()}</div>
          <div>
            <h1 style={{ fontSize: 27, fontWeight: 800, letterSpacing: "-0.5px", margin: 0, color: INK }}>{c.name}</h1>
            <div style={{ fontSize: 13.5, color: MUTED, marginTop: 4 }}>
              {[c.tagline, c.location].filter(Boolean).join(" · ")}
              {c.website && <> · <a href={c.website} target="_blank" rel="noopener noreferrer" style={{ color: "#4f46e5", fontWeight: 600 }}>{new URL(c.website).hostname.replace(/^www\./, "")}</a></>}
            </div>
          </div>
        </div>

        {c.about && (
          <section style={S.card}>
            <h2 style={S.h2}>About</h2>
            <p style={{ fontSize: 14, lineHeight: 1.7, color: "#374151", margin: 0, whiteSpace: "pre-wrap" }}>{c.about}</p>
          </section>
        )}

        <section style={S.card}>
          <h2 style={S.h2}>Open right now · {c.jobs.length}</h2>
          {c.jobs.length === 0 && <p style={{ fontSize: 13.5, color: MUTED, margin: 0 }}>Nothing open at the moment.</p>}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {c.jobs.map((j) => (
              <Link key={j.id} href={`/job/${j.id}`} style={S.jobRow}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: INK }}>{j.titleRaw}</div>
                  <div style={{ fontSize: 12.5, color: MUTED, marginTop: 3 }}>
                    {j.kind === "PROJECT" ? "Freelance project" : label(j.employmentType)} · {j.locationRaw || label(j.remoteType)}
                  </div>
                </div>
                <span style={{ color: "#4f46e5", fontWeight: 700, fontSize: 13, flex: "none" }}>{j.kind === "PROJECT" ? "View & propose →" : "View & apply →"}</span>
              </Link>
            ))}
          </div>
        </section>
      </div>
      <SiteFooter />
    </main>
  );
}

const S: Record<string, CSSProperties> = {
  logo: { width: 64, height: 64, borderRadius: 16, background: "linear-gradient(135deg,#6366F1,#22D3EE)", color: "#fff", display: "grid", placeItems: "center", fontSize: 22, fontWeight: 800, flex: "none" },
  card: { background: "#fff", border: `1px solid ${LINE}`, borderRadius: 16, padding: "22px 24px", marginTop: 22 },
  h2: { fontSize: 15, fontWeight: 800, margin: "0 0 12px", color: INK },
  jobRow: { display: "flex", alignItems: "center", gap: 12, border: `1px solid ${LINE}`, borderRadius: 12, padding: "13px 16px", textDecoration: "none" },
};
