"use client";

/**
 * The recommender's page. Four steps, in this order for a reason:
 *
 *   write → sign in → submitted → (optional) explore
 *
 * Writing comes FIRST and needs no account. Someone doing you a favour will
 * not create an account to find out what they are being asked; they will
 * close the tab. By the time we ask, they have written something and the ask
 * is small and obviously necessary — an unsigned name means nothing on a
 * public profile.
 *
 * Sign-in happens IN PLACE with the Supabase browser client. Redirecting to
 * /login and back would drop the draft on the floor, and the draft is the
 * whole point. Nothing here ever navigates away.
 *
 * The review is submitted the moment auth succeeds, so the favour is banked
 * before we ask them for anything else. Everything after that is optional and
 * can be abandoned without losing the endorsement.
 */
import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { C, GRAD, FONT, BrandMark, Icon } from "@/app/_components/ui";
import { createClient } from "@/lib/supabase/client";
import { ENDORSEMENT_LIMITS, type RequestContext } from "@/lib/endorsements/doc";

type Step = "write" | "auth" | "done";
type Listing = {
  id: string; title: string; company: string; kind: string; place: string | null;
  salaryMin: number | null; salaryMax: number | null; salaryCurrency: string | null; salaryPeriod: string | null;
};

const SENIORITIES = ["INTERN", "JUNIOR", "MID", "SENIOR", "LEAD", "EXEC"];
const senLabel = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();

export default function RespondClient({ token }: { token: string }) {
  const [ctx, setCtx] = useState<RequestContext | null>(null);
  const [dead, setDead] = useState<string | null>(null);
  const [step, setStep] = useState<Step>("write");

  // The endorsement itself
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [text, setText] = useState("");
  const [rating, setRating] = useState<number | null>(null);

  // Auth
  const [mode, setMode] = useState<"signup" | "signin">("signup");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Post-submit: the tiny profile, then what's open in their field
  const [roleGroups, setRoleGroups] = useState<{ field: string; roles: string[] }[]>([]);
  const [myRole, setMyRole] = useState("");
  const [mySen, setMySen] = useState("MID");
  const [mySkills, setMySkills] = useState<string[]>([]);
  const [skillInput, setSkillInput] = useState("");
  const [listings, setListings] = useState<{ roleName: string | null; jobs: Listing[]; projects: Listing[] } | null>(null);
  const [profileSaved, setProfileSaved] = useState(false);

  useEffect(() => {
    fetch(`/api/r/${encodeURIComponent(token)}`)
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error || "This link isn't valid.");
        setCtx(d as RequestContext);
      })
      .catch((e) => setDead(e instanceof Error ? e.message : "This link isn't valid."));
  }, [token]);

  /** Send the endorsement. Called once auth is known-good. */
  const send = useCallback(async () => {
    const res = await fetch(`/api/r/${encodeURIComponent(token)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ authorName: name, authorRole: role, text, rating }),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(d.error || "Couldn't send that — try again.");
    setStep("done");
    fetch("/api/roles").then((r) => (r.ok ? r.json() : null)).then((d2) => setRoleGroups(d2?.roleGroups ?? [])).catch(() => {});
  }, [token, name, role, text, rating]);

  /** Already signed in? Then the "sign in" step is just a submit. */
  async function continueFromWrite() {
    setBusy(true); setError(null);
    try {
      const { data } = await createClient().auth.getSession();
      if (data.session) { await send(); return; }
      setStep("auth");
    } catch {
      setStep("auth");
    } finally {
      setBusy(false);
    }
  }

  async function authAndSend() {
    setBusy(true); setError(null);
    try {
      const supabase = createClient();
      const addr = email.trim();
      const { data, error: authErr } = mode === "signup"
        ? await supabase.auth.signUp({ email: addr, password: pw })
        : await supabase.auth.signInWithPassword({ email: addr, password: pw });
      if (authErr) throw new Error(authErr.message);
      // With email confirmation switched on, signUp returns no session. Say so
      // plainly rather than silently failing to post the endorsement.
      if (!data.session) {
        throw new Error("Check your email to confirm the account, then come back to this link and sign in.");
      }
      await send();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't sign you in.");
    } finally {
      setBusy(false);
    }
  }

  async function saveProfileAndExplore() {
    setBusy(true); setError(null);
    try {
      // The same questionnaire the no-resume signup path uses.
      const res = await fetch("/api/questionnaire", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "GENERAL",
          fullName: name || undefined,
          role: myRole,
          seniority: mySen,
          yearsExperience: 0,
          skills: mySkills,
        }),
      });
      if (res.ok) setProfileSaved(true);
      // The listing shows either way — a failed profile save shouldn't cost
      // them the thing they were promised.
      const l = await fetch(`/api/explore?role=${encodeURIComponent(myRole)}`).then((r) => (r.ok ? r.json() : null));
      setListings(l ?? { roleName: null, jobs: [], projects: [] });
    } catch {
      setListings({ roleName: null, jobs: [], projects: [] });
    } finally {
      setBusy(false);
    }
  }

  function addSkill() {
    const v = skillInput.trim();
    if (!v || mySkills.length >= 12) return;
    if (!mySkills.some((s) => s.toLowerCase() === v.toLowerCase())) setMySkills([...mySkills, v]);
    setSkillInput("");
  }

  const shell = (children: React.ReactNode, wide = false) => (
    <div style={S.page}>
      <div style={{ ...S.card, maxWidth: wide ? 760 : 560 }}>
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
  // Per-viewer now that links are shared: this closes the form only for an
  // account that already wrote its response.
  if (ctx.alreadySubmitted && step !== "done") return shell(<><h1 style={S.h1}>Already answered</h1><p style={S.sub}>You&apos;ve already written yours for this link — thank you. Each person can answer once.</p></>);
  // Legacy single-use links only; standing links never expire.
  if (ctx.expired && step !== "done") return shell(<><h1 style={S.h1}>This link has expired</h1><p style={S.sub}>This was an older, single-use link. Ask {ctx.memberName} for a fresh one — links no longer expire.</p></>);

  const isReview = ctx.kind === "REVIEW";

  // ── Step 3/4: sent, then explore ──
  if (step === "done") {
    return shell(
      <>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
          <span style={{ width: 30, height: 30, borderRadius: "50%", background: "#E7F6EE", color: "#0F6E56", display: "grid", placeItems: "center", fontWeight: 800 }}>✓</span>
          <h1 style={{ ...S.h1, margin: 0 }}>Sent — thank you</h1>
        </div>
        <p style={S.sub}>
          {ctx.memberName} will see this on their profile. They can choose whether to display it, but they can&apos;t edit a word of what you wrote.
        </p>

        {!listings ? (
          <>
            <div style={S.divider} />
            <h2 style={S.h2}>While you&apos;re here</h2>
            <p style={{ ...S.sub, margin: "6px 0 0" }}>
              You have an account now. Tell us what you do and we&apos;ll show what&apos;s open in your field — two questions, no CV.
            </p>

            <div style={S.label}>What do you do?</div>
            <select style={{ ...S.input, cursor: "pointer" }} value={myRole} onChange={(e) => setMyRole(e.target.value)}>
              <option value="">Choose your role…</option>
              {roleGroups.map((g) => (
                <optgroup key={g.field} label={g.field}>
                  {g.roles.map((r) => <option key={r} value={r}>{r}</option>)}
                </optgroup>
              ))}
            </select>

            <div style={S.label}>Level</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {SENIORITIES.map((s) => (
                <button key={s} type="button" onClick={() => setMySen(s)}
                  style={{ ...S.pill, background: mySen === s ? GRAD : "#fff", color: mySen === s ? "#fff" : C.slate, border: `1px solid ${mySen === s ? "transparent" : C.line}` }}>
                  {senLabel(s)}
                </button>
              ))}
            </div>

            <div style={S.label}>A few things you&apos;re good at</div>
            {mySkills.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
                {mySkills.map((s) => (
                  <span key={s} style={S.chip}>{s}
                    <button type="button" aria-label={`Remove ${s}`} onClick={() => setMySkills(mySkills.filter((x) => x !== s))} style={S.chipX}>×</button>
                  </span>
                ))}
              </div>
            )}
            <input style={S.input} value={skillInput} placeholder="Type a skill, then Enter"
              onChange={(e) => setSkillInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addSkill(); } }}
              onBlur={addSkill} />

            <button type="button" onClick={saveProfileAndExplore} disabled={busy || !myRole || mySkills.length === 0}
              style={{ ...S.submit, opacity: busy || !myRole || mySkills.length === 0 ? 0.5 : 1 }}>
              {busy ? "Finding work…" : "Show me what's open"}
            </button>
            <p style={{ fontSize: 11, color: C.mut, margin: "10px 0 0", lineHeight: 1.55 }}>
              Skip this if you like — your {isReview ? "review" : "recommendation"} is already sent.
            </p>
          </>
        ) : (
          <>
            <div style={S.divider} />
            <h2 style={S.h2}>{listings.roleName ? `Open ${listings.roleName} work` : "What's open right now"}</h2>
            <p style={{ ...S.sub, margin: "6px 0 14px" }}>
              Live postings in your field{profileSaved ? " — your profile is saved, so your feed is ready too" : ""}.
            </p>

            {listings.jobs.length === 0 && listings.projects.length === 0 && (
              <p style={S.sub}>Nothing live in that field this minute. <a href="/feed" style={S.link}>Browse the whole feed →</a></p>
            )}

            {listings.jobs.length > 0 && (
              <>
                <div style={S.sectionLabel}>Jobs</div>
                <div style={{ display: "grid", gap: 8 }}>{listings.jobs.map((j) => <Row key={j.id} l={j} />)}</div>
              </>
            )}
            {listings.projects.length > 0 && (
              <>
                <div style={{ ...S.sectionLabel, marginTop: 16 }}>Freelance projects</div>
                <div style={{ display: "grid", gap: 8 }}>{listings.projects.map((p) => <Row key={p.id} l={p} />)}</div>
              </>
            )}

            <a href="/feed" style={{ ...S.submit, display: "block", textAlign: "center", textDecoration: "none", boxSizing: "border-box" }}>
              See everything matched to you →
            </a>
          </>
        )}
      </>,
      !!listings
    );
  }

  // ── Step 2: sign in ──
  if (step === "auth") {
    return shell(
      <>
        <h1 style={S.h1}>One step left</h1>
        <p style={S.sub}>
          Your {isReview ? "review" : "recommendation"} appears publicly under your name, so we ask you to sign in — an unsigned name on a stranger&apos;s profile isn&apos;t worth much to anyone reading it. It takes a moment and your words are already saved here.
        </p>

        <div style={{ display: "flex", gap: 6, margin: "18px 0 4px" }}>
          {(["signup", "signin"] as const).map((m) => (
            <button key={m} type="button" onClick={() => setMode(m)}
              style={{ ...S.pill, background: mode === m ? GRAD : "#fff", color: mode === m ? "#fff" : C.slate, border: `1px solid ${mode === m ? "transparent" : C.line}` }}>
              {m === "signup" ? "I'm new here" : "I have an account"}
            </button>
          ))}
        </div>

        <div style={S.label}>Email</div>
        <input style={S.input} type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" />
        <div style={S.label}>Password</div>
        <input style={S.input} type="password" autoComplete={mode === "signup" ? "new-password" : "current-password"} value={pw} onChange={(e) => setPw(e.target.value)} placeholder={mode === "signup" ? "At least 8 characters" : "Your password"} />

        {error && <p style={S.err}>{error}</p>}

        <button type="button" onClick={authAndSend} disabled={busy || !email.trim() || pw.length < 8}
          style={{ ...S.submit, opacity: busy || !email.trim() || pw.length < 8 ? 0.5 : 1 }}>
          {busy ? "Sending…" : mode === "signup" ? "Create account & send" : "Sign in & send"}
        </button>
        <button type="button" onClick={() => { setStep("write"); setError(null); }} style={S.back}>← Back to what you wrote</button>
      </>
    );
  }

  // ── Step 1: write ──
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
        {ctx.memberName} asked you to {isReview ? "review a piece of their work" : "say a few words about working with them"}. It goes onto their Topezia profile in your words — they can hide it, but they can never edit it.
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

      {error && <p style={S.err}>{error}</p>}

      <button type="button" onClick={continueFromWrite} disabled={!enough || busy}
        style={{ ...S.submit, opacity: enough && !busy ? 1 : 0.5, cursor: enough && !busy ? "pointer" : "default" }}>
        {busy ? "One moment…" : "Continue"}
      </button>

      <p style={{ fontSize: 11, color: C.mut, lineHeight: 1.6, margin: "14px 0 0" }}>
        You&apos;ll sign in on the next step — your name appears publicly on {ctx.memberName}&apos;s profile, so it should be yours. Nothing is posted until then.
      </p>
    </>
  );
}

function Row({ l }: { l: Listing }) {
  const pay = l.salaryMin || l.salaryMax
    ? `${l.salaryCurrency === "USD" ? "$" : `${l.salaryCurrency ?? ""} `}${[l.salaryMin, l.salaryMax].filter(Boolean).map((n) => (n! >= 1000 ? `${Math.round(n! / 1000)}k` : n)).join("–")}${l.salaryPeriod === "HOUR" ? "/hr" : ""}`
    : null;
  return (
    <a href={`/job/${l.id}`} style={S.row}>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 13.5, fontWeight: 700, color: C.ink }}>{l.title}</span>
        <span style={{ display: "block", fontSize: 11.5, color: C.mut, marginTop: 2 }}>
          {[l.company, l.place].filter(Boolean).join(" · ")}
        </span>
      </span>
      {pay && <span style={{ fontSize: 11.5, fontWeight: 700, color: C.c1, flex: "none" }}>{pay}</span>}
      <Icon name="arrowR" size={14} />
    </a>
  );
}

const S: Record<string, CSSProperties> = {
  page: { minHeight: "100vh", background: C.bg, fontFamily: FONT, color: C.ink, display: "flex", justifyContent: "center", padding: "36px 18px 60px" },
  card: { background: "#fff", border: `1px solid ${C.line}`, borderRadius: 18, padding: "26px 26px 28px", width: "100%", position: "relative", overflow: "hidden", boxShadow: "0 18px 44px rgba(15,23,42,.09)" },
  bar: { position: "absolute", left: 0, right: 0, top: 0, height: 5, background: GRAD },
  h1: { margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: "-0.5px" },
  h2: { margin: 0, fontSize: 17, fontWeight: 800, letterSpacing: "-0.3px" },
  sub: { fontSize: 13.5, color: C.slate, lineHeight: 1.65, margin: "8px 0 0" },
  divider: { height: 1, background: C.line, margin: "22px 0 18px" },
  note: { fontSize: 13, color: C.slate, fontStyle: "italic", background: "#F8FAFC", border: `1px solid ${C.line}`, borderRadius: 11, padding: "11px 14px", margin: "16px 0 0", lineHeight: 1.6 },
  work: { display: "flex", alignItems: "center", gap: 11, border: `1px solid ${C.line}`, borderRadius: 12, padding: "10px 12px", margin: "16px 0 0", textDecoration: "none", color: "inherit" },
  label: { fontSize: 12.5, fontWeight: 700, color: C.ink, margin: "18px 0 6px" },
  sectionLabel: { fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, color: C.mut, marginBottom: 8 },
  input: { width: "100%", padding: "11px 13px", borderRadius: 10, border: `1px solid ${C.line}`, fontSize: 14, fontFamily: "inherit", boxSizing: "border-box", background: "#fff" },
  textarea: { width: "100%", padding: "12px 14px", borderRadius: 12, border: `1px solid ${C.line}`, fontSize: 14, fontFamily: "inherit", boxSizing: "border-box", resize: "vertical", lineHeight: 1.65 },
  submit: { width: "100%", marginTop: 18, border: "none", background: GRAD, color: "#fff", borderRadius: 12, padding: "13px 20px", fontSize: 14.5, fontWeight: 700, fontFamily: "inherit", cursor: "pointer" },
  back: { width: "100%", marginTop: 10, border: "none", background: "none", color: C.mut, fontSize: 12.5, fontWeight: 600, fontFamily: "inherit", cursor: "pointer" },
  pill: { borderRadius: 999, padding: "7px 14px", fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" },
  chip: { display: "inline-flex", alignItems: "center", gap: 6, background: "#EEF2FF", color: "#4338CA", borderRadius: 999, padding: "5px 11px", fontSize: 12, fontWeight: 600 },
  chipX: { background: "none", border: "none", color: "inherit", cursor: "pointer", fontSize: 14, lineHeight: 1, padding: 0 },
  row: { display: "flex", alignItems: "center", gap: 10, border: `1px solid ${C.line}`, borderRadius: 12, padding: "11px 13px", textDecoration: "none", color: "inherit", background: "#fff" },
  err: { color: "#DC2626", fontSize: 13, fontWeight: 600, margin: "14px 0 0", lineHeight: 1.5 },
  link: { color: C.c1, fontWeight: 700, textDecoration: "none" },
};
