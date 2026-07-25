"use client";

/**
 * The recommender's form. Three states: write, already-answered, dead link.
 *
 * Deliberately plain and short. Whoever lands here is doing someone a favour,
 * probably on a phone, with no account and no reason to be patient — so it is
 * one screen, and it says up front what happens to what they write.
 */
import { useEffect, useState, type CSSProperties } from "react";
import { C, GRAD, FONT, BrandMark } from "@/app/_components/ui";
import { ENDORSEMENT_LIMITS, type RequestContext } from "@/lib/endorsements/doc";

export default function RespondClient({ token }: { token: string }) {
  const [ctx, setCtx] = useState<RequestContext | null>(null);
  const [dead, setDead] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [text, setText] = useState("");
  const [rating, setRating] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    fetch(`/api/r/${encodeURIComponent(token)}`)
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error || "This link isn't valid.");
        setCtx(d as RequestContext);
      })
      .catch((e) => setDead(e instanceof Error ? e.message : "This link isn't valid."));
  }, [token]);

  async function submit() {
    setBusy(true); setError(null);
    try {
      const res = await fetch(`/api/r/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ authorName: name, authorRole: role, text, rating }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "Couldn't send that — try again.");
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't send that — try again.");
    } finally {
      setBusy(false);
    }
  }

  const shell = (children: React.ReactNode) => (
    <div style={S.page}>
      <div style={S.card}>
        <div style={S.bar} />
        <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 22 }}>
          <BrandMark size={22} />
          <span style={{ fontSize: 18, fontWeight: 700, letterSpacing: "-0.4px" }}>topezia</span>
        </div>
        {children}
      </div>
    </div>
  );

  if (dead) return shell(<><h1 style={S.h1}>This link isn&apos;t valid</h1><p style={S.sub}>{dead} If someone asked you for a recommendation, ask them to send a fresh link.</p></>);
  if (!ctx) return shell(<p style={S.sub}>Loading…</p>);

  if (done) {
    return shell(
      <>
        <h1 style={S.h1}>Sent — thank you</h1>
        <p style={S.sub}>
          {ctx.memberName} will see this on their profile. They can choose whether to display it, but they can&apos;t edit a word of what you wrote.
        </p>
      </>
    );
  }

  if (ctx.alreadySubmitted) return shell(<><h1 style={S.h1}>Already answered</h1><p style={S.sub}>Someone has already used this link. Thanks all the same.</p></>);
  if (ctx.expired) return shell(<><h1 style={S.h1}>This link has expired</h1><p style={S.sub}>Links stay open for {60} days. Ask {ctx.memberName} to send a new one.</p></>);

  const isReview = ctx.kind === "REVIEW";
  const enough = name.trim().length > 0 && text.trim().length >= 40;

  return shell(
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18 }}>
        {ctx.memberPhotoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={ctx.memberPhotoUrl} alt="" style={{ width: 52, height: 52, borderRadius: "50%", objectFit: "cover", objectPosition: "center top", flex: "none" }} />
        ) : (
          <div style={{ width: 52, height: 52, borderRadius: "50%", background: GRAD, flex: "none" }} />
        )}
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 700 }}>{ctx.memberName}</div>
          {ctx.memberHeadline && <div style={{ fontSize: 13, color: C.mut }}>{ctx.memberHeadline}</div>}
        </div>
      </div>

      <h1 style={S.h1}>{isReview ? "Review this work" : "Write a recommendation"}</h1>
      <p style={S.sub}>
        {ctx.memberName} asked you to {isReview ? "review a piece of their work" : "say a few words about working with them"}. It goes straight onto their Topezia profile in your words — they can hide it, but they can never edit it.
      </p>

      {ctx.requestNote && (
        <div style={S.note}>&ldquo;{ctx.requestNote}&rdquo; <span style={{ color: C.mut, fontStyle: "normal" }}>— {ctx.memberName}</span></div>
      )}

      {isReview && ctx.work && (
        <a href={ctx.work.url} target="_blank" rel="noopener noreferrer" style={S.work}>
          {ctx.work.thumb && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={ctx.work.thumb} alt="" style={{ width: 58, height: 42, objectFit: "cover", borderRadius: 7, flex: "none" }} />
          )}
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: "block", fontSize: 13.5, fontWeight: 700 }}>{ctx.work.title}</span>
            <span style={{ display: "block", fontSize: 11.5, color: C.mut, marginTop: 2 }}>Open the project →</span>
          </span>
        </a>
      )}

      <div style={S.label}>Your name</div>
      <input style={S.input} value={name} onChange={(e) => setName(e.target.value.slice(0, ENDORSEMENT_LIMITS.authorName))} placeholder="e.g. Sara Khan" />

      <div style={S.label}>Your role {isReview ? "or company" : ""} <span style={{ color: C.mut, fontWeight: 500 }}>(optional)</span></div>
      <input style={S.input} value={role} onChange={(e) => setRole(e.target.value.slice(0, ENDORSEMENT_LIMITS.authorRole))} placeholder={isReview ? "e.g. Marketing Director, Acme" : "e.g. Engineering Manager at Acme"} />

      {isReview && (
        <>
          <div style={S.label}>How was it? <span style={{ color: C.mut, fontWeight: 500 }}>(optional)</span></div>
          <div style={{ display: "flex", gap: 6, marginBottom: 4 }}>
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} type="button" onClick={() => setRating(rating === n ? null : n)} aria-label={`${n} out of 5`}
                style={{ width: 38, height: 38, borderRadius: 10, cursor: "pointer", fontFamily: "inherit", fontSize: 16, fontWeight: 700,
                  border: `1px solid ${rating && n <= rating ? "#C7D2FE" : C.line}`,
                  background: rating && n <= rating ? "#EEF2FF" : "#fff",
                  color: rating && n <= rating ? C.c1 : C.mut }}>
                ★
              </button>
            ))}
          </div>
          <p style={{ fontSize: 11, color: C.mut, margin: "0 0 4px", lineHeight: 1.5 }}>
            Shown with your review. Topezia doesn&apos;t average these into a score — we didn&apos;t handle the work, so we&apos;d be measuring nothing.
          </p>
        </>
      )}

      <div style={S.label}>{isReview ? "Your review" : "Your recommendation"}</div>
      <textarea
        style={S.textarea}
        rows={6}
        value={text}
        onChange={(e) => setText(e.target.value.slice(0, ENDORSEMENT_LIMITS.text))}
        placeholder={isReview
          ? "What did they deliver, how did it go, and would you work with them again?"
          : "What were they like to work with? Specifics help far more than praise."}
      />
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: C.mut, marginTop: 4 }}>
        <span>{text.trim().length < 40 ? "A couple of sentences, at least." : "Looks good."}</span>
        <span>{text.length}/{ENDORSEMENT_LIMITS.text}</span>
      </div>

      {error && <p style={{ color: "#DC2626", fontSize: 13, fontWeight: 600, margin: "14px 0 0" }}>{error}</p>}

      <button type="button" onClick={submit} disabled={!enough || busy}
        style={{ ...S.submit, opacity: enough && !busy ? 1 : 0.5, cursor: enough && !busy ? "pointer" : "default" }}>
        {busy ? "Sending…" : isReview ? "Send review" : "Send recommendation"}
      </button>

      <p style={{ fontSize: 11, color: C.mut, lineHeight: 1.6, margin: "14px 0 0" }}>
        Your name and words appear publicly on {ctx.memberName}&apos;s profile. Topezia doesn&apos;t verify identities — the profile says these were written by people the member invited, and nothing more than that.
      </p>
    </>
  );
}

const S: Record<string, CSSProperties> = {
  page: { minHeight: "100vh", background: C.bg, fontFamily: FONT, color: C.ink, display: "flex", justifyContent: "center", padding: "36px 18px 60px" },
  card: { background: "#fff", border: `1px solid ${C.line}`, borderRadius: 18, padding: "26px 26px 28px", maxWidth: 560, width: "100%", position: "relative", overflow: "hidden", boxShadow: "0 18px 44px rgba(15,23,42,.09)" },
  bar: { position: "absolute", left: 0, right: 0, top: 0, height: 5, background: GRAD },
  h1: { margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: "-0.5px" },
  sub: { fontSize: 13.5, color: C.slate, lineHeight: 1.65, margin: "8px 0 0" },
  note: { fontSize: 13, color: C.slate, fontStyle: "italic", background: "#F8FAFC", border: `1px solid ${C.line}`, borderRadius: 11, padding: "11px 14px", margin: "16px 0 0", lineHeight: 1.6 },
  work: { display: "flex", alignItems: "center", gap: 11, border: `1px solid ${C.line}`, borderRadius: 12, padding: "10px 12px", margin: "16px 0 0", textDecoration: "none", color: "inherit" },
  label: { fontSize: 12.5, fontWeight: 700, color: C.ink, margin: "18px 0 6px" },
  input: { width: "100%", padding: "11px 13px", borderRadius: 10, border: `1px solid ${C.line}`, fontSize: 14, fontFamily: "inherit", boxSizing: "border-box" },
  textarea: { width: "100%", padding: "12px 14px", borderRadius: 12, border: `1px solid ${C.line}`, fontSize: 14, fontFamily: "inherit", boxSizing: "border-box", resize: "vertical", lineHeight: 1.65 },
  submit: { width: "100%", marginTop: 18, border: "none", background: GRAD, color: "#fff", borderRadius: 12, padding: "13px 20px", fontSize: 14.5, fontWeight: 700, fontFamily: "inherit" },
};
