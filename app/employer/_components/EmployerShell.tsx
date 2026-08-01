"use client";

/**
 * The employer area's own shell.
 *
 * /employer used to live inside AppShell — the job-seeker's sidebar, with My
 * Profile, Resume Builder, Saved Jobs and My Work down the side. Managing a
 * company from inside a personal job hunt made the two identities look like
 * one thing, and they aren't: a Company is its own entity with its own work,
 * its own writing and its own team, which happens to be OWNED by an account.
 *
 * So this shell shows the COMPANY's identity — its logo, its name, its
 * sections — and offers exactly one route back to the personal side, clearly
 * labelled. Same visual language as AppShell (268px rail, same borders and
 * type) because it is still the same product, not a different one.
 *
 * The one thing it deliberately does NOT do is hide the account: sign-out
 * lives here too, because a shell you can't sign out of forces a detour
 * through a surface this one exists to keep separate.
 */
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { C, GRAD, FONT, Icon, BrandMark } from "@/app/_components/ui";
import { clearClientCaches } from "@/lib/client-cache";
// The canonical path→URL helper. Pure, reads only a NEXT_PUBLIC_ var, so it
// is safe in a client component and beats hardcoding the bucket path here.
import { companyLogoUrl } from "@/lib/company/storage";

type Company = { name: string; slug: string; logoUrl: string | null } | null;

const NAV: { icon: string; label: string; href: string }[] = [
  { icon: "gauge", label: "Overview", href: "/employer" },
  { icon: "mail", label: "Inbox", href: "/employer/inquiries" },
  { icon: "chat", label: "Site chat", href: "/employer/widget" },
  { icon: "image", label: "Work", href: "/employer/work" },
  { icon: "star", label: "Testimonials", href: "/employer/testimonials" },
  { icon: "briefcase", label: "Clients", href: "/employer/clients" },
  { icon: "doc", label: "Articles", href: "/employer/articles" },
  { icon: "user", label: "Team", href: "/employer/team" },
];

export default function EmployerShell({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const [company, setCompany] = useState<Company>(null);
  // null = not known yet. Kept three-valued so the footer doesn't flash a
  // "Log out" that a signed-out visitor never had anything to log out of.
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    fetch("/api/company", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) { setAuthed(false); return; }
        setAuthed(Boolean(d.authed));
        if (!d.company) return;
        // /api/company returns the raw row, so the path is turned into a URL
        // here rather than assumed to have been done server-side.
        setCompany({ name: d.company.name, slug: d.company.slug, logoUrl: companyLogoUrl(d.company.logoPath) });
      })
      .catch(() => setAuthed(false));
  }, []);

  // Close on navigation: Next keeps this mounted across client routing, so
  // without this the mobile panel stays open over the page you just opened.
  useEffect(() => { setMobileOpen(false); }, [pathname]);

  async function signOut() {
    // Same order AppShell uses: clear the client caches BEFORE the session, or
    // the next account to sign in on this browser can be served the last one's
    // cached profile.
    clearClientCaches();
    await createClient().auth.signOut();
    router.push("/");
  }

  return (
    <div style={S.page}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      {mobileOpen && <div className="es-scrim" onClick={() => setMobileOpen(false)} />}

      <aside className={`es-rail${mobileOpen ? " es-rail-open" : ""}`} style={S.rail}>
        {/* Company identity, not the person's. When there is no company yet it
            says so rather than showing an empty chip — the setup prompt is the
            most useful thing that space can hold. */}
        <Link href={company ? `/company/${company.slug}` : "/employer"} style={S.identity}>
          <span style={S.logo}>
            {company?.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={company.logoUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
            ) : (
              <span style={{ fontSize: 13, fontWeight: 800, color: "#fff" }}>
                {company ? company.name.slice(0, 2).toUpperCase() : "?"}
              </span>
            )}
          </span>
          <span style={{ minWidth: 0 }}>
            <span style={S.identityName}>{company?.name ?? "Your company"}</span>
            <span style={S.identityMeta}>{company ? "View public page ↗" : "Not set up yet"}</span>
          </span>
        </Link>

        <nav style={S.nav}>
          {NAV.map((item) => {
            const active = item.href === "/employer" ? pathname === "/employer" : pathname.startsWith(item.href);
            return (
              <Link key={item.href} href={item.href} style={{ ...S.navItem, ...(active ? S.navItemOn : {}) }} aria-current={active ? "page" : undefined}>
                <Icon name={item.icon} size={17} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <Link href="/employer/new" style={S.postBtn}>
          <Icon name="plus" size={16} />
          Post a role
        </Link>

        <div style={S.railFoot}>
          {/* The one route back. Named as a place, not a direction — "Back"
              alone doesn't say what you'd be going back to. */}
          <Link href="/feed" style={S.footLink}>
            <Icon name="feed" size={16} />
            My job search
          </Link>
          {authed && (
            <button type="button" onClick={signOut} style={{ ...S.footLink, background: "none", border: "none", cursor: "pointer", width: "100%", textAlign: "left", fontFamily: "inherit" }}>
              <Icon name="logout" size={16} />
              Log out
            </button>
          )}
          <Link href="/" style={S.brandRow}>
            <BrandMark size={18} />
            <span style={{ fontSize: 12.5, fontWeight: 700, color: C.mut }}>topezia</span>
          </Link>
        </div>
      </aside>

      <div style={S.main}>
        <button type="button" className="es-burger" onClick={() => setMobileOpen(true)} aria-label="Open company menu">
          ☰ <span style={{ marginLeft: 8, fontWeight: 700 }}>{company?.name ?? "Company"}</span>
        </button>
        <div style={S.content}>{children}</div>
      </div>
    </div>
  );
}

const CSS = `
.es-rail{transform:translateX(0)}
.es-burger{display:none}
@media (max-width:1000px){
  .es-rail{position:fixed!important;transform:translateX(-100%);transition:transform .25s ease;z-index:60;box-shadow:none}
  .es-rail-open{transform:translateX(0)!important;box-shadow:0 0 40px rgba(15,23,42,.25)}
  .es-scrim{position:fixed;inset:0;background:rgba(15,23,42,.4);z-index:55}
  .es-burger{display:flex;align-items:center;margin:0 0 18px;background:#fff;border:1px solid #E2E8F0;border-radius:10px;padding:9px 14px;font-size:13.5;color:#334155;cursor:pointer;font-family:inherit}
}
`;

const S: Record<string, CSSProperties> = {
  page: { minHeight: "100vh", background: "#F8FAFC", fontFamily: FONT, color: C.ink, display: "flex" },
  rail: {
    width: 268, flex: "none", background: "#fff", borderRight: `1px solid ${C.line}`,
    display: "flex", flexDirection: "column", padding: "20px 14px",
    position: "sticky", top: 0, height: "100vh", overflowY: "auto", overscrollBehavior: "contain",
  },
  identity: { display: "flex", gap: 11, alignItems: "center", padding: "10px 10px 16px", textDecoration: "none", borderBottom: `1px solid ${C.line}`, marginBottom: 14 },
  logo: { flex: "none", width: 40, height: 40, borderRadius: 11, background: GRAD, display: "grid", placeItems: "center", overflow: "hidden", padding: 3 },
  identityName: { display: "block", fontSize: 14, fontWeight: 800, color: C.ink, letterSpacing: "-0.2px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  identityMeta: { display: "block", fontSize: 11.5, color: C.mut, marginTop: 2 },
  nav: { display: "flex", flexDirection: "column", gap: 2 },
  navItem: { display: "flex", alignItems: "center", gap: 11, padding: "10px 12px", borderRadius: 10, fontSize: 13.5, fontWeight: 600, color: C.slate, textDecoration: "none" },
  navItemOn: { background: "#EEF2FF", color: "#4F46E5" },
  postBtn: { display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 16, background: GRAD, color: "#fff", borderRadius: 11, padding: "11px 16px", fontSize: 13.5, fontWeight: 700, textDecoration: "none" },
  railFoot: { marginTop: "auto", paddingTop: 18, borderTop: `1px solid ${C.line}`, display: "flex", flexDirection: "column", gap: 2 },
  footLink: { display: "flex", alignItems: "center", gap: 11, padding: "10px 12px", borderRadius: 10, fontSize: 13, fontWeight: 600, color: C.mut, textDecoration: "none" },
  brandRow: { display: "flex", alignItems: "center", gap: 8, padding: "12px 12px 4px", textDecoration: "none" },
  main: { flex: 1, minWidth: 0 },
  content: { padding: "30px 28px 70px", maxWidth: 1140, margin: "0 auto" },
};
