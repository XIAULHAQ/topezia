"use client";

/**
 * The avatar menu in the top-right — and the one place you switch between the
 * things this account IS: you (your job search) and each company you own.
 *
 * It lives here rather than inside AppShell because the employer area needs
 * exactly the same menu. Two copies would drift, and the whole point of the
 * menu is that "which profile am I looking at?" has one answer everywhere.
 *
 * Switching a company sets the active-company cookie server-side
 * (PUT /api/company, see lib/company/active.ts) and then does a FULL
 * navigation — every /employer surface reads that cookie independently on
 * mount, so a client-side transition would leave the sidebar showing one
 * company and the page another.
 *
 * The company list is fetched when the menu first opens, not on page load:
 * nothing else on the page needs it, and a closed menu shouldn't cost a
 * round-trip. The profile comes from the shared cache, so it is free.
 */
import { useEffect, useState, type CSSProperties } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { C, GRAD, Icon, initials } from "./ui";
import { fetchProfileShared, readProfileCache } from "@/lib/fetch-profile";
import { clearClientCaches } from "@/lib/client-cache";

type CompanyOption = { id: string; name: string };

const ITEM: CSSProperties = {
  display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", borderRadius: 8,
  fontSize: 13.5, fontWeight: 500, color: C.slate, textDecoration: "none", cursor: "pointer",
};
const BTN_ITEM: CSSProperties = { ...ITEM, width: "100%", background: "none", border: "none", textAlign: "left", fontFamily: "inherit" };
const GROUP: CSSProperties = { padding: "9px 12px 3px", fontSize: 10.5, fontWeight: 700, color: C.mut, letterSpacing: ".5px", textTransform: "uppercase" };
const TRUNC: CSSProperties = { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 };

export default function AccountMenu() {
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState<string | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  // null = not fetched yet, so the menu can tell "no companies" from "don't
  // know yet" and never flashes "Create company" at someone who has three.
  const [companies, setCompanies] = useState<CompanyOption[] | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  /** True while the person is looking at a company rather than their own side. */
  const onCompany = pathname.startsWith("/employer");

  useEffect(() => {
    const apply = (d: Awaited<ReturnType<typeof fetchProfileShared>>) => {
      const pr = d?.profile as { fullName?: string; photoUrl?: string } | null | undefined;
      if (pr) { setName(pr.fullName ?? null); setPhoto(pr.photoUrl ?? null); }
    };
    apply(readProfileCache());
    fetchProfileShared().then(apply).catch(() => {});
  }, []);

  useEffect(() => { setOpen(false); }, [pathname]);

  useEffect(() => {
    if (!open || companies !== null) return;
    fetch("/api/company", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        setCompanies(Array.isArray(d?.companies) ? d.companies.map((c: CompanyOption) => ({ id: c.id, name: c.name })) : []);
        setActiveId(d?.company?.id ?? null);
      })
      .catch(() => setCompanies([]));
  }, [open, companies]);

  async function openCompany(id: string) {
    if (busy) return;
    setBusy(true);
    setOpen(false);
    if (id !== activeId) {
      await fetch("/api/company", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId: id }),
      }).catch(() => {});
    }
    window.location.href = "/employer";
  }

  async function logout() {
    clearClientCaches(); // this account's dashboard data must not outlive it
    try {
      await createClient().auth.signOut();
    } catch {
      /* anon session — nothing to sign out */
    }
    router.push("/login");
  }

  const active = { background: "#EEF2FF", color: "#4F46E5", fontWeight: 700 };

  return (
    <div style={{ position: "relative", flex: "none" }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        style={{ display: "flex", alignItems: "center", gap: 9, background: "#fff", border: `1px solid ${C.line}`, borderRadius: 999, padding: "4px 14px 4px 4px", cursor: "pointer", color: C.ink, fontFamily: "inherit" }}
      >
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photo} alt={name ?? "You"} style={{ width: 32, height: 32, borderRadius: "50%", objectFit: "cover", objectPosition: "center top", display: "block" }} />
        ) : (
          <div style={{ width: 32, height: 32, borderRadius: "50%", background: GRAD, color: "#fff", display: "grid", placeItems: "center", fontSize: 12, fontWeight: 700 }}>{initials(name)}</div>
        )}
        {/* Capped and ellipsised: "Muhammad Zia Ul Haq" is wider than the bar
            can spare once the sidebar is out, and an untruncated name pushed
            the whole row past the edge. */}
        {name && (
          <span style={{ fontSize: 13, fontWeight: 600, maxWidth: 140, ...TRUNC }}>{name}</span>
        )}
        <Icon name="chev" size={14} />
      </button>

      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 40 }} />
          <div role="menu" style={{ position: "absolute", right: 0, top: "calc(100% + 8px)", zIndex: 41, background: "#fff", border: `1px solid ${C.line}`, borderRadius: 12, boxShadow: "0 12px 32px rgba(15,23,42,.14)", padding: 6, minWidth: 258, maxWidth: 300 }}>
            {name && (
              <div style={{ padding: "8px 12px 6px", fontSize: 12, color: C.mut, borderBottom: `1px solid ${C.line}`, marginBottom: 4 }}>
                Signed in as<div style={{ color: C.ink, fontWeight: 700, fontSize: 13, ...TRUNC }}>{name}</div>
              </div>
            )}

            {/* The switcher proper: you, then each company. The one you are
                looking at right now is marked, so the menu answers "where am
                I?" as well as "where can I go?". */}
            <div style={GROUP}>Viewing as</div>
            <Link href="/feed" style={{ ...ITEM, ...(onCompany ? {} : active) }}>
              <Icon name="user" size={16} />
              <span style={TRUNC}>{name ?? "You"}</span>
              {/* flex:none + nowrap, or a long name squeezes this into two
                  lines ("Job" / "search") instead of shortening the name. */}
              <span style={{ marginLeft: "auto", flex: "none", whiteSpace: "nowrap", fontSize: 11, color: C.mut, fontWeight: 500 }}>Job search</span>
            </Link>
            {(companies ?? []).map((c) => (
              <button key={c.id} type="button" onClick={() => openCompany(c.id)} style={{ ...BTN_ITEM, ...(onCompany && c.id === activeId ? active : { color: C.ink }) }}>
                <Icon name="briefcase" size={16} />
                <span style={TRUNC}>{c.name}</span>
              </button>
            ))}
            {/* Plain anchor on purpose: /employer reads ?new=1 on mount, and a
                client-side Link from /employer to /employer?new=1 would not
                remount it. */}
            <a href="/employer?new=1" style={{ ...ITEM, color: "#4F46E5", fontWeight: 600 }}>
              <Icon name="plus" size={16} />Create company
            </a>

            <div style={{ height: 1, background: C.line, margin: "6px 0 4px" }} />
            <Link href="/profile/edit" prefetch={false} style={ITEM}><Icon name="edit" size={16} />Edit profile</Link>
            <Link href="/settings" prefetch={false} style={ITEM}><Icon name="settings" size={16} />Settings</Link>
            <button type="button" onClick={() => { setOpen(false); void logout(); }} style={{ ...BTN_ITEM, cursor: "pointer", color: "#b42318" }}>
              <Icon name="logout" size={16} />Log out
            </button>
          </div>
        </>
      )}
    </div>
  );
}
