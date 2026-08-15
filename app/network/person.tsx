"use client";

/**
 * One person, rendered the same way everywhere in the network screens.
 *
 * Split out because the hub and the import results show the same row with
 * different buttons, and two copies of an avatar-plus-two-lines drift apart
 * within a week.
 */
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { C, GRAD, initials } from "@/app/_components/ui";

export type PersonCard = {
  id?: string;
  fullName: string | null;
  publicSlug: string | null;
  photoUrl: string | null;
  headline?: string | null;
  location?: string | null;
  /** What the member's own address book called them, when that differs. */
  contactName?: string | null;
};

export function Avatar({ person, size = 44 }: { person: PersonCard; size?: number }) {
  const name = person.fullName ?? person.contactName ?? null;
  return person.photoUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={person.photoUrl}
      alt=""
      width={size}
      height={size}
      style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", flex: "none", border: `1px solid ${C.line}` }}
    />
  ) : (
    <div
      style={{
        width: size, height: size, borderRadius: "50%", flex: "none",
        background: GRAD, color: "#fff", fontWeight: 700,
        fontSize: Math.round(size * 0.34),
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
    >
      {initials(name)}
    </div>
  );
}

/** An address with no member behind it — the invite list. */
export function ContactAvatar({ label, size = 40 }: { label: string; size?: number }) {
  return (
    <div
      style={{
        width: size, height: size, borderRadius: "50%", flex: "none",
        background: "#F1F5F9", color: C.mut, fontWeight: 700,
        fontSize: Math.round(size * 0.34), border: `1px solid ${C.line}`,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
    >
      {initials(label)}
    </div>
  );
}

export function PersonRow({
  person, action, sub, style,
}: {
  person: PersonCard;
  action?: ReactNode;
  /** Overrides the default second line (headline · location). */
  sub?: ReactNode;
  style?: CSSProperties;
}) {
  const name = person.fullName?.trim() || person.contactName?.trim() || "Someone on Topezia";
  const detail = [person.headline, person.location].filter(Boolean).join(" · ");

  const body = (
    <>
      <Avatar person={person} />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontWeight: 650, fontSize: 14.5, color: C.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {name}
        </div>
        <div style={{ fontSize: 12.5, color: C.mut, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {sub ?? detail ?? null}
        </div>
      </div>
    </>
  );

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 4px", ...style }}>
      {/* Only a member with a public page is a link — linking a name to a 404
          is worse than not linking it. */}
      {person.publicSlug ? (
        <Link
          href={`/p/${person.publicSlug}`}
          prefetch={false}
          style={{ display: "flex", alignItems: "center", gap: 12, textDecoration: "none", minWidth: 0, flex: 1 }}
        >
          {body}
        </Link>
      ) : (
        <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0, flex: 1 }}>{body}</div>
      )}
      {action ? <div style={{ flex: "none" }}>{action}</div> : null}
    </div>
  );
}
