"use client";

/**
 * Invite people to apply for one posting.
 *
 * TWO WAYS IN, ONE SCREEN, because they are the same intent with different
 * reach: members Topezia can already vouch for, and addresses the employer
 * knows themselves.
 *
 * THE MEMBER LIST IS NOT A PEOPLE SEARCH. It is the existing sourcing query,
 * which only ever returns profiles that switched on open-to-work AND kept
 * their profile public (lib/employer/sourcing.ts). An employer cannot type a
 * name here and find someone who never asked to be found — and the invite
 * endpoint re-checks those gates rather than trusting what this screen posts.
 */
import { useCallback, useEffect, useState, type CSSProperties } from "react";
import Link from "next/link";
import { C, GRAD, Icon, initials } from "@/app/_components/ui";
import { parseAddressList } from "@/lib/network/addresses";
import { JOB_INVITE_LIMITS } from "@/lib/employer/job-invites";

type Sourced = {
  profileId: string; fullName: string | null; publicSlug: string | null;
  currentLocation: string | null; photoUrl: string | null; yearsExperience: number | null; match: number;
};
type Invite = {
  id: string; who: string | null; email: string | null; slug: string | null; photoUrl: string | null;
  isMember: boolean; status: string; sent: boolean; sendError: string | null; at: string;
};

export default function InviteClient({ jobId }: { jobId: string }) {
  const [jobTitle, setJobTitle] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<Sourced[] | null>(null);
  const [poolSize, setPoolSize] = useState<number | null>(null);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [remaining, setRemaining] = useState<number>(JOB_INVITE_LIMITS.PER_POSTING);

  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [text, setText] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [srcRes, invRes] = await Promise.all([
      fetch(`/api/employer/sourced?jobId=${encodeURIComponent(jobId)}&limit=25`, { cache: "no-store" }),
      fetch(`/api/postings/${jobId}/invite`, { cache: "no-store" }),
    ]);
    if (srcRes.ok) {
      const d = await srcRes.json();
      setCandidates(d.candidates ?? []);
      setPoolSize(d.poolSize ?? 0);
      setJobTitle((t) => t ?? d.jobTitle ?? null);
    } else setCandidates([]);

    if (invRes.ok) {
      const d = await invRes.json();
      setInvites(d.invites ?? []);
      setRemaining(d.remaining ?? JOB_INVITE_LIMITS.PER_POSTING);
      setJobTitle(d.jobTitle ?? null);
    } else if (invRes.status === 404) {
      setError("That posting isn't yours, or no longer exists.");
    }
  }, [jobId]);

  useEffect(() => { void load(); }, [load]);

  const { contacts, invalid } = parseAddressList(text);
  // Already invited from this screen — the server refuses duplicates anyway,
  // but silently dropping them here means the count the button shows is true.
  const invitedEmails = new Set(invites.map((i) => i.email).filter(Boolean) as string[]);
  const freshContacts = contacts.filter((c) => !invitedEmails.has(c.email));
  const total = picked.size + freshContacts.length;
  const tooMany = total > JOB_INVITE_LIMITS.PER_BATCH;

  const send = useCallback(async () => {
    if (busy || total === 0 || tooMany) return;
    setBusy(true); setError(null); setResult(null);
    try {
      const res = await fetch(`/api/postings/${jobId}/invite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileIds: [...picked], emails: freshContacts, note: note.trim() || undefined }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { setError(body.error ?? "That didn't send."); return; }

      const bits = [`${body.sent} invitation${body.sent === 1 ? "" : "s"} sent`];
      if (body.failed) bits.push(`${body.failed} couldn't be delivered`);
      if (body.skipped) bits.push(`${body.skipped} skipped`);
      setResult(bits.join(" · ") + ".");
      setPicked(new Set()); setText(""); setNote("");
      await load();
    } finally { setBusy(false); }
  }, [busy, total, tooMany, jobId, picked, freshContacts, note, load]);

  const toggle = (id: string) => {
    const next = new Set(picked);
    if (next.has(id)) next.delete(id); else next.add(id);
    setPicked(next);
  };

  const alreadyInvited = new Set(invites.filter((i) => i.isMember).map((i) => i.who));

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 18 }}>
      <div>
        <Link href="/employer/postings" style={S.back}>← Postings</Link>
        <h1 style={S.h1}>Invite people to apply</h1>
        <p style={S.sub}>{jobTitle ? <>For <strong>{jobTitle}</strong>.</> : " "} Each person gets one email in your name.</p>
      </div>

      {error ? <div style={S.error}>{error}</div> : null}
      {result ? <div style={S.ok}>{result}</div> : null}

      {/* ── Members who are open to work ─────────────────────────────────── */}
      <div style={S.card}>
        <h2 style={S.h2}>People on Topezia</h2>
        <p style={S.hint}>
          Members who match this posting and have said they&apos;re open to work. Only
          people who chose to be found appear here.
        </p>
        {candidates === null ? (
          <p style={S.empty}>Looking…</p>
        ) : candidates.length === 0 ? (
          <p style={S.empty}>
            {poolSize === 0
              ? "Nobody has switched on “open to work” yet, so there's no one to suggest."
              : "No close matches for this posting yet."}
          </p>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 1 }}>
            {candidates.map((c) => {
              const done = alreadyInvited.has(c.fullName ?? "");
              return (
                <label key={c.profileId} style={{ ...S.row, opacity: done ? 0.55 : 1, cursor: done ? "default" : "pointer" }}>
                  <input
                    type="checkbox" checked={picked.has(c.profileId)} disabled={done}
                    onChange={() => toggle(c.profileId)}
                    style={{ width: 17, height: 17, accentColor: C.c1, flex: "none" }}
                  />
                  {c.photoUrl
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={c.photoUrl} alt="" width={38} height={38} style={S.avatar} />
                    : <div style={{ ...S.avatar, ...S.avatarFallback }}>{initials(c.fullName)}</div>}
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={S.name}>{c.fullName ?? "A Topezia member"}</div>
                    <div style={S.meta}>
                      {done ? "Already invited" : [
                        c.currentLocation,
                        c.yearsExperience ? `${Math.round(c.yearsExperience)} yrs` : null,
                        `${c.match}% match`,
                      ].filter(Boolean).join(" · ")}
                    </div>
                  </div>
                  {c.publicSlug && (
                    <a href={`/p/${c.publicSlug}`} target="_blank" rel="noreferrer"
                       onClick={(e) => e.stopPropagation()} style={S.view}>
                      <Icon name="eye" size={14} />View
                    </a>
                  )}
                </label>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Anyone else, by email ────────────────────────────────────────── */}
      <div style={S.card}>
        <h2 style={S.h2}>Invite by email</h2>
        <p style={S.hint}>
          For people who aren&apos;t on Topezia. One address per line, or separated by
          commas — “Jane Doe &lt;jane@example.com&gt;” works too.
        </p>
        <textarea
          value={text} onChange={(e) => setText(e.target.value)} rows={3}
          placeholder={"jane@example.com\nSam Okafor <sam@example.com>"}
          style={S.textarea}
        />
        {invalid.length > 0 && (
          <p style={S.warn}>
            Not a valid address: {invalid.slice(0, 3).map((v) => `“${v}”`).join(", ")}
            {invalid.length > 3 ? ` and ${invalid.length - 3} more` : ""}. These will be skipped.
          </p>
        )}
      </div>

      {/* ── The note, and send ──────────────────────────────────────────── */}
      <div style={S.card}>
        <h2 style={S.h2}>Add a note <span style={S.optional}>optional</span></h2>
        <p style={S.hint}>A line about why you&apos;re reaching out. It appears in the email.</p>
        <textarea
          value={note} onChange={(e) => setNote(e.target.value.slice(0, JOB_INVITE_LIMITS.NOTE_MAX))} rows={2}
          placeholder="Saw your portfolio — this looks like your kind of work."
          style={S.textarea}
        />
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
          <span style={{ flex: 1, minWidth: 140, fontSize: 13, color: total ? C.ink : C.mut, fontWeight: total ? 650 : 500 }}>
            {total === 0 ? "Nobody selected yet"
              : `${picked.size} member${picked.size === 1 ? "" : "s"}, ${freshContacts.length} by email`}
          </span>
          <button
            style={{ ...S.primary, opacity: total === 0 || tooMany || busy ? 0.5 : 1 }}
            disabled={total === 0 || tooMany || busy}
            onClick={send}
          >
            {busy ? "Sending…" : total ? `Invite ${total}` : "Invite"}
          </button>
        </div>
        {tooMany && (
          <p style={S.warn}>That&apos;s {total} people — {JOB_INVITE_LIMITS.PER_BATCH} at a time is the limit.</p>
        )}
        <p style={S.meta}>{remaining} invitations left for this posting.</p>
      </div>

      {/* ── Who has been invited ─────────────────────────────────────────── */}
      {invites.length > 0 && (
        <div style={S.card}>
          <h2 style={S.h2}>Invited ({invites.length})</h2>
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 1 }}>
            {invites.map((i) => (
              <div key={i.id} style={S.row}>
                <Icon name={i.isMember ? "user" : "mail"} size={17} color={C.mut} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={S.name}>{i.who}</div>
                  <div style={S.meta}>
                    {/* Never "sent" for mail that never left. */}
                    {i.status === "APPLIED" ? "Applied"
                      : i.sendError ? "We couldn't deliver this one"
                      : i.status === "VIEWED" ? "Opened the posting"
                      : i.sent ? "Invitation sent"
                      : "Not sent"}
                  </div>
                </div>
                {i.slug && (
                  <a href={`/p/${i.slug}`} target="_blank" rel="noreferrer" style={S.view}>
                    <Icon name="eye" size={14} />View
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const S: Record<string, CSSProperties> = {
  back: { fontSize: 13, color: C.mut, textDecoration: "none", display: "inline-block", marginBottom: 10 },
  h1: { fontSize: 24, fontWeight: 800, color: C.ink, margin: "0 0 4px" },
  sub: { color: C.mut, fontSize: 14, margin: 0 },
  card: { background: "#fff", border: `1px solid ${C.line}`, borderRadius: 16, padding: 20 },
  h2: { fontSize: 15.5, fontWeight: 700, color: C.ink, margin: "0 0 3px" },
  hint: { fontSize: 12.5, color: C.mut, margin: "0 0 12px", lineHeight: 1.5 },
  empty: { fontSize: 13.5, color: C.mut, margin: "8px 0 0" },
  optional: { fontSize: 11, fontWeight: 600, color: C.mut, background: "#F1F5F9", borderRadius: 999, padding: "2px 8px", marginLeft: 6 },
  row: { display: "flex", alignItems: "center", gap: 12, padding: "10px 4px", borderTop: `1px solid ${C.line}` },
  avatar: { width: 38, height: 38, borderRadius: "50%", objectFit: "cover", flex: "none", border: `1px solid ${C.line}` },
  avatarFallback: { background: GRAD, color: "#fff", fontWeight: 700, fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center" },
  name: { fontWeight: 650, fontSize: 14, color: C.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  meta: { fontSize: 12.5, color: C.mut, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  view: { display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12.5, fontWeight: 600, color: C.slate, textDecoration: "none", border: `1px solid ${C.line}`, borderRadius: 8, padding: "5px 9px", flex: "none" },
  textarea: { width: "100%", boxSizing: "border-box", padding: "10px 12px", border: `1px solid ${C.line}`, borderRadius: 10, fontSize: 14, fontFamily: "inherit", color: C.ink, resize: "vertical", lineHeight: 1.5 },
  primary: { background: GRAD, color: "#fff", border: "1px solid transparent", borderRadius: 9, padding: "9px 16px", fontSize: 13.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", flex: "none" },
  error: { background: "#FEF2F2", border: "1px solid #FECACA", color: "#991B1B", borderRadius: 12, padding: "12px 16px", fontSize: 13.5 },
  ok: { background: "#F0FDF4", border: "1px solid #BBF7D0", color: "#15803D", borderRadius: 12, padding: "12px 16px", fontSize: 13.5 },
  warn: { fontSize: 12.5, color: "#B45309", margin: "8px 0 0" },
};
