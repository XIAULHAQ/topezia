"use client";

/**
 * Global app shell — the left sidebar nav (replacing the old top nav) + the top
 * bar (collapse toggle, search, avatar). Wraps the feed, profile and settings.
 *
 * Honesty: only destinations that actually work are links (Job Feed, My
 * Profile, Career Coach, Settings, Log out). Everything else in the designed
 * nav — Overview, Search Jobs, Applications, Resume Builder, Skill Assessment —
 * is shown but marked "Soon" and is non-navigable, so the nav conveys the
 * roadmap without pretending those pages exist.
 */
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { C, GRAD, FONT, Icon, BrandMark, initials } from "./ui";
import { fetchProfileShared } from "@/lib/fetch-profile";

type NavItem = { icon: string; label: string; href?: string; soon?: boolean };

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
  { icon: "bookmark", label: "Saved Jobs", href: "/saved" },
  { icon: "zap", label: "Saved Projects", href: "/saved/projects" },
  { icon: "briefcase", label: "Applications", soon: true },
  { icon: "doc", label: "Resume Builder", soon: true },
  { icon: "gauge", label: "Skill Assessment", soon: true },
  { icon: "spark", label: "Career Coach", href: "/coach" },
];

const S_menuItem: CSSProperties = {
  display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", borderRadius: 8,
  fontSize: 13.5, fontWeight: 500, color: C.slate, textDecoration: "none", cursor: "pointer",
};

export default function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false); // account dropdown (top-right)
  const [findHint, setFindHint] = useState(false); // one-time pulse on the active Find button
  // With prefetch disabled, a nav click waits a full server round-trip with no
  // feedback — people click 3-4 times thinking it didn't register. This flag
  // paints a progress bar the INSTANT any nav link is clicked.
  const [navigating, setNavigating] = useState(false);
  const [name, setName] = useState<string | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);

  useEffect(() => {
    // Self-contained identity: the top-bar avatar needs the signed-in name/photo,
    // and this shell wraps pages that don't otherwise fetch it.
    // Shared with the page inside the shell — /feed needs the same endpoint,
    // and two parallel calls cost two auth round-trips for one answer.
    fetchProfileShared()
      .then((d) => {
        const pr = d?.profile as { fullName?: string; photoUrl?: string } | null | undefined;
        setName(pr?.fullName ?? null); setPhoto(pr?.photoUrl ?? null);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);
  // Close the drawer + account menu and clear the progress bar on navigation.
  useEffect(() => { setMobileOpen(false); setMenuOpen(false); setNavigating(false); }, [pathname]);

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
    setMenuOpen(false);
    setMobileOpen(false);
    setNavigating(true);
  }

  async function logout() {
    try {
      await createClient().auth.signOut();
    } catch {
      /* anon session — nothing to sign out */
    }
    router.push("/login"); // land on sign-in, not the marketing page
  }

  // Mobile: the sidebar is an off-canvas drawer (always full labels). Desktop:
  // in-flow sticky rail that collapses to icons.
  const expanded = isMobile || open;
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
            const inner = (
              <>
                <Icon name={nv.icon} />
                <span style={{ flex: 1, display: disp }}>{nv.label}</span>
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

        {expanded && (
          <div style={{ flex: "none", margin: "18px 4px 0", background: `linear-gradient(150deg, ${C.navy}, ${C.navy2})`, borderRadius: 14, padding: "18px 16px", color: "#fff", position: "relative", overflow: "hidden" }}>
            <div style={{ position: "absolute", right: -30, top: -30, width: 110, height: 110, borderRadius: "50%", background: "radial-gradient(circle, rgba(139,92,246,.45), transparent 70%)" }} />
            <div style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 5 }}>Unlock full potential</div>
            <div style={{ fontSize: 11.5, color: "#B9C0D4", lineHeight: 1.5, marginBottom: 12 }}>AI insights, unlimited resume versions and more.</div>
            <div style={{ display: "inline-block", background: GRAD, borderRadius: 9, padding: "8px 14px", fontSize: 12, fontWeight: 600, cursor: "default", opacity: 0.95 }}>Upgrade — Soon</div>
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
            <div style={{ flex: 1, maxWidth: 480, display: "flex", alignItems: "center", gap: 10, background: "#fff", border: `1px solid ${C.line}`, borderRadius: 12, padding: "10px 14px", color: C.mut, fontSize: 13 }} title="Search — coming soon">
              <Icon name="search" size={15} />Search jobs, companies…
            </div>
          )}
          <div style={{ flex: 1 }} />

          {/* Desktop: inline beside the avatar. Mobile gets its own row below. */}
          {!isMobile && <nav style={{ display: "flex", alignItems: "center", gap: 6, flex: "none" }}>{findLinks(false)}</nav>}

          <div style={{ position: "relative" }}>
            <button onClick={() => setMenuOpen((o) => !o)} style={{ display: "flex", alignItems: "center", gap: 9, background: "#fff", border: `1px solid ${C.line}`, borderRadius: 999, padding: "4px 14px 4px 4px", cursor: "pointer", color: C.ink, fontFamily: "inherit" }}>
              {photo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={photo} alt={name ?? "You"} style={{ width: 32, height: 32, borderRadius: "50%", objectFit: "cover", objectPosition: "center top", display: "block" }} />
              ) : (
                <div style={{ width: 32, height: 32, borderRadius: "50%", background: GRAD, color: "#fff", display: "grid", placeItems: "center", fontSize: 12, fontWeight: 700 }}>{initials(name)}</div>
              )}
              {name && <span style={{ fontSize: 13, fontWeight: 600 }}>{name}</span>}
              <Icon name="chev" size={14} />
            </button>
            {menuOpen && (
              <>
                <div onClick={() => setMenuOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 40 }} />
                <div style={{ position: "absolute", right: 0, top: "calc(100% + 8px)", zIndex: 41, background: "#fff", border: `1px solid ${C.line}`, borderRadius: 12, boxShadow: "0 12px 32px rgba(15,23,42,.14)", padding: 6, minWidth: 190 }}>
                  {name && <div style={{ padding: "8px 12px 6px", fontSize: 12, color: C.mut, borderBottom: `1px solid ${C.line}`, marginBottom: 4 }}>Signed in as<div style={{ color: C.ink, fontWeight: 700, fontSize: 13 }}>{name}</div></div>}
                  <Link href="/profile/edit" prefetch={false} onClick={navClicked} style={S_menuItem}><Icon name="edit" size={16} />Edit profile</Link>
                  <Link href="/settings" prefetch={false} onClick={navClicked} style={S_menuItem}><Icon name="settings" size={16} />Settings</Link>
                  <div style={{ height: 1, background: C.line, margin: "4px 0" }} />
                  <button onClick={() => { setMenuOpen(false); logout(); }} style={{ ...S_menuItem, width: "100%", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", color: "#b42318" }}><Icon name="logout" size={16} />Log out</button>
                </div>
              </>
            )}
          </div>
        </div>

        {isMobile && (
          <nav style={{ display: "flex", gap: 10, marginBottom: 20 }}>{findLinks(true)}</nav>
        )}

        {children}
      </main>
    </div>
  );
}
