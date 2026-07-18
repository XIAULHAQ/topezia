"use client";

/**
 * Global app shell — the left sidebar nav (replacing the old top nav) + the top
 * bar (collapse toggle, search, avatar). Wraps the feed, profile and settings.
 *
 * Honesty: only destinations that actually work are links (Job Feed, My
 * Profile, Settings, Log out). Everything else in the designed nav — Overview,
 * Search Jobs, Saved Jobs, Applications, Resume Builder, Skill Assessment,
 * Career Coach — is shown but marked "Soon" and is non-navigable, so the nav
 * conveys the roadmap without pretending those pages exist.
 */
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { C, GRAD, FONT, Icon, BrandMark } from "./ui";

type NavItem = { icon: string; label: string; href?: string; soon?: boolean };

const NAV: NavItem[] = [
  { icon: "home", label: "Overview", soon: true },
  { icon: "feed", label: "Job Feed", href: "/feed" },
  { icon: "search", label: "Search Jobs", soon: true },
  { icon: "bookmark", label: "Saved Jobs", href: "/saved" },
  { icon: "briefcase", label: "Applications", soon: true },
  { icon: "user", label: "My Profile", href: "/profile" },
  { icon: "doc", label: "Resume Builder", soon: true },
  { icon: "gauge", label: "Skill Assessment", soon: true },
  { icon: "spark", label: "Career Coach", soon: true },
];

function initialsOf(name: string | null): string {
  if (!name) return "You";
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "You";
}

export default function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(true);
  const [name, setName] = useState<string | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);

  useEffect(() => {
    // Self-contained identity: the top-bar avatar needs the signed-in name/photo,
    // and this shell wraps pages that don't otherwise fetch it.
    fetch("/api/profile")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { setName(d?.profile?.fullName ?? null); setPhoto(d?.profile?.photoUrl ?? null); })
      .catch(() => {});
  }, []);

  async function logout() {
    try {
      await createClient().auth.signOut();
    } catch {
      /* anon session — nothing to sign out */
    }
    router.push("/");
  }

  const w = open ? 236 : 78;
  const disp = open ? "inline" : "none";
  const just = open ? "flex-start" : "center";

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: C.bg, fontFamily: FONT, color: C.ink }}>
      <aside style={{ width: w, flex: "none", background: "#fff", borderRight: `1px solid ${C.line}`, display: "flex", flexDirection: "column", padding: "20px 14px", position: "sticky", top: 0, height: "100vh", overflowY: "auto", overflowX: "hidden", transition: "width .25s ease" }}>
        <Link href="/feed" style={{ display: "flex", alignItems: "center", gap: 9, padding: "4px 10px 18px", justifyContent: just, textDecoration: "none", color: C.ink }}>
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
                {nv.soon && open && (
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
                <Link key={nv.label} href={nv.href} title={nv.label} style={{ ...base, background: active ? GRAD : "transparent", color: active ? "#fff" : "#475569", fontWeight: active ? 600 : 500 }}>
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

        {open && (
          <div style={{ flex: "none", margin: "18px 4px 0", background: `linear-gradient(150deg, ${C.navy}, ${C.navy2})`, borderRadius: 14, padding: "18px 16px", color: "#fff", position: "relative", overflow: "hidden" }}>
            <div style={{ position: "absolute", right: -30, top: -30, width: 110, height: 110, borderRadius: "50%", background: "radial-gradient(circle, rgba(139,92,246,.45), transparent 70%)" }} />
            <div style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 5 }}>Unlock full potential</div>
            <div style={{ fontSize: 11.5, color: "#B9C0D4", lineHeight: 1.5, marginBottom: 12 }}>AI insights, unlimited resume versions and more.</div>
            <div style={{ display: "inline-block", background: GRAD, borderRadius: 9, padding: "8px 14px", fontSize: 12, fontWeight: 600, cursor: "default", opacity: 0.95 }}>Upgrade — Soon</div>
          </div>
        )}

        <div style={{ flex: 1 }} />
        <div style={{ display: "flex", flexDirection: "column", gap: 3, borderTop: `1px solid ${C.line}`, paddingTop: 12, marginTop: 14 }}>
          <Link href="/settings" title="Settings" style={{ display: "flex", alignItems: "center", gap: 11, padding: "9px 12px", borderRadius: 10, color: pathname === "/settings" ? C.ink : C.mut, fontSize: 13.5, textDecoration: "none", justifyContent: just, fontWeight: pathname === "/settings" ? 600 : 500 }}>
            <Icon name="settings" /><span style={{ display: disp }}>Settings</span>
          </Link>
          <div onClick={logout} title="Log out" style={{ display: "flex", alignItems: "center", gap: 11, padding: "9px 12px", borderRadius: 10, color: C.mut, fontSize: 13.5, cursor: "pointer", justifyContent: just }}>
            <Icon name="logout" /><span style={{ display: disp }}>Log out</span>
          </div>
        </div>
      </aside>

      <main style={{ flex: 1, minWidth: 0, padding: "20px 28px 40px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 22 }}>
          <div onClick={() => setOpen((o) => !o)} title="Toggle sidebar" style={{ width: 40, height: 40, flex: "none", background: "#fff", border: `1px solid ${C.line}`, borderRadius: 11, display: "grid", placeItems: "center", cursor: "pointer", color: C.slate }}>
            <Icon name="panel" />
          </div>
          <div style={{ flex: 1, maxWidth: 480, display: "flex", alignItems: "center", gap: 10, background: "#fff", border: `1px solid ${C.line}`, borderRadius: 12, padding: "10px 14px", color: C.mut, fontSize: 13 }} title="Search — coming soon">
            <Icon name="search" size={15} />Search jobs, companies…
          </div>
          <div style={{ flex: 1 }} />
          <Link href="/profile" style={{ display: "flex", alignItems: "center", gap: 9, background: "#fff", border: `1px solid ${C.line}`, borderRadius: 999, padding: "4px 14px 4px 4px", textDecoration: "none", color: C.ink }}>
            {photo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photo} alt={name ?? "You"} style={{ width: 32, height: 32, borderRadius: "50%", objectFit: "cover", display: "block" }} />
            ) : (
              <div style={{ width: 32, height: 32, borderRadius: "50%", background: GRAD, color: "#fff", display: "grid", placeItems: "center", fontSize: 12, fontWeight: 700 }}>{initialsOf(name)}</div>
            )}
            {name && <span style={{ fontSize: 13, fontWeight: 600 }}>{name}</span>}
            <Icon name="chev" size={14} />
          </Link>
        </div>
        {children}
      </main>
    </div>
  );
}
