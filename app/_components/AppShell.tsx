"use client";

/**
 * Global app shell — the left sidebar nav (replacing the old top nav) + the top
 * bar (collapse toggle, search, avatar). Wraps the feed, profile and settings.
 *
 * Honesty: only destinations that actually work are links (Job Feed, My
 * Profile, Career Coach, Settings, Log out). Everything else in the designed
 * nav — Overview, Search Jobs, Applications, Skill Assessment —
 * is shown but marked "Soon" and is non-navigable, so the nav conveys the
 * roadmap without pretending those pages exist.
 */
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { C, GRAD, FONT, Icon, BrandMark } from "./ui";
import { fetchProfileShared, readProfileCache } from "@/lib/fetch-profile";
import AccountMenu from "./AccountMenu";
import { cachedFetchJson, writeCache } from "@/lib/client-cache";

/**
 * Fired by /network when it accepts or ignores a request. Accepting happens on
 * the same page, so pathname never changes and the badge would otherwise keep
 * showing a count the member has already dealt with.
 */
export const PENDING_CHANGED = "topezia:network-pending-changed";

type NavItem = { icon: string; label: string; href?: string; soon?: boolean; badge?: "network" };

/**
 * The two "go find work" destinations: inline beside the avatar on desktop, a
 * row of full-width buttons underneath it on mobile — squeezed onto the avatar
 * row they collapsed to bare icons with no labels, which read as decoration
 * rather than navigation.
 */
const FIND_LINKS: { icon: string; label: string; href: string }[] = [
  { icon: "feed", label: "Find Jobs", href: "/feed" },
  { icon: "zap", label: "Find Projects", href: "/projects" },
];

/**
 * One-time hint: a soft pulse around whichever of the two you are already
 * looking at, so a first-time visitor can tell that the list below belongs to
 * that button. Shown once ever — persisted, dismissed on first interaction, and
 * silent for anyone who asked their OS to reduce motion.
 */
const FIND_HINT_KEY = "tz_findnav_hint_v1";
const FIND_HINT_CSS = `
@keyframes tz-find-hint{
  0%{box-shadow:0 0 0 0 rgba(139,92,246,.5)}
  70%{box-shadow:0 0 0 9px rgba(139,92,246,0)}
  100%{box-shadow:0 0 0 0 rgba(139,92,246,0)}
}
.tz-find-hint{animation:tz-find-hint 1.8s ease-out 3}
@media (prefers-reduced-motion:reduce){.tz-find-hint{animation:none}}
`;

// Finding work (Find Jobs / Find Projects) lives in the top bar next to the
// avatar, not here — the sidebar is what you've collected and who you are.
const NAV: NavItem[] = [
  { icon: "user", label: "My Profile", href: "/profile" },
  // Resume Builder and Career Coach sit directly under the profile: all three
  // are "work on yourself" surfaces, and the builder/coach both read the
  // profile — the saved/collected things come after.
  { icon: "doc", label: "Resume Builder", href: "/resume" },
  { icon: "spark", label: "Career Coach", href: "/coach" },
  // Above the saved/collected things: the network is people, and it belongs
  // with the profile it hangs off rather than with a list of bookmarks.
  { icon: "link", label: "My Network", href: "/network", badge: "network" },
  { icon: "bookmark", label: "Saved Jobs", href: "/saved" },
  { icon: "zap", label: "Saved Projects", href: "/saved/projects" },
  { icon: "image", label: "My Work", href: "/portfolio/mine" },
  { icon: "briefcase", label: "Applications", href: "/applications" },
  { icon: "chat", label: "Messages", href: "/messages" },
  { icon: "plus", label: "Post a Job", href: "/employer" },
  { icon: "gauge", label: "Skill Assessment", soon: true },
];

export default function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  // Defaults wide so the first paint assumes desktop, matching isMobile's
  // optimistic default — otherwise every desktop load would flash the stacked
  // Find row before the measurement lands.
  const [winW, setWinW] = useState(1440);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [findHint, setFindHint] = useState(false); // one-time pulse on the active Find button
  // With prefetch disabled, a nav click waits a full server round-trip with no
  // feedback — people click 3-4 times thinking it didn't register. This flag
  // paints a progress bar the INSTANT any nav link is clicked.
  const [navigating, setNavigating] = useState(false);
  const [tier, setTier] = useState<string | null>(null);
  const [searchQ, setSearchQ] = useState("");
  // Requests waiting on me + acceptances I haven't seen. One number, because
  // the sidebar has room for one — /network separates them.
  const [pending, setPending] = useState(0);

  useEffect(() => {
    // The membership card needs the signed-in tier, and this shell wraps
    // pages that don't otherwise fetch it. Shared with the page inside the
    // shell (and with AccountMenu) — /feed needs the same endpoint, and
    // parallel calls cost an auth round-trip each for one answer.
    const applyIdentity = (d: Awaited<ReturnType<typeof fetchProfileShared>>) => {
      const pr = d?.profile as { tier?: string } | null | undefined;
      if (pr) setTier(pr.tier ?? null);
    };
    applyIdentity(readProfileCache()); // instant on repeat visits
    fetchProfileShared().then(applyIdentity).catch(() => {});
  }, []);

  // The connection-request badge. Re-read on every navigation so accepting a
  // request on /network clears the count without a reload, and hydrated from
  // the session cache first so it never flashes 0 → 3 on a repeat visit.
  // clearClientCaches() on login/logout already covers this key, so one
  // account's count can never appear under another's.
  useEffect(() => {
    void cachedFetchJson<{ total: number }>("/api/network/pending", (d) =>
      setPending(d.total ?? 0)
    );
  }, [pathname]);

  // Same-page updates. A plain fetch rather than cachedFetchJson: the cached
  // value is the number we already know is stale, and re-applying it first
  // would flash the old count before the new one lands.
  useEffect(() => {
    const refresh = async () => {
      try {
        const r = await fetch("/api/network/pending");
        if (!r.ok) return;
        const d = (await r.json()) as { total: number };
        writeCache("/api/network/pending", d);
        setPending(d.total ?? 0);
      } catch {
        /* the badge is decoration — leave the last known count */
      }
    };
    window.addEventListener(PENDING_CHANGED, refresh);
    return () => window.removeEventListener(PENDING_CHANGED, refresh);
  }, []);

  useEffect(() => {
    const check = () => { setIsMobile(window.innerWidth < 768); setWinW(window.innerWidth); };
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);
  // Close the drawer and clear the progress bar on navigation.
  useEffect(() => { setMobileOpen(false); setNavigating(false); }, [pathname]);

  // A link back to the CURRENT page never changes pathname, so clear the bar
  // ourselves after a beat rather than letting it spin forever.
  useEffect(() => {
    if (!navigating) return;
    const t = setTimeout(() => setNavigating(false), 8000);
    return () => clearTimeout(t);
  }, [navigating]);

  /** Instant feedback for every nav click: close menus, light the bar. */
  // Runs once ever. localStorage throws in some privacy modes — a missing hint
  // is cosmetic, so failing to read or write it must never break the shell.
  useEffect(() => {
    let seen = true;
    try { seen = localStorage.getItem(FIND_HINT_KEY) === "1"; } catch { /* treat as seen */ }
    if (seen) return;
    setFindHint(true);
    const t = setTimeout(() => {
      setFindHint(false);
      try { localStorage.setItem(FIND_HINT_KEY, "1"); } catch { /* nothing to do */ }
    }, 6000);
    return () => clearTimeout(t);
  }, []);

  function dismissFindHint() {
    if (!findHint) return;
    setFindHint(false);
    try { localStorage.setItem(FIND_HINT_KEY, "1"); } catch { /* nothing to do */ }
  }

  /**
   * `stacked` = the mobile row: two equal buttons that read as buttons. Inline
   * (desktop) keeps the lighter treatment that already looked right there.
   */
  function findLinks(stacked: boolean) {
    return FIND_LINKS.map((l) => {
      const active = l.href === "/feed" ? pathname === "/feed" : pathname.startsWith(l.href);
      return (
        <Link
          key={l.href}
          href={l.href}
          prefetch={false}
          onClick={() => { dismissFindHint(); navClicked(); }}
          className={findHint && active ? "tz-find-hint" : undefined}
          aria-current={active ? "page" : undefined}
          style={{
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8, textDecoration: "none",
            padding: stacked ? "11px 14px" : "9px 14px",
            flex: stacked ? "1 1 0" : "none",
            borderRadius: stacked ? 12 : 10,
            fontSize: stacked ? 14 : 13, fontWeight: 600,
            color: active ? C.c1 : C.slate,
            background: active ? "#EEF2FF" : "#fff",
            border: `1px solid ${active ? "#C7D2FE" : C.line}`,
            whiteSpace: "nowrap",
          }}
        >
          <Icon name={l.icon} size={15} />
          {l.label}
        </Link>
      );
    });
  }

  function navClicked() {
    setMobileOpen(false);
    setNavigating(true);
  }

  // Mobile: the sidebar is an off-canvas drawer (always full labels). Desktop:
  // in-flow sticky rail that collapses to icons.
  const expanded = isMobile || open;

  /**
   * Is there room for the Find links INLINE in the top bar?
   *
   * Between 768 and roughly 1000px there was not, and the bar simply
   * overflowed: the desktop sidebar still renders below 768's mobile
   * breakpoint, so `main` loses 236px while the bar still tries to fit a menu
   * button, a search box, both Find links and an avatar carrying a full name.
   * A long name ("Muhammad Zia Ul Haq") pushed it well past the edge.
   *
   * Rather than invent a third layout, fall back to the row-underneath
   * treatment mobile already uses. The arithmetic below is what the bar
   * actually needs, which is why COLLAPSING THE SIDEBAR brings the links back
   * inline — it hands back 158px, and the check notices.
   */
  const sidebarW = isMobile ? 0 : open ? 236 : 78;
  const INLINE_FIND_NEEDS =
    40 + 200 + 270 + 220 + 56; // menu + usable search + both links + avatar + gaps
  const inlineFind = !isMobile && winW - sidebarW - 56 >= INLINE_FIND_NEEDS;
  const disp = expanded ? "inline" : "none";
  const just = expanded ? "flex-start" : "center";
  const asideStyle: CSSProperties = isMobile
    ? { width: 268, background: "#fff", borderRight: `1px solid ${C.line}`, display: "flex", flexDirection: "column", padding: "20px 14px", position: "fixed", left: 0, top: 0, height: "100vh", overflowY: "auto", overflowX: "hidden", overscrollBehavior: "contain", zIndex: 60, transform: mobileOpen ? "translateX(0)" : "translateX(-100%)", transition: "transform .25s ease", boxShadow: mobileOpen ? "0 0 40px rgba(15,23,42,.25)" : "none" }
    : { width: open ? 236 : 78, flex: "none", background: "#fff", borderRight: `1px solid ${C.line}`, display: "flex", flexDirection: "column", padding: "20px 14px", position: "sticky", top: 0, height: "100vh", overflowY: "auto", overflowX: "hidden", overscrollBehavior: "contain", transition: "width .25s ease" };

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: C.bg, fontFamily: FONT, color: C.ink, overflowX: "clip" }}>
      {findHint && <style>{FIND_HINT_CSS}</style>}
      {navigating && (
        <>
          <style>{"@keyframes tz-nav{0%{transform:translateX(-100%)}100%{transform:translateX(250%)}}"}</style>
          <div style={{ position: "fixed", top: 0, left: 0, right: 0, height: 3, zIndex: 100, overflow: "hidden", background: "rgba(99,102,241,.15)" }}>
            <div style={{ width: "40%", height: "100%", background: GRAD, animation: "tz-nav 1s ease-in-out infinite" }} />
          </div>
        </>
      )}
      {isMobile && mobileOpen && <div onClick={() => setMobileOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.4)", zIndex: 55 }} />}
      <aside style={asideStyle}>
        <Link href="/feed" prefetch={false} onClick={navClicked} style={{ display: "flex", alignItems: "center", gap: 9, padding: "4px 10px 18px", justifyContent: just, textDecoration: "none", color: C.ink }}>
          <BrandMark />
          <span style={{ fontSize: 21, fontWeight: 700, letterSpacing: "-0.5px", display: disp }}>topezia</span>
        </Link>

        <nav style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          {NAV.map((nv) => {
            const active = nv.href && pathname === nv.href;
            const count = nv.badge === "network" ? pending : 0;
            const inner = (
              <>
                {/* The icon is wrapped only when there's a count to hang off
                    it — the dot has to stay visible in the collapsed rail,
                    where the label (and so the pill) is display:none. */}
                {count > 0 ? (
                  <span style={{ position: "relative", display: "flex", flex: "none" }}>
                    <Icon name={nv.icon} />
                    {!expanded && (
                      <span style={{
                        position: "absolute", top: -3, right: -4, width: 8, height: 8,
                        borderRadius: "50%", background: "#EF4444", border: "1.5px solid #fff",
                      }} />
                    )}
                  </span>
                ) : (
                  <Icon name={nv.icon} />
                )}
                <span style={{ flex: 1, display: disp }}>{nv.label}</span>
                {count > 0 && expanded && (
                  <span
                    aria-label={`${count} waiting`}
                    style={{
                      background: active ? "rgba(255,255,255,.25)" : "#EF4444",
                      color: "#fff", fontSize: 10.5, fontWeight: 700, borderRadius: 999,
                      padding: "2px 7px", minWidth: 18, textAlign: "center",
                    }}
                  >
                    {/* Past 99 the exact number stops being information. */}
                    {count > 99 ? "99+" : count}
                  </span>
                )}
                {nv.soon && expanded && (
                  <span style={{ background: "#F1F5F9", color: C.mut, fontSize: 9.5, fontWeight: 700, borderRadius: 999, padding: "2px 7px", border: `1px solid ${C.line}` }}>Soon</span>
                )}
              </>
            );
            const base: CSSProperties = {
              display: "flex", alignItems: "center", gap: 11, padding: "10px 12px", borderRadius: 10,
              fontSize: 13.5, justifyContent: just, textDecoration: "none",
            };
            if (nv.href) {
              return (
                <Link key={nv.label} href={nv.href} prefetch={false} onClick={navClicked} title={nv.label} style={{ ...base, background: active ? GRAD : "transparent", color: active ? "#fff" : "#475569", fontWeight: active ? 600 : 500 }}>
                  {inner}
                </Link>
              );
            }
            return (
              <div key={nv.label} title={`${nv.label} — coming soon`} style={{ ...base, color: "#94A3B8", fontWeight: 500, cursor: "default" }}>
                {inner}
              </div>
            );
          })}
        </nav>

        {/* No upsell to someone already paying — Premium members get their
            space back. */}
        {expanded && tier !== "PREMIUM" && (
          <div style={{ flex: "none", margin: "18px 4px 0", background: `linear-gradient(150deg, ${C.navy}, ${C.navy2})`, borderRadius: 14, padding: "18px 16px", color: "#fff", position: "relative", overflow: "hidden" }}>
            <div style={{ position: "absolute", right: -30, top: -30, width: 110, height: 110, borderRadius: "50%", background: "radial-gradient(circle, rgba(139,92,246,.45), transparent 70%)" }} />
            <div style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 5 }}>Unlock full potential</div>
            <div style={{ fontSize: 11.5, color: "#B9C0D4", lineHeight: 1.5, marginBottom: 12 }}>AI insights, unlimited resume versions and more.</div>
            {/* Links to the pricing page — a real checkout when billing is
                live, the honest "not on sale yet" card when it isn't. */}
            <Link href="/pricing" style={{ display: "inline-block", background: GRAD, borderRadius: 9, padding: "8px 14px", fontSize: 12, fontWeight: 600, color: "#fff", textDecoration: "none" }}>See membership →</Link>
          </div>
        )}

        <div style={{ flex: 1 }} />
      </aside>

      <main style={{ flex: 1, minWidth: 0, padding: isMobile ? "14px 16px 40px" : "20px 28px 40px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 22 }}>
          <div onClick={() => (isMobile ? setMobileOpen((o) => !o) : setOpen((o) => !o))} title="Menu" style={{ width: 40, height: 40, flex: "none", background: "#fff", border: `1px solid ${C.line}`, borderRadius: 11, display: "grid", placeItems: "center", cursor: "pointer", color: C.slate }}>
            <Icon name="panel" />
          </div>
          {!isMobile && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const query = searchQ.trim();
                if (query) router.push(`/search?q=${encodeURIComponent(query)}`);
              }}
              style={{ flex: 1, maxWidth: 480, display: "flex", alignItems: "center", gap: 10, background: "#fff", border: `1px solid ${C.line}`, borderRadius: 12, padding: "10px 14px" }}
            >
              <Icon name="search" size={15} color={C.mut} />
              <input
                value={searchQ}
                onChange={(e) => setSearchQ(e.target.value)}
                placeholder="Search jobs, companies…"
                aria-label="Search jobs, companies"
                style={{ flex: 1, minWidth: 0, border: "none", outline: "none", background: "transparent", color: C.ink, fontSize: 13, fontFamily: "inherit" }}
              />
            </form>
          )}
          <div style={{ flex: 1 }} />

          {/* Desktop: inline beside the avatar. Mobile gets its own row below. */}
          {inlineFind && <nav style={{ display: "flex", alignItems: "center", gap: 6, flex: "none" }}>{findLinks(false)}</nav>}

          <AccountMenu />
        </div>

        {/* Whenever they aren't inline they get this row, so they are never
            simply missing — on mobile, and on the tablet widths where the
            sidebar leaves the bar too little room. */}
        {!inlineFind && (
          <nav style={{ display: "flex", gap: 10, marginBottom: 20 }}>{findLinks(true)}</nav>
        )}

        {children}
      </main>
    </div>
  );
}
