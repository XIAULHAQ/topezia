"use client";

/**
 * Share button with an explicit "Copy link" underneath it.
 *
 * The three share buttons in the app all did the same thing: open the native
 * share sheet if the browser has one, otherwise copy silently. That left two
 * gaps. On a phone the sheet takes over, so there was no way to simply grab the
 * link. On a desktop a button labelled "Share" copied to the clipboard without
 * ever saying so — the only feedback was the label changing for two seconds.
 *
 * So the button now opens a small menu. "Copy link" is always there and always
 * says what it did; the native sheet is offered only where one actually exists,
 * detected after mount (checking during render would differ between server and
 * client and break hydration).
 */
import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

type Tone = "light" | "dark";

/** Fixed width so placement can be computed before the menu is measured. */
const MENU_W = 250;
const MENU_MAX_H = 150;

export default function ShareMenu({
  url,
  title,
  label = "Share",
  tone = "light",
  buttonStyle,
  wrapperStyle,
  children,
}: {
  url: string;
  title: string;
  label?: string;
  tone?: Tone;
  /** The trigger's styling, so each surface keeps its own look. */
  buttonStyle?: CSSProperties;
  /** For stretch contexts (the portfolio rail stacks full-width controls). */
  wrapperStyle?: CSSProperties;
  /** Trigger contents (icon + text). Falls back to the label. */
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [canNativeShare, setCanNativeShare] = useState(false);
  const [copied, setCopied] = useState<"idle" | "ok" | "fail">("idle");
  const wrapRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  /**
   * The menu is position:FIXED, placed from the trigger's rect.
   *
   * Absolute positioning looked right until it met a clipping ancestor: the
   * public profile's hero card sets overflow:hidden for its rounded gradient
   * and cut the menu off at the card's edge. A fixed element is positioned
   * against the viewport and is not clipped by ancestor overflow, which is
   * what this needs — the same component sits in three different containers.
   * (A portal would also work but pulls in react-dom types this project
   * doesn't install, for no extra benefit here.)
   */
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  const place = useCallback(() => {
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    // Anchor to the trigger's LEFT edge, then clamp into the viewport.
    // Anchoring by `right` put the menu off-screen for a left-aligned trigger
    // (the profile's Share button), because it extended leftwards from there.
    const left = Math.min(Math.max(8, r.left), window.innerWidth - MENU_W - 8);
    // Flip above the trigger when there isn't room below it.
    const below = r.bottom + 8;
    const fitsBelow = below + MENU_MAX_H <= window.innerHeight;
    setPos({ top: fitsBelow ? below : Math.max(8, r.top - MENU_MAX_H - 8), left });
  }, []);

  // After mount only — navigator doesn't exist during SSR, and branching on it
  // during render would produce different markup on the server and client.
  useEffect(() => {
    setCanNativeShare(typeof navigator !== "undefined" && typeof navigator.share === "function");
  }, []);

  // Follow the trigger while the page moves — the portfolio rail is sticky, so
  // a menu pinned to stale coordinates would drift away from its button.
  useEffect(() => {
    if (!open) return;
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open, place]);

  // Close on outside click and on Escape, like any other menu in the app.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      // The menu is portalled, so it is NOT inside wrapRef — check both, or
      // clicking "Copy link" would close the menu before it ran.
      if (wrapRef.current?.contains(t)) return;
      if (menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied("ok");
    } catch {
      // Clipboard is blocked without a secure context or permission. Say so
      // rather than pretending it worked — the link is shown so it can be
      // selected by hand.
      setCopied("fail");
    }
    setTimeout(() => { setCopied("idle"); setOpen(false); }, 1600);
  }

  async function nativeShare() {
    try {
      await navigator.share({ title, url });
      setOpen(false);
    } catch {
      /* dismissed — leave the menu open so Copy link is still reachable */
    }
  }

  const menuTone = tone === "dark" ? DARK : LIGHT;

  const menuNode = open && pos ? (
    <div ref={menuRef} role="menu" style={{ ...S.menu, top: pos.top, left: pos.left, ...menuTone.menu }}>
      {canNativeShare && (
        <button type="button" role="menuitem" onClick={nativeShare} style={{ ...S.item, ...menuTone.item }}>
          <Ic d="M4 12v8h16v-8 M12 3v12 M8 7l4-4 4 4" />
          Share via…
        </button>
      )}

      <button type="button" role="menuitem" onClick={copy} style={{ ...S.item, ...menuTone.item }}>
        <Ic d="M9 9h10v10H9z M5 15V5h10" />
        {copied === "ok" ? "Link copied" : copied === "fail" ? "Couldn't copy — select it below" : "Copy link"}
      </button>

      {/* Always visible, so the link is selectable by hand when the clipboard
          is unavailable, and so people can see what they're about to send. */}
      <div style={{ ...S.url, ...menuTone.url }}>{url.replace(/^https?:\/\//, "")}</div>
    </div>
  ) : null;

  return (
    <div ref={wrapRef} style={{ position: "relative", display: "inline-block", ...wrapperStyle }}>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={buttonStyle}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {children ?? label}
      </button>

      {menuNode}
    </div>
  );
}

function Ic({ d }: { d: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" style={{ flex: "none" }}>
      {d.split(" M").map((seg, i) => <path key={i} d={i === 0 ? seg : `M${seg}`} />)}
    </svg>
  );
}

const S: Record<string, CSSProperties> = {
  menu: {
    position: "fixed", zIndex: 200,
    width: MENU_W, borderRadius: 12, padding: 6,
    boxShadow: "0 12px 32px rgba(15,23,42,.16)",
  },
  item: {
    display: "flex", alignItems: "center", gap: 9, width: "100%",
    padding: "10px 12px", borderRadius: 8, border: "none", background: "none",
    fontSize: 13.5, fontWeight: 600, cursor: "pointer", textAlign: "left",
    fontFamily: "inherit",
  },
  url: {
    fontSize: 11.5, padding: "8px 12px 6px", wordBreak: "break-all", lineHeight: 1.45,
    userSelect: "all",
  },
};

const LIGHT = {
  menu: { background: "#fff", border: "1px solid #E2E8F0" } as CSSProperties,
  item: { color: "#334155" } as CSSProperties,
  url: { color: "#64748B", borderTop: "1px solid #E2E8F0", marginTop: 4 } as CSSProperties,
};

const DARK = {
  menu: { background: "#1E293B", border: "1px solid rgba(255,255,255,.14)" } as CSSProperties,
  item: { color: "#E2E8F0" } as CSSProperties,
  url: { color: "#94A3B8", borderTop: "1px solid rgba(255,255,255,.12)", marginTop: 4 } as CSSProperties,
};
