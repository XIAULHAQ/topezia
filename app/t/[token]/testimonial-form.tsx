"use client";

/**
 * The form itself.
 *
 * Two things it says out loud, because a stranger writing on a site they've
 * never used deserves both before they type:
 *  - where the words will appear, and under whose name;
 *  - that the company cannot edit them afterwards. That is the reason this is
 *    worth more than the company typing it themselves, so it should not be a
 *    detail someone discovers later.
 *
 * The star rating is optional and stays optional. A required rating turns a
 * favour into a survey, and an average nobody asked for is the first step
 * toward a score we would then have to defend.
 */
import { useState, type CSSProperties } from "react";
import Link from "next/link";

type Company = { name: string; slug: string; tagline: string | null; logoUrl: string | null };

export default function TestimonialForm({
  token,
  state,
  company,
}: {
  token: string;
  state: "missing" | "used" | "expired" | "open";
  company: Company | null;
}) {
  const [quote, setQuote] = useState("");
  const [authorName, setAuthorName] = useState("");
  const [authorRole, setAuthorRole] = useState("");
  const [authorCompany, setAuthorCompany] = useState("");
  const [rating, setRating] = useState(0);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/testimonial/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quote, authorName, authorRole, authorCompany, rating: rating || null }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "Couldn't send that — try again.");
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't send that — try again.");
    } finally {
      setBusy(false);
    }
  }

  if (state !== "open" || !company) {
    const copy =
      state === "used" ? "This request has already been answered, or it was withdrawn."
      : state === "expired" ? "This link has expired."
      : "We can't find this request.";
    return (
      <div style={S.card}>
        <h1 style={S.h1}>Link unavailable</h1>
        <p style={S.body}>{copy} If you still want to write something, ask them to send a new link.</p>
        <Link href="/" style={S.btnGhost}>Go to Topezia</Link>
      </div>
    );
  }

  if (done) {
    return (
      <div style={S.card}>
        <h1 style={S.h1}>Thank you — that&apos;s published</h1>
        <p style={S.body}>
          Your words are now on {company.name}&apos;s page, credited to you. They can hide it, but they can&apos;t
          change what you wrote.
        </p>
        <Link href={`/company/${company.slug}`} style={S.btn}>See {company.name}&apos;s page</Link>
      </div>
    );
  }

  return (
    <div style={S.card}>
      <div style={{ display: "flex", gap: 14, alignItems: "center", marginBottom: 18 }}>
        <span style={S.logo}>
          {company.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={company.logoUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
          ) : (
            company.name.slice(0, 2).toUpperCase()
          )}
        </span>
        <div style={{ minWidth: 0 }}>
          <h1 style={{ ...S.h1, margin: 0 }}>A few words about {company.name}?</h1>
          {company.tagline && <p style={{ margin: "5px 0 0", fontSize: 13, color: "#64748B" }}>{company.tagline}</p>}
        </div>
      </div>

      <p style={S.body}>
        They asked you to write a short testimonial. It appears on their public page on Topezia under the name you
        give below. <b>They can hide it, but they can&apos;t edit it</b> — the words stay yours.
      </p>

      {error && <div style={S.error}>{error}</div>}

      <form onSubmit={submit} style={{ display: "grid", gap: 15, marginTop: 20 }}>
        <div>
          <label style={S.label}>What was it like working with them?</label>
          <textarea style={{ ...S.input, minHeight: 130, resize: "vertical", lineHeight: 1.65 }}
            value={quote} onChange={(e) => setQuote(e.target.value)} required maxLength={1200}
            placeholder="They rebuilt our whole brand in six weeks and we sold out the first run." />
        </div>

        <div style={{ display: "grid", gap: 15, gridTemplateColumns: "1fr 1fr" }}>
          <div>
            <label style={S.label}>Your name</label>
            <input style={S.input} value={authorName} onChange={(e) => setAuthorName(e.target.value)} required maxLength={120} />
          </div>
          <div>
            <label style={S.label}>Your role <span style={S.opt}>optional</span></label>
            <input style={S.input} value={authorRole} onChange={(e) => setAuthorRole(e.target.value)} maxLength={120} placeholder="Founder" />
          </div>
        </div>

        <div>
          <label style={S.label}>Your company <span style={S.opt}>optional</span></label>
          <input style={S.input} value={authorCompany} onChange={(e) => setAuthorCompany(e.target.value)} maxLength={120} />
        </div>

        <div>
          <label style={S.label}>Rating <span style={S.opt}>optional</span></label>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} type="button" onClick={() => setRating(rating === n ? 0 : n)}
                style={{ ...S.star, color: n <= rating ? "#F59E0B" : "#CBD5E1" }} aria-label={`${n} stars`}>★</button>
            ))}
            {rating > 0 && <button type="button" style={S.clear} onClick={() => setRating(0)}>Clear</button>}
          </div>
        </div>

        <button type="submit" disabled={busy} style={{ ...S.btn, border: "none", cursor: "pointer", opacity: busy ? 0.6 : 1 }}>
          {busy ? "Sending…" : "Publish my testimonial"}
        </button>
        <p style={S.fine}>
          You don&apos;t need a Topezia account, and we won&apos;t add you to any list. Only what you type above is
          published.
        </p>
      </form>
    </div>
  );
}

const S: Record<string, CSSProperties> = {
  card: { background: "#fff", border: "1px solid #E2E8F0", borderRadius: 18, padding: "30px 32px" },
  logo: { flex: "none", width: 52, height: 52, borderRadius: 13, background: "#F8FAFC", border: "1px solid #E2E8F0", display: "grid", placeItems: "center", fontSize: 15, fontWeight: 800, color: "#64748B", overflow: "hidden", padding: 5 },
  h1: { fontSize: 22, fontWeight: 800, letterSpacing: "-0.5px", margin: "0 0 12px" },
  body: { fontSize: 13.8, lineHeight: 1.75, color: "#334155", margin: "0 0 6px" },
  label: { display: "block", fontSize: 11.5, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 6 },
  opt: { textTransform: "none", letterSpacing: 0, fontWeight: 500, color: "#94A3B8" },
  input: { width: "100%", border: "1px solid #E2E8F0", borderRadius: 10, padding: "10px 12px", fontSize: 13.5, fontFamily: "inherit", color: "#0F172A", background: "#fff", boxSizing: "border-box" },
  star: { background: "none", border: "none", fontSize: 26, cursor: "pointer", padding: 0, lineHeight: 1 },
  clear: { background: "#fff", color: "#334155", border: "1px solid #E2E8F0", borderRadius: 8, padding: "5px 10px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" },
  btn: { display: "inline-block", textAlign: "center", background: "linear-gradient(135deg,#8B5CF6,#3B82F6)", color: "#fff", borderRadius: 11, padding: "12px 20px", fontSize: 14, fontWeight: 700, textDecoration: "none", fontFamily: "inherit" },
  btnGhost: { display: "inline-block", background: "#fff", color: "#334155", border: "1px solid #E2E8F0", borderRadius: 11, padding: "10px 18px", fontSize: 13, fontWeight: 700, textDecoration: "none" },
  error: { background: "#FEF2F2", border: "1px solid #FECACA", color: "#B91C1C", borderRadius: 10, padding: "10px 14px", fontSize: 13, marginTop: 14, lineHeight: 1.6 },
  fine: { margin: 0, fontSize: 11.5, color: "#94A3B8", lineHeight: 1.6 },
};
