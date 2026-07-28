"use client";

/**
 * Rotating "finish your profile" card for the /feed sidebar — one missing
 * item at a time (lib/profile/checklist.ts, the same list /profile's own
 * completion meter uses), with an edit icon that deep-links straight to the
 * right edit-in-place section (and field) instead of a generic "go edit"
 * link. Mirrors the AI coach tip's rotation UX (lib/coach/tips.ts): a
 * deterministic daily pick plus a manual "another" cycle, so reloading the
 * page never reshuffles mid-session.
 */
import { useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { C, Icon, Card } from "@/app/_components/ui";
import { buildChecklist, type ChecklistProfile } from "@/lib/profile/checklist";

export default function ProfileNudge({ profile }: { profile: ChecklistProfile | null }) {
  const [offset, setOffset] = useState(0);

  // Only items with an edit-in-place section apply here — the one exception
  // (published work) opens a whole different page, not a profile-modal field.
  const missing = useMemo(
    () => (profile ? buildChecklist(profile).filter((c) => !c.done && c.section) : []),
    [profile]
  );

  if (!profile || missing.length === 0) return null;

  const day = Math.floor(Date.now() / 86_400_000);
  const index = ((day + offset) % missing.length + missing.length) % missing.length;
  const item = missing[index];
  const href = `/profile?edit=${item.section}${item.field ? `&focus=${item.field}` : ""}`;

  return (
    <Card>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
        <Icon name="edit" size={15} color={C.c1} />
        <h2 style={S.h}>Finish your profile</h2>
        {missing.length > 1 && <span style={S.count}>{index + 1}/{missing.length}</span>}
      </div>
      <p style={S.p}>Add {item.label.toLowerCase()} — profiles with more detail match better and stand out more.</p>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10 }}>
        <a href={href} style={S.cta}><Icon name="edit" size={13} />{item.label}</a>
        {missing.length > 1 && (
          <button type="button" onClick={() => setOffset((o) => o + 1)} style={S.cycle}>↻ Another</button>
        )}
      </div>
    </Card>
  );
}

const S: Record<string, CSSProperties> = {
  h: { margin: 0, fontSize: 14.5, fontWeight: 800, color: C.ink, flex: 1 },
  count: { fontSize: 10.5, color: C.mut, fontWeight: 600 },
  p: { fontSize: 12.5, color: C.slate, lineHeight: 1.55, margin: 0 },
  cta: { display: "inline-flex", alignItems: "center", gap: 6, background: "#EEF2FF", color: C.c1, borderRadius: 999, padding: "7px 14px", fontSize: 12.5, fontWeight: 700, textDecoration: "none" },
  cycle: { background: "none", border: "none", color: C.mut, fontSize: 11.5, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", padding: 0 },
};
