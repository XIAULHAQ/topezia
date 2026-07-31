"use client";

/**
 * The team roster and the invite form.
 *
 * Two things this page says plainly, because both are surprising if you find
 * them out later:
 *
 *  - A team member is LISTED. They can't edit the company page, post jobs, or
 *    see applicants. Anyone reading "invite team members" reasonably assumes
 *    otherwise.
 *  - The invitee has to sign up with the address the invite went to. That's
 *    what makes being listed under a company mean something, and it's the
 *    single most common reason an invite doesn't work.
 *
 * The invite link is always shown after sending, whether or not the email went
 * out — see app/api/company/invites/route.ts for why delivery failure doesn't
 * fail the request.
 */
import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { EmployerSection, EmployerGate, ES } from "../_components/EmployerSection";

type Member = {
  id: string; name: string; title: string | null; profileRole: string | null; role: "OWNER" | "MEMBER";
  visible: boolean; email: string | null; joinedAt: string; isYou: boolean;
  publicSlug: string | null; hasProfile: boolean;
};
type Invite = { id: string; email: string; createdAt: string; expiresAt: string; expired: boolean };

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

export default function TeamClient() {
  const [members, setMembers] = useState<Member[] | null>(null);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [maxPending, setMaxPending] = useState(25);
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [gate, setGate] = useState<"auth" | "company" | null>(null);
  const [sending, setSending] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [lastLink, setLastLink] = useState<{ email: string; url: string; emailed: boolean } | null>(null);
  const [editing, setEditing] = useState<{ id: string; title: string } | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/company/team", { cache: "no-store" });
    if (res.status === 401) { setGate("auth"); setMembers([]); return; }
    if (res.status === 409) { setGate("company"); setMembers([]); return; }
    if (!res.ok) { setError("Couldn't load your team."); setMembers([]); return; }
    const d = await res.json();
    setMembers(d.members);
    setInvites(d.invites);
    setMaxPending(d.maxPendingInvites);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    setSending(true); setError(null); setLastLink(null);
    try {
      const res = await fetch("/api/company/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "Couldn't send that invitation.");
      setLastLink({ email, url: d.url, emailed: d.emailed });
      setEmail("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't send that invitation.");
    } finally {
      setSending(false);
    }
  }

  async function revoke(i: Invite) {
    setBusyId(i.id);
    try {
      const res = await fetch(`/api/company/invites?id=${encodeURIComponent(i.id)}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Couldn't revoke that.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't revoke that.");
    } finally {
      setBusyId(null);
    }
  }

  async function saveTitle() {
    if (!editing) return;
    setBusyId(editing.id);
    try {
      const res = await fetch(`/api/company/team/${editing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: editing.title }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Couldn't save that.");
      setEditing(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save that.");
    } finally {
      setBusyId(null);
    }
  }

  async function toggleVisible(m: Member) {
    setBusyId(m.id);
    try {
      const res = await fetch(`/api/company/team/${m.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visible: !m.visible }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Couldn't save that.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save that.");
    } finally {
      setBusyId(null);
    }
  }

  async function removeMember(m: Member) {
    if (!window.confirm(`Remove ${m.name} from your team? They stay on Topezia — this only takes them off your company page.`)) return;
    setBusyId(m.id);
    try {
      const res = await fetch(`/api/company/team/${m.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Couldn't remove them.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't remove them.");
    } finally {
      setBusyId(null);
    }
  }

  if (gate) return <EmployerGate title="Team" reason={gate} what="your team" />;

  const pending = invites.filter((i) => !i.expired);

  return (
    <EmployerSection
      title="Team"
      subtitle="Invite the people you work with. They join Topezia with their own account and appear on your company page."
    >
      {error && <div style={ES.error}>{error}</div>}

      <div style={{ ...ES.card, marginBottom: 22 }}>
        <h2 style={{ margin: "0 0 6px", fontSize: 16, fontWeight: 700 }}>Invite someone</h2>
        <p style={{ margin: "0 0 16px", fontSize: 12.8, color: "#64748B", lineHeight: 1.65 }}>
          They&apos;ll need to sign up with <b>this exact address</b> — that&apos;s how we know the invitation reached the
          right person rather than whoever it was forwarded to. Being listed is all it does: team members can&apos;t edit
          your company page, post roles, or see applicants.
        </p>
        <form onSubmit={invite} style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <input style={{ ...ES.input, maxWidth: 340 }} type="email" required value={email}
            onChange={(e) => setEmail(e.target.value)} placeholder="colleague@yourcompany.com" />
          <button type="submit" style={{ ...ES.btn, opacity: sending ? 0.6 : 1 }} disabled={sending || pending.length >= maxPending}>
            {sending ? "Sending…" : "Send invitation"}
          </button>
        </form>
        {pending.length >= maxPending && (
          <p style={{ ...S.hint, color: "#B45309" }}>
            You have {maxPending} invitations outstanding — revoke some before sending more.
          </p>
        )}
      </div>

      {lastLink && (
        <div style={{ ...ES.notice, marginBottom: 22 }}>
          {lastLink.emailed
            ? <>Invitation sent to <b>{lastLink.email}</b>. If it doesn&apos;t arrive, send them this link directly:</>
            : <>We couldn&apos;t deliver the email just now, but the invitation is live. Send <b>{lastLink.email}</b> this link yourself:</>}
          <div style={S.linkBox}>{lastLink.url}</div>
        </div>
      )}

      <h2 style={S.h2}>On the team</h2>
      {!members && <p style={ES.empty}>Loading…</p>}
      <div style={{ display: "grid", gap: 12, marginBottom: 26 }}>
        {(members ?? []).map((m) => (
          <div key={m.id} style={{ ...ES.card, display: "flex", gap: 16, alignItems: "center", padding: 14, flexWrap: "wrap" }}>
            <div style={S.avatar}>{m.name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "?"}</div>
            <div style={{ flex: 1, minWidth: 180 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <b style={{ fontSize: 14 }}>{m.name}</b>
                {m.role === "OWNER" && <span style={S.ownerPill}>Owner</span>}
                {m.isYou && <span style={ES.pillDraft}>You</span>}
                {!m.visible && <span style={ES.pillDraft}>Hidden from the page</span>}
              </div>
              {editing?.id === m.id ? (
                <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                  <input style={{ ...ES.input, maxWidth: 240 }} value={editing.title} maxLength={120} autoFocus
                    placeholder="Creative Director"
                    onChange={(e) => setEditing({ ...editing, title: e.target.value })} />
                  <button type="button" style={ES.btnGhost} disabled={busyId === m.id} onClick={saveTitle}>Save</button>
                  <button type="button" style={ES.btnGhost} onClick={() => setEditing(null)}>Cancel</button>
                </div>
              ) : (
                <div style={{ fontSize: 12.5, color: "#64748B", marginTop: 4 }}>
                  {/* Mirrors the public page exactly: the title set here wins,
                      otherwise their own profile's role. Saying "No title yet"
                      while the page already shows "Marketing Manager" would
                      send someone hunting for a problem that isn't there. */}
                  {m.title || m.profileRole || <span style={{ color: "#CBD5E1" }}>No role yet</span>}
                  {!m.title && m.profileRole && <span style={{ color: "#94A3B8" }}> (from their profile)</span>}
                  {m.email && <> · {m.email}</>} · joined {fmtDate(m.joinedAt)}
                </div>
              )}
            </div>
            <div style={{ flex: "none", display: "flex", gap: 8, flexWrap: "wrap" }}>
              {m.publicSlug && <a style={ES.btnGhost} href={`/p/${m.publicSlug}`} target="_blank" rel="noreferrer">Profile</a>}
              {editing?.id !== m.id && (
                <button type="button" style={ES.btnGhost} onClick={() => setEditing({ id: m.id, title: m.title ?? "" })}>Title</button>
              )}
              <button type="button" style={ES.btnGhost} disabled={busyId === m.id} onClick={() => toggleVisible(m)}>
                {m.visible ? "Hide" : "Show"}
              </button>
              {m.role !== "OWNER" && (
                <button type="button" style={{ ...ES.btnDanger, opacity: busyId === m.id ? 0.6 : 1 }} disabled={busyId === m.id} onClick={() => removeMember(m)}>
                  Remove
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      <h2 style={S.h2}>Invitations</h2>
      {invites.length === 0 ? (
        <div style={ES.card}><p style={ES.empty}>Nothing outstanding.</p></div>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {invites.map((i) => (
            <div key={i.id} style={{ ...ES.card, display: "flex", gap: 14, alignItems: "center", padding: 13, flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 200 }}>
                <b style={{ fontSize: 13.5 }}>{i.email}</b>
                <div style={{ fontSize: 12, color: "#64748B", marginTop: 4 }}>
                  Sent {fmtDate(i.createdAt)} · {i.expired ? "expired" : `expires ${fmtDate(i.expiresAt)}`}
                </div>
              </div>
              <button type="button" style={{ ...ES.btnGhost, opacity: busyId === i.id ? 0.6 : 1 }} disabled={busyId === i.id} onClick={() => revoke(i)}>
                {i.expired ? "Clear" : "Revoke"}
              </button>
            </div>
          ))}
        </div>
      )}
    </EmployerSection>
  );
}

const S: Record<string, CSSProperties> = {
  h2: { fontSize: 15, fontWeight: 700, margin: "0 0 12px", color: "#0F172A" },
  hint: { margin: "10px 0 0", fontSize: 12, lineHeight: 1.5 },
  avatar: { flex: "none", width: 40, height: 40, borderRadius: "50%", background: "linear-gradient(135deg,#8B5CF6,#3B82F6)", color: "#fff", display: "grid", placeItems: "center", fontSize: 13, fontWeight: 800 },
  ownerPill: { fontSize: 11, fontWeight: 700, padding: "3px 9px", borderRadius: 999, background: "#EEF2FF", color: "#4F46E5", border: "1px solid #C7D2FE" },
  linkBox: { marginTop: 9, background: "#fff", border: "1px solid #BAE6FD", borderRadius: 8, padding: "8px 10px", fontSize: 12, wordBreak: "break-all", fontFamily: "ui-monospace, monospace", color: "#0F172A" },
};
