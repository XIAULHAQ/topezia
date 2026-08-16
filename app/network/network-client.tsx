"use client";

/**
 * /network — the hub: find people, answer requests, see who you know.
 *
 * The find-people card is Alignable's entry screen with the copy made true.
 * Theirs says "Search our 10 million member database" over a box holding YOUR
 * OWN address — it is a Google consent button dressed as a search field, and a
 * member who types a colleague's address into it gets a Google consent screen
 * they did not ask for. Ours says what the button does: it reads your Google
 * contacts and shows you who among them is already here.
 *
 * Their promise line ("we'll never spam your connections") is worth keeping,
 * because ours is enforceable: nothing is sent until the member ticks names on
 * the next screen — see lib/network/doc.ts.
 */
import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { C, GRAD, Icon } from "@/app/_components/ui";
import { PENDING_CHANGED } from "@/app/_components/AppShell";
import { NETWORK_LIMITS } from "@/lib/network/doc";
// The Prisma-free module, not lib/network/invites — this is a client component
// and that one imports the database client.
import { parseAddressList } from "@/lib/network/addresses";
import { PersonRow, type PersonCard } from "./person";

type Person = PersonCard & { id: string };
type Data = {
  connections: { id: string; since: string; isNew: boolean; person: Person }[];
  incoming: { id: string; note: string | null; at: string; person: Person }[];
  outgoing: { id: string; at: string; person: Person }[];
  invites: { id: string; email: string; name: string | null; status: string; sent: boolean; sendError: string | null; at: string }[];
  needsProfile: boolean;
  googleReady: boolean;
  pendingImport: { id: string; total: number; importedAt: string; expiresAt: string | null } | null;
};

const CARD: React.CSSProperties = {
  background: "#fff", border: `1px solid ${C.line}`, borderRadius: 16, padding: 20,
};
const BTN: React.CSSProperties = {
  border: `1px solid ${C.line}`, background: "#fff", color: C.slate,
  borderRadius: 9, padding: "7px 13px", fontSize: 13, fontWeight: 600, cursor: "pointer",
};
const BTN_PRIMARY: React.CSSProperties = {
  ...BTN, background: GRAD, color: "#fff", border: "1px solid transparent",
};

export default function NetworkClient() {
  const params = useSearchParams();
  const [data, setData] = useState<Data | null>(null);
  const [authGate, setAuthGate] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(params.get("error"));
  const [tab, setTab] = useState<"connections" | "requests" | "sent">("connections");

  const load = useCallback(async () => {
    const res = await fetch("/api/network", { cache: "no-store" });
    if (res.status === 401) { setAuthGate(true); return; }
    if (!res.ok) { setError("We couldn't load your network."); return; }
    const body = (await res.json()) as Data;
    setData(body);
    // Two reasons to fire this. The sidebar badge lives outside this tree and
    // cannot see this state; and GET /api/network has just stamped
    // networkSeenAt, so the acceptance half of the badge is now stale by
    // definition and has to be re-counted.
    window.dispatchEvent(new Event(PENDING_CHANGED));
  }, []);

  useEffect(() => { void load(); }, [load]);

  // A request answered here changes a count the rest of the page shows, so the
  // whole thing is refetched rather than patched in three places.
  const act = useCallback(async (key: string, run: () => Promise<Response>) => {
    setBusy(key); setError(null);
    try {
      const res = await run();
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? "That didn't work.");
        return;
      }
      await load();
    } finally {
      setBusy(null);
    }
  }, [load]);

  if (authGate) {
    return (
      <div style={{ ...CARD, textAlign: "center", padding: 40 }}>
        <h1 style={{ fontSize: 20, color: C.ink, margin: "0 0 8px" }}>Your network</h1>
        <p style={{ color: C.mut, fontSize: 14.5, margin: "0 0 18px" }}>Sign in to see who you know on Topezia.</p>
        <Link href="/login?next=/network" style={{ ...BTN_PRIMARY, textDecoration: "none", display: "inline-block" }}>Sign in</Link>
      </div>
    );
  }

  const incoming = data?.incoming ?? [];
  const connections = data?.connections ?? [];
  const outgoing = data?.outgoing ?? [];
  const invites = data?.invites ?? [];

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 18 }}>
      <div>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: C.ink, margin: "0 0 4px" }}>Your network</h1>
        <p style={{ color: C.mut, fontSize: 14, margin: 0 }}>
          People you've worked with, and the ones you haven't found here yet.
        </p>
      </div>

      {error ? (
        <div style={{ ...CARD, padding: "12px 16px", borderColor: "#FECACA", background: "#FEF2F2", color: "#991B1B", fontSize: 13.5 }}>
          {error}
        </div>
      ) : null}

      {/* ── Your imported contacts, kept between visits ──────────────────── */}
      {data?.pendingImport ? (
        <ImportedContacts
          info={data.pendingImport}
          onDeleted={load}
        />
      ) : null}

      {/* ── Find people you know ─────────────────────────────────────────── */}
      <FindPeople ready={data?.googleReady ?? false} needsProfile={data?.needsProfile ?? false} />

      {/* ── Invite by email ──────────────────────────────────────────────── */}
      {data && !data.needsProfile ? <InviteByEmail onSent={load} /> : null}

      {/* ── Requests waiting on you ──────────────────────────────────────── */}
      {incoming.length > 0 ? (
        <div style={CARD}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: C.ink, margin: "0 0 4px" }}>
            {incoming.length === 1 ? "1 person wants to connect" : `${incoming.length} people want to connect`}
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 2, marginTop: 8 }}>
            {incoming.map((r) => (
              <PersonRow
                key={r.id}
                person={r.person}
                sub={r.note ? <span style={{ fontStyle: "italic" }}>“{r.note}”</span> : undefined}
                action={
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      style={BTN} disabled={busy === r.id}
                      onClick={() => act(r.id, () => fetch(`/api/network/connect?id=${r.id}`, { method: "DELETE" }))}
                    >
                      Ignore
                    </button>
                    <button
                      style={BTN_PRIMARY} disabled={busy === r.id}
                      onClick={() => act(r.id, () => fetch("/api/network/connect", {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ id: r.id }),
                      }))}
                    >
                      Accept
                    </button>
                  </div>
                }
              />
            ))}
          </div>
        </div>
      ) : null}

      {/* ── The lists ────────────────────────────────────────────────────── */}
      <div style={CARD}>
        <div style={{ display: "flex", gap: 4, borderBottom: `1px solid ${C.line}`, marginBottom: 6 }}>
          {([
            ["connections", `Connections${connections.length ? ` (${connections.length})` : ""}`],
            ["sent", `Sent${outgoing.length ? ` (${outgoing.length})` : ""}`],
            ["requests", `Invitations${invites.length ? ` (${invites.length})` : ""}`],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              style={{
                background: "none", border: "none", cursor: "pointer",
                padding: "8px 12px", fontSize: 13.5,
                fontWeight: tab === key ? 700 : 500,
                color: tab === key ? C.ink : C.mut,
                borderBottom: `2px solid ${tab === key ? C.c1 : "transparent"}`,
                marginBottom: -1,
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {data === null ? (
          <p style={{ color: C.mut, fontSize: 13.5, padding: "16px 4px" }}>Loading…</p>
        ) : tab === "connections" ? (
          connections.length === 0 ? (
            <Empty>No connections yet. Find the people you already know above.</Empty>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 2 }}>
              {connections.map((c) => (
                <PersonRow
                  key={c.id}
                  person={c.person}
                  // What the badge was counting. Shown once: the next load of
                  // this page has already stamped networkSeenAt, so these
                  // disappear — which is the point of a "new since you looked"
                  // marker rather than an unread flag to be cleared by hand.
                  sub={c.isNew ? <NewTag /> : undefined}
                  action={
                    <button
                      style={BTN} disabled={busy === c.id}
                      onClick={() => act(c.id, () => fetch(`/api/network/connect?id=${c.id}`, { method: "DELETE" }))}
                    >
                      Remove
                    </button>
                  }
                />
              ))}
            </div>
          )
        ) : tab === "sent" ? (
          outgoing.length === 0 ? (
            <Empty>Nothing waiting on anyone else.</Empty>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 2 }}>
              {outgoing.map((c) => (
                <PersonRow
                  key={c.id}
                  person={c.person}
                  sub="Waiting for them to accept"
                  action={
                    <button
                      style={BTN} disabled={busy === c.id}
                      onClick={() => act(c.id, () => fetch(`/api/network/connect?id=${c.id}`, { method: "DELETE" }))}
                    >
                      Withdraw
                    </button>
                  }
                />
              ))}
            </div>
          )
        ) : invites.length === 0 ? (
          <Empty>You haven't invited anyone who isn't on Topezia yet.</Empty>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 2 }}>
            {invites.map((i) => (
              <div key={i.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 4px" }}>
                <Icon name="mail" size={18} color={C.mut} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 14, color: C.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {i.name || i.email}
                  </div>
                  <div style={{ fontSize: 12.5, color: C.mut, marginTop: 2 }}>
                    {/* Never "sent" when it wasn't. */}
                    {i.status === "ACCEPTED" ? "Joined — you're connected"
                      : i.sendError ? "We couldn't deliver this one"
                      : i.sent ? "Invitation sent"
                      : "Not sent"}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Invite people by typing or pasting their addresses.
 *
 * This exists because contact import cannot be the only way in. It requires a
 * Google account, it requires Google to have verified us, and it asks for the
 * member's ENTIRE address book to invite three colleagues. Most people, most of
 * the time, want to type three addresses — so that path should not be the
 * degraded one.
 *
 * The textarea accepts whatever a mail client puts on the clipboard: bare
 * addresses, "Name <addr>", quoted names with commas in them, separated by
 * commas, semicolons or newlines. Parsing happens client-side purely so the
 * count and the errors can be shown before anything is sent; the server parses
 * and validates again, because a browser is not a validator.
 */
function InviteByEmail({ onSent }: { onSent: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { contacts, invalid } = parseAddressList(text);
  const tooMany = contacts.length > NETWORK_LIMITS.INVITES_PER_BATCH;

  const send = useCallback(async () => {
    if (busy || contacts.length === 0 || tooMany) return;
    setBusy(true); setError(null); setResult(null);
    try {
      const res = await fetch("/api/network/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // "typed", not "contacts" — the email must not tell the recipient they
        // were found in an address book when the member keyed them in.
        body: JSON.stringify({ contacts, source: "typed" }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        sent?: number; error?: string;
        failed?: { email: string }[];
        skipped?: { duplicate: number; overCap: number; unavailable: number };
      };
      if (!res.ok) { setError(body.error ?? "That didn't send."); return; }

      const sent = body.sent ?? 0;
      const parts = [`${sent} invitation${sent === 1 ? "" : "s"} sent`];
      // Everything not sent is accounted for, rather than quietly vanishing.
      // "Couldn't be sent" folds together the do-not-contact list and the
      // already-invited case on purpose — see lib/network/invite's route.
      const held = (body.skipped?.duplicate ?? 0) + (body.skipped?.unavailable ?? 0) + (body.skipped?.overCap ?? 0);
      if (held) parts.push(`${held} couldn't be sent`);
      if (body.failed?.length) parts.push(`${body.failed.length} failed to deliver`);
      setResult(parts.join(" · ") + ".");
      setText("");
      await onSent();
    } finally {
      setBusy(false);
    }
  }, [busy, contacts, tooMany, onSent]);

  if (!open) {
    return (
      <div style={{ ...CARD, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <Icon name="mail" size={18} color={C.mut} />
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontWeight: 650, fontSize: 14.5, color: C.ink }}>Invite someone by email</div>
          <div style={{ fontSize: 12.5, color: C.mut, marginTop: 2 }}>
            No Google account needed — type or paste their addresses.
          </div>
        </div>
        <button style={BTN} onClick={() => { setOpen(true); setResult(null); }}>Write an invitation</button>
      </div>
    );
  }

  return (
    <div style={CARD}>
      <h2 style={{ fontSize: 15.5, fontWeight: 700, color: C.ink, margin: "0 0 4px" }}>Invite someone by email</h2>
      <p style={{ fontSize: 12.5, color: C.mut, margin: "0 0 12px", lineHeight: 1.5 }}>
        One address per line, or separated by commas. Names are optional —
        “Jane Doe &lt;jane@example.com&gt;” works too. Each person gets one
        email from you, and can decline or opt out in one click.
      </p>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={4}
        placeholder={"jane@example.com\nSam Okafor <sam@example.com>"}
        style={{
          width: "100%", boxSizing: "border-box", padding: "10px 12px",
          border: `1px solid ${C.line}`, borderRadius: 10, fontSize: 14,
          fontFamily: "inherit", color: C.ink, resize: "vertical", lineHeight: 1.5,
        }}
      />

      {invalid.length > 0 ? (
        <p style={{ fontSize: 12.5, color: "#B45309", margin: "8px 0 0" }}>
          Not a valid address: {invalid.slice(0, 3).map((v) => `“${v}”`).join(", ")}
          {invalid.length > 3 ? ` and ${invalid.length - 3} more` : ""}. These will be skipped.
        </p>
      ) : null}
      {tooMany ? (
        <p style={{ fontSize: 12.5, color: "#B45309", margin: "8px 0 0" }}>
          That's {contacts.length} people — {NETWORK_LIMITS.INVITES_PER_BATCH} at a time is the limit.
        </p>
      ) : null}
      {error ? <p style={{ fontSize: 13, color: "#991B1B", margin: "8px 0 0" }}>{error}</p> : null}

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
        <span style={{ flex: 1, minWidth: 140, fontSize: 13, color: C.mut }}>
          {contacts.length === 0 ? "No addresses yet" : `${contacts.length} ${contacts.length === 1 ? "person" : "people"}`}
        </span>
        <button style={BTN} disabled={busy} onClick={() => { setOpen(false); setText(""); setError(null); }}>
          Cancel
        </button>
        <button
          style={{ ...BTN_PRIMARY, opacity: contacts.length === 0 || tooMany || busy ? 0.5 : 1 }}
          disabled={contacts.length === 0 || tooMany || busy}
          onClick={send}
        >
          {busy ? "Sending…" : contacts.length > 1 ? `Send ${contacts.length} invitations` : "Send invitation"}
        </button>
      </div>

      {result ? <p style={{ fontSize: 13, color: "#15803D", margin: "10px 0 0" }}>{result}</p> : null}
    </div>
  );
}

/**
 * The imported address book, still here.
 *
 * Kept between visits rather than self-destructing: a member with hundreds of
 * contacts invites a few at a time over days, and a list that evaporated
 * between sessions made that impossible. Google's Limited Use rules govern
 * what the data may be USED for — this feature, nothing else, never
 * transferred or advertised against — not whether it may persist while it is
 * still doing that job.
 *
 * The delete control is what makes keeping it honest, so it sits on the card
 * rather than buried in settings: the member can see the list exists and end
 * it in one click.
 */
function ImportedContacts({
  info, onDeleted,
}: {
  info: { id: string; total: number; importedAt: string; expiresAt: string | null };
  onDeleted: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const remove = useCallback(async () => {
    setBusy(true);
    try {
      await fetch(`/api/network/import/${info.id}`, { method: "DELETE" }).catch(() => {});
      await onDeleted();
    } finally {
      setBusy(false);
    }
  }, [info.id, onDeleted]);

  const imported = new Date(info.importedAt).toLocaleDateString(undefined, { day: "numeric", month: "short" });

  return (
    <div style={{ ...CARD, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", borderColor: "#C7D2FE", background: "#EEF2FF" }}>
      <Icon name="user" size={18} color={C.c1} />
      <div style={{ flex: 1, minWidth: 180 }}>
        <div style={{ fontWeight: 650, fontSize: 14.5, color: C.ink }}>Your imported contacts</div>
        <div style={{ fontSize: 12.5, color: C.mut, marginTop: 2 }}>
          {info.total.toLocaleString()} contacts from {imported}.{" "}
          {info.expiresAt
            ? "These were imported under the old rules and will be deleted automatically."
            : "Kept here so you can invite a few at a time — anyone you've already invited drops off the list."}
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, flex: "none", flexWrap: "wrap" }}>
        {confirming ? (
          <>
            <button style={BTN} disabled={busy} onClick={() => setConfirming(false)}>Keep</button>
            <button
              style={{ ...BTN, borderColor: "#FECACA", color: "#B42318" }}
              disabled={busy}
              onClick={remove}
            >
              {busy ? "Deleting…" : "Yes, delete"}
            </button>
          </>
        ) : (
          <>
            <button style={BTN} disabled={busy} onClick={() => setConfirming(true)}>Delete</button>
            <Link href={`/network/import/${info.id}`} style={{ ...BTN_PRIMARY, textDecoration: "none", display: "inline-block" }}>
              Open contacts
            </Link>
          </>
        )}
      </div>
    </div>
  );
}

/** "They accepted, and you haven't been back since." */
function NewTag() {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "#15803D", fontWeight: 650 }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#22C55E", flex: "none" }} />
      Accepted your request
    </span>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p style={{ color: C.mut, fontSize: 13.5, padding: "18px 4px", margin: 0 }}>{children}</p>;
}

/**
 * The import entry point.
 *
 * A plain link, not a fetch: /api/network/google/start is a redirect to Google,
 * and routing that through client JavaScript only adds a step that can fail
 * without saying so.
 */
function FindPeople({ ready, needsProfile }: { ready: boolean; needsProfile: boolean }) {
  return (
    <div style={{ ...CARD, textAlign: "center", padding: "28px 20px" }}>
      <div style={{ display: "flex", justifyContent: "center", marginBottom: 14 }}>
        <div style={{
          width: 52, height: 52, borderRadius: "50%", background: GRAD,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <Icon name="user" size={26} color="#fff" />
        </div>
      </div>

      <h2 style={{ fontSize: 19, fontWeight: 800, color: C.ink, margin: "0 0 6px" }}>
        Find the people you already know
      </h2>
      <p style={{ color: C.mut, fontSize: 14, margin: "0 auto 18px", maxWidth: 460, lineHeight: 1.55 }}>
        Connect your Google account and we'll show you which of your contacts are
        already on Topezia — and let you invite the ones who aren't.
      </p>

      {needsProfile ? (
        <Link href="/profile/edit" style={{ ...BTN_PRIMARY, textDecoration: "none", display: "inline-block", padding: "11px 22px", fontSize: 14.5 }}>
          Finish your profile first
        </Link>
      ) : ready ? (
        <a href="/api/network/google/start" style={{ ...BTN_PRIMARY, textDecoration: "none", display: "inline-block", padding: "11px 22px", fontSize: 14.5 }}>
          Connect Google Contacts
        </a>
      ) : (
        <span style={{ ...BTN, display: "inline-block", padding: "11px 22px", fontSize: 14.5, opacity: 0.6, cursor: "not-allowed" }}>
          Contact import isn't switched on yet
        </span>
      )}

      {/* The promise, and it is one the code keeps — see lib/network/doc.ts. */}
      <p style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 7, color: C.mut, fontSize: 12.5, margin: "16px 0 0", lineHeight: 1.5 }}>
        <Icon name="check" size={14} color="#16A34A" />
        We never email anyone until you've picked them by name. Your contacts are
        read once, never sold, and deleted within the hour.
      </p>
    </div>
  );
}
