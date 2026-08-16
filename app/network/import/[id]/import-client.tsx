"use client";

/**
 * The results of one contact import: who's already here, and who isn't.
 *
 * TWO LISTS, NOT ONE. Alignable's screen mixes members and strangers under a
 * single "Add All" button, so the member cannot tell which of those 46 rows
 * will be an in-product request and which will be an email to someone who has
 * never heard of the product. Those are different acts with different
 * consequences, so they get different sections and different buttons.
 *
 * NOTHING IS PRE-TICKED. Alignable pre-selects all 46 and offers "Add All (46)"
 * — the single decision that turns "I wanted to add three people" into 46
 * emails from someone who did not read the screen. Select-all is still one
 * click away for the member who genuinely wants it; it is just not the default.
 * See SELECT_ALL_DEFAULT in lib/network/doc.ts.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { C, GRAD, Icon } from "@/app/_components/ui";
import { NETWORK_LIMITS, SELECT_ALL_DEFAULT } from "@/lib/network/doc";
import { Avatar, ContactAvatar, type PersonCard } from "../../person";

type Degree = "self" | "connected" | "sent" | "received" | "none";
type Member = PersonCard & { profileId: string; degree: Degree };
type Invitable = { name: string | null; email: string };
type Data = { id: string; scanned: number; truncated: boolean; members: Member[]; invitable: Invitable[] };

const CARD: React.CSSProperties = { background: "#fff", border: `1px solid ${C.line}`, borderRadius: 16, padding: 20 };
const BTN: React.CSSProperties = {
  border: `1px solid ${C.line}`, background: "#fff", color: C.slate,
  borderRadius: 9, padding: "8px 14px", fontSize: 13.5, fontWeight: 600, cursor: "pointer",
};
const BTN_PRIMARY: React.CSSProperties = { ...BTN, background: GRAD, color: "#fff", border: "1px solid transparent" };

export default function ImportClient({ importId }: { importId: string }) {
  const router = useRouter();
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);

  const [pickedMembers, setPickedMembers] = useState<Set<string>>(new Set());
  const [pickedContacts, setPickedContacts] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  /** What the last batch did, shown while the member keeps working. */
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let stop = false;
    (async () => {
      const res = await fetch(`/api/network/import/${importId}`, { cache: "no-store" });
      const body = (await res.json().catch(() => ({}))) as Partial<Data> & { error?: string; expired?: boolean };
      if (stop) return;
      if (!res.ok) {
        setError(body.error ?? "We couldn't open that import.");
        setExpired(Boolean(body.expired));
        return;
      }
      const d = body as Data;
      setData(d);
      if (SELECT_ALL_DEFAULT) {
        setPickedMembers(new Set(d.members.filter((m) => m.degree === "none").map((m) => m.profileId)));
        setPickedContacts(new Set(d.invitable.map((c) => c.email)));
      }
    })();
    return () => { stop = true; };
  }, [importId]);

  const connectable = useMemo(() => (data?.members ?? []).filter((m) => m.degree === "none"), [data]);
  const invitable = data?.invitable ?? [];

  // Worked all the way through the list: nothing is left to hold, so destroy
  // the stored address book now rather than leaving it to the TTL.
  useEffect(() => {
    if (notice && data && data.members.length === 0 && data.invitable.length === 0 && !done) {
      void finishRef.current?.("That's everyone — your imported contacts have been deleted.");
    }
  }, [notice, data, done]);

  const toggle = <T,>(set: Set<T>, key: T, update: (next: Set<T>) => void) => {
    const next = new Set(set);
    if (next.has(key)) next.delete(key); else next.add(key);
    update(next);
  };

  /** Finish: destroy the stored address book rather than waiting for the TTL. */
  const finish = useCallback(async (message: string) => {
    await fetch(`/api/network/import/${importId}`, { method: "DELETE" }).catch(() => {});
    setDone(message);
  }, [importId]);

  // Held in a ref so the "worked through the whole list" effect can call it
  // without taking finish as a dependency and re-running on every render.
  const finishRef = useRef(finish);
  finishRef.current = finish;

  const sendAll = useCallback(async () => {
    if (busy) return;
    setBusy(true); setError(null);

    const memberIds = [...pickedMembers];
    const contacts = invitable.filter((c) => pickedContacts.has(c.email));
    let requested = 0, invited = 0;
    const problems: string[] = [];

    try {
      if (memberIds.length > 0) {
        const res = await fetch("/api/network/connect", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ profileIds: memberIds }),
        });
        const body = (await res.json().catch(() => ({}))) as { requested?: number; accepted?: number; error?: string };
        if (!res.ok) problems.push(body.error ?? "Some connection requests didn't go through.");
        else requested = (body.requested ?? 0) + (body.accepted ?? 0);
      }

      // Batched to the server's own per-request ceiling, so a member who ticks
      // 200 people gets 200 invitations rather than a 400.
      for (let i = 0; i < contacts.length; i += NETWORK_LIMITS.INVITES_PER_BATCH) {
        const slice = contacts.slice(i, i + NETWORK_LIMITS.INVITES_PER_BATCH);
        const res = await fetch("/api/network/invite", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contacts: slice, source: "contacts" }),
        });
        const body = (await res.json().catch(() => ({}))) as { sent?: number; error?: string; failed?: unknown[] };
        if (!res.ok) { problems.push(body.error ?? "Some invitations didn't send."); break; }
        invited += body.sent ?? 0;
        if (body.failed?.length) problems.push(`${body.failed.length} invitation(s) couldn't be delivered.`);
      }

      const parts: string[] = [];
      if (requested) parts.push(`${requested} connection request${requested === 1 ? "" : "s"} sent`);
      if (invited) parts.push(`${invited} invitation${invited === 1 ? "" : "s"} emailed`);
      if (problems.length) setError(problems.join(" "));

      // Sending a batch does NOT end the import. This used to call finish(),
      // which deleted the whole address book — so inviting one person threw
      // away the other 600, while the screen was promising "you can invite 50
      // at a time". Whoever was just handled drops off the list; everyone else
      // stays put for the next batch.
      const handledMembers = new Set(memberIds);
      const handledContacts = new Set(contacts.map((c) => c.email));
      setData((prev) => prev && {
        ...prev,
        members: prev.members.filter((m) => !handledMembers.has(m.profileId)),
        invitable: prev.invitable.filter((c) => !handledContacts.has(c.email)),
      });
      setPickedMembers(new Set());
      setPickedContacts(new Set());
      setNotice(parts.length ? parts.join(", ") + "." : "Nothing was sent.");
    } finally {
      setBusy(false);
    }
  }, [busy, pickedMembers, pickedContacts, invitable, finish]);

  const total = pickedMembers.size + pickedContacts.size;

  if (done) {
    return (
      <div style={{ ...CARD, textAlign: "center", padding: 40 }}>
        <Icon name="check" size={30} color="#16A34A" />
        <h1 style={{ fontSize: 20, color: C.ink, margin: "10px 0 6px" }}>{done}</h1>
        <p style={{ color: C.mut, fontSize: 14, margin: "0 0 18px" }}>
          Your imported contacts have been deleted from our side.
        </p>
        {error ? <p style={{ color: "#991B1B", fontSize: 13, margin: "0 0 16px" }}>{error}</p> : null}
        <button style={{ ...BTN_PRIMARY, padding: "10px 20px" }} onClick={() => router.push("/network")}>
          Back to your network
        </button>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div style={{ ...CARD, textAlign: "center", padding: 40 }}>
        <h1 style={{ fontSize: 19, color: C.ink, margin: "0 0 8px" }}>{error}</h1>
        <Link href="/network" style={{ ...BTN_PRIMARY, textDecoration: "none", display: "inline-block", marginTop: 10 }}>
          {expired ? "Start again" : "Back to your network"}
        </Link>
      </div>
    );
  }

  if (!data) return <p style={{ color: C.mut, fontSize: 14 }}>Reading your contacts…</p>;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 18 }}>
      <div>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: C.ink, margin: "0 0 4px" }}>
          {connectable.length > 0 ? "People you know are already here" : "Invite the people you know"}
        </h1>
        <p style={{ color: C.mut, fontSize: 14, margin: 0 }}>
          We looked at {data.scanned.toLocaleString()} contact{data.scanned === 1 ? "" : "s"}
          {data.truncated ? ` (the first ${NETWORK_LIMITS.MAX_CONTACTS.toLocaleString()} — there were more)` : ""}
          . Pick who you'd like to reach.
        </p>
      </div>

      {error ? (
        <div style={{ ...CARD, padding: "12px 16px", borderColor: "#FECACA", background: "#FEF2F2", color: "#991B1B", fontSize: 13.5 }}>
          {error}
        </div>
      ) : null}

      {notice ? (
        <div style={{ ...CARD, padding: "12px 16px", borderColor: "#BBF7D0", background: "#F0FDF4", color: "#15803D", fontSize: 13.5 }}>
          {notice} The rest are still here — keep going, or press Done when you've finished.
        </div>
      ) : null}

      {/* ── Already members ──────────────────────────────────────────────── */}
      {data.members.length > 0 ? (
        <Section
          title="Already on Topezia"
          hint="They'll get a connection request in the app. No email is sent."
          count={connectable.length}
          selected={pickedMembers.size}
          onAll={() => setPickedMembers(new Set(connectable.map((m) => m.profileId)))}
          onNone={() => setPickedMembers(new Set())}
        >
          {data.members.map((m) => {
            const already = m.degree !== "none";
            return (
              <Row
                key={m.profileId}
                checked={pickedMembers.has(m.profileId)}
                disabled={already}
                onToggle={() => toggle(pickedMembers, m.profileId, setPickedMembers)}
                avatar={<Avatar person={m} size={40} />}
                title={m.fullName?.trim() || m.contactName?.trim() || "Someone on Topezia"}
                subtitle={
                  already
                    ? m.degree === "connected" ? "Already connected"
                      : m.degree === "sent" ? "Request already sent"
                      : "They've asked to connect with you"
                    : [m.headline, m.location].filter(Boolean).join(" · ") || null
                }
                href={m.publicSlug ? `/p/${m.publicSlug}` : null}
              />
            );
          })}
        </Section>
      ) : null}

      {/* ── Not members yet ──────────────────────────────────────────────── */}
      {invitable.length > 0 ? (
        <Section
          title="Not on Topezia yet"
          hint={`Each person you tick gets one email from you, with your name on it. You can invite ${NETWORK_LIMITS.INVITES_PER_BATCH} at a time.`}
          count={invitable.length}
          selected={pickedContacts.size}
          onAll={() => setPickedContacts(new Set(invitable.map((c) => c.email)))}
          onNone={() => setPickedContacts(new Set())}
        >
          {invitable.map((c) => (
            <Row
              key={c.email}
              checked={pickedContacts.has(c.email)}
              onToggle={() => toggle(pickedContacts, c.email, setPickedContacts)}
              avatar={<ContactAvatar label={c.name ?? c.email} size={40} />}
              title={c.name?.trim() || c.email}
              subtitle={c.name?.trim() ? c.email : null}
              href={null}
            />
          ))}
        </Section>
      ) : null}

      {data.members.length === 0 && invitable.length === 0 ? (
        <div style={{ ...CARD, textAlign: "center", padding: 36 }}>
          <p style={{ color: C.mut, fontSize: 14.5, margin: "0 0 16px" }}>
            Nobody new in this address book — everyone in it is either already connected to you or already invited.
          </p>
          <Link href="/network" style={{ ...BTN_PRIMARY, textDecoration: "none", display: "inline-block" }}>Back to your network</Link>
        </div>
      ) : (
        // Sticky, because the lists are long and a button at the bottom of 300
        // rows is a button nobody finds.
        <div style={{
          position: "sticky", bottom: 0, background: "#fff", border: `1px solid ${C.line}`,
          borderRadius: 14, padding: "13px 16px", display: "flex", alignItems: "center",
          gap: 12, flexWrap: "wrap", boxShadow: "0 -4px 18px rgba(15,23,42,.06)",
        }}>
          {/* minWidth is small enough that the count can share a line on a
              phone; when it can't, it takes its own and the buttons follow
              together rather than Send stranding itself on a third line. */}
          <div style={{ flex: 1, minWidth: 120, fontSize: 13.5, color: total ? C.ink : C.mut, fontWeight: total ? 650 : 500 }}>
            {total === 0
              ? "Nobody selected yet"
              : `${pickedMembers.size} request${pickedMembers.size === 1 ? "" : "s"}, ${pickedContacts.size} invitation${pickedContacts.size === 1 ? "" : "s"}`}
          </div>
          {/* The two buttons are one wrapping unit — they belong together at
              every width, and marginLeft:auto keeps them right-aligned when
              they do share the row with the count. */}
          <div style={{ display: "flex", gap: 10, marginLeft: "auto", flex: "none" }}>
            {/* "Skip" before anything has been sent, "Done" after — the button
                destroys the imported list either way, and calling it Skip once
                the member is mid-way through several batches would read as
                "throw away what I just did". */}
            <button
              style={BTN}
              disabled={busy}
              onClick={() => finish(notice ? "Finished — the rest of your contacts have been deleted." : "Skipped — nothing was sent.")}
            >
              {notice ? "Done" : "Skip"}
            </button>
            <button
              style={{ ...BTN_PRIMARY, opacity: total === 0 || busy ? 0.5 : 1, cursor: total === 0 || busy ? "not-allowed" : "pointer" }}
              disabled={total === 0 || busy}
              onClick={sendAll}
            >
              {busy ? "Sending…" : total === 0 ? "Send" : `Send to ${total}`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Section({
  title, hint, count, selected, onAll, onNone, children,
}: {
  title: string; hint: string; count: number; selected: number;
  onAll: () => void; onNone: () => void; children: React.ReactNode;
}) {
  return (
    <div style={CARD}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12, flexWrap: "wrap", marginBottom: 6 }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <h2 style={{ fontSize: 15.5, fontWeight: 700, color: C.ink, margin: "0 0 3px" }}>
            {title} <span style={{ color: C.mut, fontWeight: 500 }}>({count})</span>
          </h2>
          <p style={{ fontSize: 12.5, color: C.mut, margin: 0, lineHeight: 1.5 }}>{hint}</p>
        </div>
        <button
          onClick={selected > 0 ? onNone : onAll}
          style={{ background: "none", border: "none", color: C.c1, fontSize: 13, fontWeight: 650, cursor: "pointer", padding: "2px 0" }}
        >
          {selected > 0 ? `Clear (${selected})` : `Select all ${count}`}
        </button>
      </div>
      {/* Capped so 600 contacts don't make one enormous page, but relative to
          the viewport as well as absolute: a fixed 460px scroller inside a
          short phone screen leaves almost nothing visible around it. */}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 1, maxHeight: "min(460px, 50vh)", overflowY: "auto" }}>{children}</div>
    </div>
  );
}

function Row({
  checked, disabled, onToggle, avatar, title, subtitle, href,
}: {
  checked: boolean; disabled?: boolean; onToggle: () => void;
  avatar: React.ReactNode; title: string; subtitle: string | null; href: string | null;
}) {
  return (
    <label
      style={{
        display: "flex", alignItems: "center", gap: 12, padding: "10px 4px",
        borderTop: `1px solid ${C.line}`, cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.55 : 1,
      }}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={onToggle}
        style={{ width: 17, height: 17, accentColor: C.c1, flex: "none", cursor: disabled ? "default" : "pointer" }}
      />
      {avatar}
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontWeight: 650, fontSize: 14, color: C.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {href ? (
            // stopPropagation so opening a profile doesn't also tick the box.
            <Link href={href} prefetch={false} onClick={(e) => e.stopPropagation()} style={{ color: C.ink, textDecoration: "none" }}>
              {title}
            </Link>
          ) : title}
        </div>
        {subtitle ? (
          <div style={{ fontSize: 12.5, color: C.mut, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {subtitle}
          </div>
        ) : null}
      </div>
    </label>
  );
}
