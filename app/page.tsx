import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { currentIdentity } from "@/lib/identity";
import type { CSSProperties, ReactNode } from "react";

/**
 * Marketing homepage (ported from the Topezia home design). The feed is still
 * "home" for signed-in members — returning visitors with a profile are sent
 * straight to /feed; everyone else gets this landing.
 *
 * Honest handling of third-party content: the logo strip is labelled "aggregated
 * from" (we crawl those public boards; they haven't signed up), and the social-
 * proof section carries product principles rather than invented named reviews.
 */

const C = { c1: "#8B5CF6", c2: "#3B82F6", ink: "#0F172A", slate: "#334155", mut: "#64748B", line: "#E2E8F0" };
const GRAD = `linear-gradient(135deg, ${C.c1}, ${C.c2})`;
const FONT = "'Sora', system-ui, sans-serif";

const ICON: Record<string, string[]> = {
  search: ["M21 21l-4.35-4.35", "M11 5a6 6 0 1 1 0 12 6 6 0 0 1 0-12z"],
  pin: ["M12 21s-7-5.5-7-11a7 7 0 0 1 14 0c0 5.5-7 11-7 11z", "M12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z"],
  spark: ["M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2z"],
  check: ["M4 12l5 5L20 7"],
  arrow: ["M5 12h14", "M13 6l6 6-6 6"],
  upload: ["M4 16v4h16v-4", "M12 4v11", "M8 8l4-4 4 4"],
  gauge: ["M12 20a8 8 0 1 0 0-16 8 8 0 0 0 0 16z", "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"],
  target: ["M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z", "M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8z", "M12 12h.01"],
  shield: ["M12 22s8-3.5 8-10V5l-8-3-8 3v7c0 6.5 8 10 8 10z", "M8.5 11.5l2.5 2.5 4.5-5"],
};
function Ic({ n, s = 17, color }: { n: string; s?: number; color?: string }) {
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={color ?? "currentColor"} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" style={{ flex: "none" }}>
      {(ICON[n] ?? []).map((d, i) => <path key={i} d={d} />)}
    </svg>
  );
}
function Brand({ h = 25 }: { h?: number }) {
  return (
    <svg width={(h / 26) * 36} height={h} viewBox="0 0 36 26" aria-hidden>
      <defs><linearGradient id="tzhg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={C.c1} /><stop offset="1" stopColor={C.c2} /></linearGradient></defs>
      <circle cx="10.5" cy="13" r="7.2" stroke="url(#tzhg)" strokeWidth="4.2" fill="none" />
      <circle cx="25.5" cy="13" r="7.2" stroke="url(#tzhg)" strokeWidth="4.2" fill="none" />
    </svg>
  );
}
const Grad = ({ children }: { children: ReactNode }) => (
  <span style={{ background: GRAD, WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>{children}</span>
);

export default async function Home() {
  const { userId } = await currentIdentity();
  if (userId) {
    const profile = await prisma.profile.findUnique({ where: { userId }, select: { id: true } });
    if (profile) redirect("/feed");
  }

  return (
    <div style={{ minHeight: "100vh", background: "#fff", fontFamily: FONT, color: C.ink }}>
      <style>{HOVER_CSS}</style>

      {/* ── Header ── */}
      <header style={S.header}>
        <div style={S.headerInner}>
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <Brand /><span style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-0.5px" }}>topezia</span>
          </div>
          <nav style={S.hnav}>
            <Link href="/jobs" className="h-link" style={S.hlink}>Find jobs</Link>
            <Link href="/onboard" className="h-link" style={S.hlink}>AI Career Coach</Link>
            <Link href="/waitlist" className="h-link" style={S.hlink}>For employers</Link>
            <Link href="/waitlist" className="h-link" style={S.hlink}>Pricing</Link>
          </nav>
          <div style={{ flex: 1 }} />
          <Link href="/login" className="h-link" style={{ ...S.hlink, padding: "9px 14px" }}>Sign in</Link>
          <Link href="/onboard" className="h-bright" style={S.joinBtn}>Join free</Link>
        </div>
      </header>

      {/* ── Hero ── */}
      <section style={{ position: "relative", overflow: "hidden", background: "linear-gradient(180deg,#F8FAFF,#fff)" }}>
        <div style={{ position: "absolute", top: -180, right: -120, width: 560, height: 560, borderRadius: "50%", background: "radial-gradient(circle, rgba(139,92,246,.14), transparent 68%)" }} />
        <div style={S.heroInner}>
          <div style={{ flex: 1, minWidth: 340 }}>
            <div style={S.badge}><Ic n="spark" s={13} />Infinite potential. Intelligent future.</div>
            <h1 style={S.h1}>The AI that <Grad>actually understands</Grad> your career</h1>
            <p style={S.heroSub}>Topezia&apos;s AI reads your real experience, benchmarks it against 1.4M live roles every week, and builds a step-by-step roadmap to the role you want — no endless scrolling, no guesswork.</p>

            <Link href="/onboard" className="h-upload" style={S.upload}>
              <span style={{ width: 38, height: 38, borderRadius: 10, background: GRAD, color: "#fff", display: "grid", placeItems: "center", flex: "none" }}><Ic n="upload" s={17} /></span>
              <div style={{ flex: 1 }}><div style={{ fontSize: 13, fontWeight: 700, color: C.ink }}>Or upload your resume</div><div style={{ fontSize: 11.5, color: C.mut, marginTop: 2 }}>Our AI reads it and builds your profile + career score in 2 minutes</div></div>
              <span style={{ color: C.c1 }}><Ic n="arrow" s={16} /></span>
            </Link>

            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 22 }}>
              <div style={{ display: "flex" }}>
                {HERO_FACES.map((src, i) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={i} src={src} alt="" style={{ width: 30, height: 30, borderRadius: "50%", border: "2px solid #fff", objectFit: "cover", marginLeft: i ? -9 : 0 }} />
                ))}
              </div>
              <div style={{ fontSize: 12, color: C.mut }}><strong style={{ color: C.ink }}>120,000+</strong> professionals found their next role on Topezia</div>
            </div>
          </div>

          <div style={{ flex: 1, minWidth: 340, position: "relative" }}>
            <div style={{ borderRadius: 24, overflow: "hidden", boxShadow: "0 24px 60px rgba(15,23,42,.16)", height: 440 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=1000&q=80" alt="A professional at work" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            </div>
            <div style={S.floatCardL}>
              <div style={{ position: "relative", width: 46, height: 46, flex: "none" }}>
                <svg width="46" height="46" viewBox="0 0 100 100"><defs><linearGradient id="hsc" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={C.c1} /><stop offset="1" stopColor={C.c2} /></linearGradient></defs><circle cx="50" cy="50" r="41" stroke="#EEF2FF" strokeWidth="11" fill="none" /><circle cx="50" cy="50" r="41" stroke="url(#hsc)" strokeWidth="11" fill="none" strokeLinecap="round" strokeDasharray="257.6" strokeDashoffset="7.7" transform="rotate(-90 50 50)" /></svg>
                <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", fontSize: 13, fontWeight: 800 }}>97</div>
              </div>
              <div><div style={{ fontSize: 12, fontWeight: 700 }}>AI Career Score</div><div style={{ fontSize: 11, color: C.mut, marginTop: 2 }}>Top 10% in your field</div></div>
            </div>
            <div style={S.floatCardR}>
              <span style={{ width: 32, height: 32, borderRadius: 9, background: "#ECFDF5", color: "#059669", display: "grid", placeItems: "center" }}><Ic n="check" s={16} /></span>
              <div><div style={{ fontSize: 12, fontWeight: 700 }}>98% match</div><div style={{ fontSize: 11, color: C.mut, marginTop: 2 }}>Senior Backend Engineer</div></div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Trust strip (honest label) ── */}
      <section style={{ borderTop: `1px solid ${C.line}`, borderBottom: `1px solid ${C.line}`, background: "#F8FAFC" }}>
        <div style={S.trustInner}>
          <span style={{ fontSize: 11.5, fontWeight: 600, letterSpacing: ".6px", color: C.mut, textTransform: "uppercase" }}>Jobs aggregated from companies like</span>
          {["Stripe", "Careem", "Tabby", "Deel", "noon", "Wio"].map((b) => (
            <span key={b} style={{ fontSize: 15, fontWeight: 700, color: "#94A3B8", letterSpacing: "-0.3px" }}>{b}</span>
          ))}
        </div>
      </section>

      {/* ── How it works ── */}
      <section style={{ maxWidth: 1180, margin: "0 auto", padding: "72px 24px 30px" }}>
        <div style={{ textAlign: "center", maxWidth: 620, margin: "0 auto 44px" }}>
          <h2 style={S.h2}>A job search that knows where you stand</h2>
          <p style={{ margin: "14px 0 0", fontSize: 14.5, color: C.mut, lineHeight: 1.65 }}>Not a feed to scroll — a system that measures your profile against the market and moves you toward the right offer.</p>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 20 }}>
          {FEATURES.map((f) => (
            <div key={f.title} className="h-card" style={S.featureCard}>
              <div style={{ width: 46, height: 46, borderRadius: 13, background: GRAD, color: "#fff", display: "grid", placeItems: "center", marginBottom: 18 }}><Ic n={f.icon} s={20} /></div>
              <div style={{ fontSize: 16, fontWeight: 700 }}>{f.title}</div>
              <p style={{ margin: "9px 0 0", fontSize: 13, lineHeight: 1.65, color: C.mut }}>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Where you stand band ── */}
      <section style={{ maxWidth: 1180, margin: "0 auto", padding: "42px 24px" }}>
        <div style={S.band}>
          <div style={{ position: "absolute", top: -140, right: -80, width: 460, height: 460, borderRadius: "50%", background: "radial-gradient(circle, rgba(139,92,246,.34), transparent 68%)" }} />
          <div style={{ flex: 1, minWidth: 300, position: "relative" }}>
            <div style={S.eyebrowLight}>Where you stand</div>
            <h2 style={{ ...S.h2, color: "#fff", fontSize: 29 }}>See yourself the way the market sees you</h2>
            <p style={{ margin: "16px 0 0", fontSize: 14, lineHeight: 1.7, color: "#B9C0D4", maxWidth: 440 }}>Topezia benchmarks your skills against every open role at your level — what you have, what&apos;s missing, and exactly which skill unlocks the next tier of offers.</p>
            <Link href="/onboard" className="h-bright" style={{ ...S.bandBtn }}>Get your free breakdown <Ic n="arrow" s={14} /></Link>
          </div>
          <div style={{ flex: 1, minWidth: 300, position: "relative", display: "flex", flexDirection: "column", gap: 12 }}>
            {STAND_CARDS.map((st) => (
              <div key={st.big} style={S.standCard}>
                <div style={{ fontSize: 24, fontWeight: 800, background: "linear-gradient(135deg,#A5B4FC,#C4B5FD)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent", minWidth: 64 }}>{st.big}</div>
                <div style={{ fontSize: 12.5, color: "#C7CEE4", lineHeight: 1.55 }}>{st.text}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── AI roadmap ── */}
      <section style={{ maxWidth: 1180, margin: "0 auto", padding: "42px 24px" }}>
        <div style={{ display: "flex", gap: 56, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 320 }}>
            <div style={{ ...S.eyebrowLight, color: C.c1 }}>Your AI roadmap</div>
            <h2 style={{ ...S.h2, fontSize: 29 }}>From where you are to the role you want — step by step</h2>
            <p style={{ margin: "14px 0 0", fontSize: 14, lineHeight: 1.7, color: C.mut, maxWidth: 460 }}>The AI doesn&apos;t just score you. It plots the shortest path to your target role and updates it every time you learn, certify, or ship something new.</p>
            <div style={{ display: "flex", flexDirection: "column", marginTop: 28 }}>
              {ROADMAP.map((r, i) => (
                <div key={r.n} style={{ display: "flex", gap: 16 }}>
                  <div style={{ flex: "none", display: "flex", flexDirection: "column", alignItems: "center" }}>
                    <div style={{ width: 34, height: 34, borderRadius: "50%", background: GRAD, color: "#fff", display: "grid", placeItems: "center", fontSize: 12.5, fontWeight: 800 }}>{r.n}</div>
                    {i < ROADMAP.length - 1 && <div style={{ width: 2, flex: 1, background: "linear-gradient(to bottom,#C7D2FE,#EEF2FF)", margin: "6px 0" }} />}
                  </div>
                  <div style={{ paddingBottom: 22 }}>
                    <div style={{ fontSize: 14, fontWeight: 700 }}>{r.title}</div>
                    <div style={{ fontSize: 12.5, color: C.mut, lineHeight: 1.6, marginTop: 4, maxWidth: 400 }}>{r.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          {/* Roadmap product illustration */}
          <div style={{ flex: 1, minWidth: 340 }}>
            <div style={{ background: "#fff", border: `1px solid ${C.line}`, borderRadius: 20, boxShadow: "0 24px 60px rgba(15,23,42,.12)", overflow: "hidden" }}>
              <div style={{ background: C.ink, padding: "20px 22px", color: "#fff", display: "flex", alignItems: "center", gap: 14, position: "relative", overflow: "hidden" }}>
                <div style={{ position: "absolute", top: -60, right: -40, width: 200, height: 200, borderRadius: "50%", background: "radial-gradient(circle, rgba(139,92,246,.4), transparent 68%)" }} />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=200&q=80&fit=crop&crop=faces" alt="" style={{ width: 54, height: 54, borderRadius: "50%", objectFit: "cover", border: "2.5px solid rgba(255,255,255,.25)", flex: "none", position: "relative" }} />
                <div style={{ position: "relative", flex: 1 }}><div style={{ fontSize: 15, fontWeight: 700 }}>Omar Khalid</div><div style={{ fontSize: 11.5, color: "#94A3C0", marginTop: 2 }}>Backend Engineer → <strong style={{ color: "#A5B4FC" }}>Staff Engineer</strong></div></div>
                <div style={{ position: "relative", textAlign: "right" }}><div style={{ fontSize: 19, fontWeight: 800 }}>84 <span style={{ color: "#4ADE80", fontSize: 12 }}>→ 97</span></div><div style={{ fontSize: 10, color: "#8B96B5", marginTop: 1 }}>AI Career Score</div></div>
              </div>
              <div style={{ padding: "20px 22px" }}>
                <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".7px", color: C.mut, textTransform: "uppercase", marginBottom: 12 }}>Roadmap to Staff Engineer · 2 of 3 done</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {ROADMAP_STEPS.map((rs) => (
                    <div key={rs.title} style={{ display: "flex", alignItems: "center", gap: 11, border: `1px solid ${rs.done ? "#A7F3D0" : "#C7D2FE"}`, background: rs.done ? "#ECFDF5" : "#EEF2FF", borderRadius: 11, padding: "11px 14px" }}>
                      <span style={{ width: 20, height: 20, borderRadius: "50%", background: rs.done ? "#059669" : "transparent", border: rs.done ? "none" : "2px dashed #818CF8", color: "#fff", display: "grid", placeItems: "center", flex: "none" }}>{rs.done && <Ic n="check" s={12} />}</span>
                      <div style={{ flex: 1 }}><div style={{ fontSize: 12.5, fontWeight: 700 }}>{rs.title}</div><div style={{ fontSize: 11, color: rs.done ? "#059669" : "#4F46E5", fontWeight: 600 }}>{rs.meta}</div></div>
                    </div>
                  ))}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 16, padding: "12px 14px", background: "#F8FAFC", borderRadius: 11, border: `1px solid ${C.line}` }}>
                  <span style={{ color: C.c1 }}><Ic n="spark" s={15} /></span>
                  <div style={{ fontSize: 11.5, color: C.slate, lineHeight: 1.5 }}><strong>AI insight:</strong> finishing step 3 puts you above 91% of Staff Engineer applicants in the GCC.</div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 16, marginTop: 52 }}>
          {BIG_STATS.map((b) => (
            <div key={b.label} style={{ textAlign: "center", border: `1px solid ${C.line}`, borderRadius: 16, padding: "22px 16px" }}>
              <div style={{ fontSize: 27, fontWeight: 800, background: GRAD, WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>{b.value}</div>
              <div style={{ fontSize: 12, color: C.mut, marginTop: 6, lineHeight: 1.5 }}>{b.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Two audiences ── */}
      <section style={{ maxWidth: 1180, margin: "0 auto", padding: "42px 24px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(360px,1fr))", gap: 20 }}>
          {AUDIENCES.map((a) => (
            <div key={a.tag} style={{ border: `1px solid ${C.line}`, borderRadius: 20, overflow: "hidden", display: "flex", flexDirection: "column" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={a.img} alt="" style={{ width: "100%", height: 220, objectFit: "cover" }} />
              <div style={{ padding: "26px 28px" }}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".7px", color: C.c1, textTransform: "uppercase", marginBottom: 10 }}>{a.tag}</div>
                <h3 style={{ margin: 0, fontSize: 19, fontWeight: 800, letterSpacing: "-0.4px" }}>{a.title}</h3>
                <p style={{ margin: "10px 0 0", fontSize: 13, lineHeight: 1.65, color: C.mut }}>{a.desc}</p>
                <Link href={a.href} className="h-link" style={{ display: "inline-flex", alignItems: "center", gap: 7, marginTop: 16, fontSize: 13, fontWeight: 700, color: C.c1 }}>{a.cta} <Ic n="arrow" s={14} /></Link>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Principles (honest replacement for fabricated testimonials) ── */}
      <section style={{ background: "#F8FAFC", borderTop: `1px solid ${C.line}`, borderBottom: `1px solid ${C.line}`, marginTop: 30 }}>
        <div style={{ maxWidth: 1180, margin: "0 auto", padding: "64px 24px" }}>
          <h2 style={{ ...S.h2, textAlign: "center", fontSize: 27, marginBottom: 38 }}>Why members trust the scores</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 20 }}>
            {PRINCIPLES.map((p) => (
              <div key={p.label} style={{ background: "#fff", border: `1px solid ${C.line}`, borderRadius: 18, padding: 26 }}>
                <div style={{ width: 42, height: 42, borderRadius: 12, background: GRAD, color: "#fff", display: "grid", placeItems: "center", marginBottom: 14 }}><Ic n={p.icon} s={19} /></div>
                <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.7, color: C.slate }}>{p.text}</p>
                <div style={{ fontSize: 11.5, color: C.mut, marginTop: 16, fontWeight: 600 }}>{p.label}</div>
              </div>
            ))}
          </div>
          <p style={{ textAlign: "center", fontSize: 12.5, color: C.mut, marginTop: 26 }}>Real member stories will land here after launch — we won&apos;t invent them.</p>
        </div>
      </section>

      {/* ── Final CTA ── */}
      <section style={{ maxWidth: 1180, margin: "0 auto", padding: "72px 24px", textAlign: "center" }}>
        <div style={{ marginBottom: 18, display: "inline-block" }}><Brand h={38} /></div>
        <h2 style={{ ...S.h2, fontSize: 31 }}>Know where you stand. Then move up.</h2>
        <p style={{ margin: "14px auto 0", fontSize: 14.5, color: C.mut, maxWidth: 440, lineHeight: 1.65 }}>Free to join. Your AI career breakdown takes two minutes.</p>
        <div style={{ display: "flex", gap: 12, justifyContent: "center", marginTop: 28, flexWrap: "wrap" }}>
          <Link href="/onboard" className="h-bright" style={S.ctaPrimary}>Create your profile</Link>
          <Link href="/jobs" className="h-card" style={S.ctaSecondary}>Explore jobs</Link>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer style={{ borderTop: `1px solid ${C.line}`, background: C.ink, color: "#fff" }}>
        <div style={S.footInner}>
          <div style={{ flex: 1.4, minWidth: 220 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 9 }}><Brand h={22} /><span style={{ fontSize: 18, fontWeight: 700 }}>topezia</span></div>
            <div style={{ fontSize: 12, color: "#8B96B5", marginTop: 12, lineHeight: 1.6 }}>Infinite potential. Intelligent future.</div>
          </div>
          {FOOTER_COLS.map((col) => (
            <div key={col.head} style={{ flex: 1, minWidth: 140 }}>
              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 12 }}>{col.head}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 9, fontSize: 12 }}>
                {col.links.map((l) => <Link key={l.label} href={l.href} className="h-flink" style={{ color: "#8B96B5" }}>{l.label}</Link>)}
              </div>
            </div>
          ))}
        </div>
        <div style={{ borderTop: "1px solid rgba(255,255,255,.08)" }}><div style={{ maxWidth: 1180, margin: "0 auto", padding: "16px 24px", fontSize: 11, color: "#64748B" }}>© 2026 Topezia. All rights reserved.</div></div>
      </footer>
    </div>
  );
}

const HERO_FACES = [
  "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&q=80&fit=crop&crop=faces",
  "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&q=80&fit=crop&crop=faces",
  "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=100&q=80&fit=crop&crop=faces",
];
const FEATURES = [
  { icon: "gauge", title: "AI Career Score", desc: "One honest number for how your profile competes in your field — updated as you grow, benchmarked against real open roles." },
  { icon: "target", title: "Matches with reasons", desc: "Every role explains its match: which of your skills it values, what's missing, and how to close the gap before applying." },
  { icon: "shield", title: "Verified profile", desc: "Skill assessments and identity verification make your profile evidence, not claims — employers trust it, offers come faster." },
];
const STAND_CARDS = [
  { big: "9%", text: "of the skills your field asks for, you already have" },
  { big: "21", text: "roles at or above your level (Senior); 10 below" },
  { big: "23%", text: "want Go-To-Market Strategy, which you don't list" },
];
const ROADMAP = [
  { n: 1, title: "The AI reads your real experience", desc: "It parses your roles, projects, and outcomes — not just keywords — to understand what you can actually do." },
  { n: 2, title: "Benchmarks you against the live market", desc: "Your skills are compared to every open role at your level, weekly — so your standing reflects today's market, not last year's." },
  { n: 3, title: "Builds your personal roadmap", desc: "It picks the fewest, highest-impact steps — a certification, an assessment, a project — that unlock the next tier of roles." },
  { n: 4, title: "Matches you when you're ready", desc: "As you complete each step your match scores rise, and the AI surfaces the roles you can now win." },
];
const ROADMAP_STEPS = [
  { title: "Kubernetes certification", meta: "Completed · match +18%", done: true },
  { title: "System design assessment", meta: "Verified · top 8% score", done: true },
  { title: "Lead a cross-team project", meta: "In progress · unlocks 14 Staff roles", done: false },
];
const BIG_STATS = [
  { value: "1.4M", label: "live roles analyzed by the AI every week" },
  { value: "97%", label: "match-prediction accuracy on completed hires" },
  { value: "3×", label: "more interviews for members who follow their roadmap" },
  { value: "38 days", label: "average time from roadmap to accepted offer" },
];
const AUDIENCES = [
  { tag: "For professionals", title: "Apply only where you can win", desc: "Every role shows an honest AI match with the reasons behind it — so you spend effort on the interviews that go somewhere.", cta: "Browse matched roles", href: "/onboard", img: "https://images.unsplash.com/photo-1600880292203-757bb62b4baf?w=1000&q=80" },
  { tag: "For employers", title: "Shortlists, not stacks of CVs", desc: "Post a role and receive candidates ranked by verified skills and real fit — with assessment-backed profiles you can trust.", cta: "Start hiring", href: "/waitlist", img: "https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=1000&q=80" },
];
const PRINCIPLES = [
  { icon: "gauge", label: "Honest scoring", text: "Every match shows its real score — including the low ones — with the exact skills it values and the gaps it doesn't. Numbers are never inflated to upsell you." },
  { icon: "target", label: "Counted, not invented", text: "Your roadmap steps come from real open postings in your field — each one counted from the market, so \"the skill that unlocks 14 roles\" is a fact, not a guess." },
  { icon: "shield", label: "Straight to the source", text: "We send you to the original posting on the company's own site. No application trapping, no middleman between you and the employer." },
];
const FOOTER_COLS = [
  { head: "Product", links: [{ label: "Find jobs", href: "/jobs" }, { label: "AI Career Score", href: "/onboard" }, { label: "Skill assessments", href: "/onboard" }, { label: "Resume builder", href: "/onboard" }] },
  { head: "Employers", links: [{ label: "Post a role", href: "/waitlist" }, { label: "Search talent", href: "/waitlist" }, { label: "Pricing", href: "/waitlist" }] },
  { head: "Company", links: [{ label: "About", href: "/" }, { label: "Contact", href: "/waitlist" }, { label: "Privacy", href: "/settings" }] },
];

const HOVER_CSS = `
.h-link:hover{color:${C.c1}!important}
.h-flink:hover{color:#fff!important}
.h-bright:hover{filter:brightness(1.1)}
.h-card:hover{border-color:#A5B4FC!important;box-shadow:0 12px 32px rgba(99,102,241,.1)}
.h-upload:hover{border-color:${C.c1}!important;box-shadow:0 12px 30px rgba(99,102,241,.18)!important;transform:translateY(-1px)}
@media (max-width:820px){ .tz-h1{font-size:36px!important} }
`;

const S: Record<string, CSSProperties> = {
  header: { background: "rgba(255,255,255,.92)", backdropFilter: "blur(10px)", borderBottom: `1px solid ${C.line}`, position: "sticky", top: 0, zIndex: 20 },
  headerInner: { maxWidth: 1180, margin: "0 auto", padding: "14px 24px", display: "flex", alignItems: "center", gap: 26, flexWrap: "wrap" },
  hnav: { display: "flex", gap: 22, fontSize: 13, fontWeight: 500, color: C.slate, flexWrap: "wrap" },
  hlink: { color: C.slate, textDecoration: "none" },
  joinBtn: { background: GRAD, color: "#fff", borderRadius: 10, padding: "10px 20px", fontSize: 13, fontWeight: 600, textDecoration: "none", boxShadow: "0 5px 14px rgba(99,102,241,.3)" },
  heroInner: { maxWidth: 1180, margin: "0 auto", padding: "64px 24px 72px", display: "flex", gap: 56, alignItems: "center", flexWrap: "wrap", position: "relative" },
  badge: { display: "inline-flex", alignItems: "center", gap: 8, background: "#EEF2FF", border: "1px solid #C7D2FE", color: "#4F46E5", fontSize: 11.5, fontWeight: 600, borderRadius: 999, padding: "6px 14px", marginBottom: 22 },
  h1: { margin: 0, fontSize: 46, fontWeight: 800, letterSpacing: "-1.6px", lineHeight: 1.12 },
  heroSub: { margin: "18px 0 0", fontSize: 15.5, lineHeight: 1.65, color: C.mut, maxWidth: 480 },
  upload: { display: "flex", alignItems: "center", gap: 14, marginTop: 28, maxWidth: 520, border: `1px solid ${C.line}`, background: "#fff", borderRadius: 14, padding: "14px 18px", textDecoration: "none", boxShadow: "0 8px 24px rgba(15,23,42,.08)", transition: "border-color .2s, box-shadow .2s, transform .1s" },
  floatCardL: { position: "absolute", left: -24, bottom: 34, background: "#fff", border: `1px solid ${C.line}`, borderRadius: 14, padding: "13px 16px", boxShadow: "0 14px 34px rgba(15,23,42,.14)", display: "flex", alignItems: "center", gap: 12 },
  floatCardR: { position: "absolute", right: -14, top: 30, background: "#fff", border: `1px solid ${C.line}`, borderRadius: 14, padding: "12px 15px", boxShadow: "0 14px 34px rgba(15,23,42,.14)", display: "flex", alignItems: "center", gap: 10 },
  trustInner: { maxWidth: 1180, margin: "0 auto", padding: "20px 24px", display: "flex", alignItems: "center", gap: 28, flexWrap: "wrap", justifyContent: "center" },
  h2: { margin: 0, fontSize: 31, fontWeight: 800, letterSpacing: "-0.9px" },
  featureCard: { border: `1px solid ${C.line}`, borderRadius: 18, padding: "28px 26px", transition: "border-color .2s, box-shadow .2s" },
  band: { background: C.ink, borderRadius: 24, padding: 52, position: "relative", overflow: "hidden", color: "#fff", display: "flex", gap: 48, alignItems: "center", flexWrap: "wrap" },
  eyebrowLight: { fontSize: 11, fontWeight: 700, letterSpacing: ".8px", color: "#A5B4FC", textTransform: "uppercase", marginBottom: 14 },
  bandBtn: { display: "inline-flex", alignItems: "center", gap: 8, marginTop: 24, background: GRAD, borderRadius: 11, padding: "12px 22px", fontSize: 13, fontWeight: 600, color: "#fff", textDecoration: "none", boxShadow: "0 8px 22px rgba(99,102,241,.4)" },
  standCard: { background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.11)", borderRadius: 14, padding: "16px 20px", display: "flex", alignItems: "center", gap: 16 },
  ctaPrimary: { background: GRAD, color: "#fff", borderRadius: 12, padding: "13px 28px", fontSize: 14, fontWeight: 600, textDecoration: "none", boxShadow: "0 8px 22px rgba(99,102,241,.35)" },
  ctaSecondary: { border: `1px solid ${C.line}`, borderRadius: 12, padding: "13px 28px", fontSize: 14, fontWeight: 600, color: C.slate, textDecoration: "none" },
  footInner: { maxWidth: 1180, margin: "0 auto", padding: "44px 24px", display: "flex", gap: 40, flexWrap: "wrap", alignItems: "flex-start" },
};
