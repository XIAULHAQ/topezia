/**
 * /search — real results for AppShell's top-bar search ("Search jobs,
 * companies…"). Case-insensitive match against job title or company name,
 * live jobs only. No full-text ranking/relevance model — this is a plain
 * substring filter, same honesty standard as /jobs' own directory ("labelled
 * for what it does rather than dressed up as something it is not").
 */
import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import AppShell from "@/app/_components/AppShell";
import { jobPath } from "@/lib/seo/job-slug";
import { stateName } from "@/lib/seo/pages";
import { curSym } from "@/lib/currency";

const INK = "#0F172A", MUTED = "#64748B", LINE = "#E2E8F0";
const GRAD = "linear-gradient(135deg,#8B5CF6,#3B82F6)";
const MIN_QUERY_LEN = 2;
const MAX_RESULTS = 40;

const JOB_SELECT = {
  id: true, titleRaw: true, companyName: true, locationState: true, country: true,
  remoteScope: true, remoteType: true, employmentType: true,
  salaryMin: true, salaryMax: true, salaryPeriod: true, salaryCurrency: true,
  lastVerifiedAt: true,
} as const;
type ResultJob = Awaited<ReturnType<typeof searchJobs>>["jobs"][number];

async function searchJobs(q: string) {
  const where = {
    status: "LIVE" as const,
    kind: "JOB" as const,
    OR: [
      { titleRaw: { contains: q, mode: "insensitive" as const } },
      { companyName: { contains: q, mode: "insensitive" as const } },
    ],
  };
  const [jobs, total] = await Promise.all([
    prisma.job.findMany({ where, select: JOB_SELECT, orderBy: { lastVerifiedAt: "desc" }, take: MAX_RESULTS }),
    prisma.job.count({ where }),
  ]);
  return { jobs, total };
}

function salaryText(j: ResultJob) {
  if (j.salaryMin == null || j.salaryMax == null) return null;
  const sym = curSym(j.salaryCurrency);
  const unit = j.salaryPeriod === "HOUR" ? "/hr" : j.salaryPeriod === "YEAR" ? "/yr" : j.salaryPeriod === "PROJECT" ? " budget" : "";
  const fmt = (n: number) => (n >= 1000 ? `${sym}${Math.round(n / 1000)}k` : `${sym}${n}`);
  return `${fmt(j.salaryMin)}–${fmt(j.salaryMax)}${unit}`;
}

function locationText(j: ResultJob) {
  if (j.remoteType.startsWith("REMOTE")) return j.remoteScope ? `Remote · ${j.remoteScope}` : "Remote";
  if (j.locationState) return stateName(j.locationState);
  if (j.country) return j.country;
  return "Location unspecified";
}

export function generateMetadata({ searchParams }: { searchParams: { q?: string } }): Metadata {
  const q = (searchParams.q ?? "").trim();
  return { title: q ? `“${q}” — job search | Topezia` : "Search | Topezia", robots: { index: false } };
}

export default async function SearchPage({ searchParams }: { searchParams: { q?: string } }) {
  const q = (searchParams.q ?? "").trim();
  const { jobs, total } = q.length >= MIN_QUERY_LEN ? await searchJobs(q) : { jobs: [] as ResultJob[], total: 0 };

  return (
    <AppShell>
      <div style={{ maxWidth: 720 }}>
        <h1 style={{ margin: "0 0 6px", fontSize: 21, fontWeight: 800, color: INK }}>
          {q ? `Results for “${q}”` : "Search jobs & companies"}
        </h1>

        {q.length < MIN_QUERY_LEN ? (
          <p style={{ color: MUTED, fontSize: 13.5 }}>
            {q ? `Type at least ${MIN_QUERY_LEN} characters to search.` : "Use the search bar above to find a job by title or company."}
          </p>
        ) : total === 0 ? (
          <p style={{ color: MUTED, fontSize: 13.5 }}>No live jobs match “{q}” right now.</p>
        ) : (
          <>
            <p style={{ color: MUTED, fontSize: 13, marginBottom: 18 }}>
              {total} live job{total === 1 ? "" : "s"} match{total === 1 ? "es" : ""}
              {total > jobs.length ? ` — showing the ${jobs.length} most recently verified` : ""}.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {jobs.map((j) => {
                const sal = salaryText(j);
                return (
                  <Link key={j.id} href={jobPath(j)} style={S.card}>
                    <div style={{ ...S.logo, background: GRAD }}>{(j.companyName || "?")[0].toUpperCase()}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14.5, fontWeight: 700, color: INK }}>{j.titleRaw}</div>
                      <div style={{ fontSize: 12.5, color: MUTED, marginTop: 3 }}>{j.companyName} · {locationText(j)}</div>
                    </div>
                    {sal && <div style={{ fontSize: 12.5, fontWeight: 700, color: "#059669", flex: "none" }}>{sal}</div>}
                  </Link>
                );
              })}
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}

const S = {
  card: {
    display: "flex", alignItems: "center", gap: 14, padding: "14px 16px",
    background: "#fff", border: `1px solid ${LINE}`, borderRadius: 14,
    textDecoration: "none", color: "inherit",
  },
  logo: {
    width: 40, height: 40, borderRadius: 10, flex: "none", color: "#fff",
    display: "grid", placeItems: "center", fontSize: 15, fontWeight: 800,
  },
} as const;
