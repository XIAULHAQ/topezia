"use client";

/**
 * Feed's alert card for a SIGNED-IN user — no email field, since we already
 * have one. A plain on/off switch against the account's own verified address
 * (app/api/alerts/status, app/api/alerts/toggle). AlertCapture (the public
 * email-capture form) still covers anonymous /jobs/* page visitors.
 */
import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { C } from "@/app/_components/ui";

export default function AlertToggle({ slug, place, label }: { slug: string; place?: string; label: string }) {
  const [on, setOn] = useState(false);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const qs = new URLSearchParams({ slug, ...(place ? { place } : {}) });
    fetch(`/api/alerts/status?${qs}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!cancelled && d) setOn(!!d.subscribed); })
      .finally(() => { if (!cancelled) setReady(true); });
    return () => { cancelled = true; };
  }, [slug, place]);

  async function toggle() {
    const next = !on;
    setOn(next); // optimistic
    setBusy(true);
    try {
      const res = await fetch("/api/alerts/toggle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, place: place ?? null, enabled: next }),
      });
      if (!res.ok) setOn(!next); // revert
    } catch {
      setOn(!next);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={S.wrap}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={S.title}>Email me new {label}</div>
        <div style={S.sub}>Fresh, verified postings — one-click unsubscribe any time.</div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={`Email alerts for ${label}`}
        disabled={!ready || busy}
        onClick={toggle}
        style={{ ...S.switch, background: on ? C.c1 : "#CBD5E1", opacity: ready ? 1 : 0.6 }}
      >
        <span style={{ ...S.knob, left: on ? 18 : 2 }} />
      </button>
    </div>
  );
}

const S: Record<string, CSSProperties> = {
  wrap: { display: "flex", alignItems: "center", gap: 16, background: "#eef0ff", border: "1px solid #d9dcff", borderRadius: 16, padding: 18 },
  title: { fontWeight: 700, fontSize: 15, color: C.ink },
  sub: { color: C.mut, fontSize: 12.5, lineHeight: 1.45, marginTop: 3 },
  switch: { flex: "none", width: 40, height: 22, borderRadius: 999, border: "none", position: "relative", cursor: "pointer", transition: "background .15s" },
  knob: { position: "absolute", top: 2, width: 18, height: 18, borderRadius: "50%", background: "#fff", transition: "left .15s" },
};
