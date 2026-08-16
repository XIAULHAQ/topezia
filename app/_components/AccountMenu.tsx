"use client";

/**
 * The avatar menu in the top-right — and the one place you switch between the
 * things this account IS: you (your job search) and each company you own.
 *
 * THE BUTTON IS THE PROFILE YOU ARE ON. In the employer area it wears the
 * company's logo and name; everywhere else, your photo and name. That single
 * rule is what keeps the menu short: the current profile never appears inside
 * the list, because you are already looking at it in the button, and the menu
 * holds only the places you can go. An earlier version showed the account
 * name in the button, again as a "signed in as" header, and a third time as a
 * highlighted row — the same name three times, which is what made it feel
 * complicated.
 *
 * It lives here rather than inside AppShell because the employer area needs
 * exactly the same menu. Two copies would drift.
 *
 * Switching a company sets the active-company cookie server-side
 * (PUT /api/company, see lib/company/active.ts) and then does a FULL
 * navigation — every /employer surface reads that cookie independently on
 * mount, so a client-side transition would leave the sidebar showing one
 * company and the page another.
 *
 * The company list is fetched when the menu first opens, not on page load:
 * nothing else on the page needs it, and a closed menu shouldn't cost a
 * round-trip. The profile comes from the shared cache, so it is free. The
 * company shown in the BUTTON is passed in by the employer shell, which has
 * already loaded it — asking for it again here would be a second request for
 * an answer the parent is holding.
 */
import { useEffect, useState, type CSSProperties } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { C, GRAD, Icon, initials } from "./ui";
import { fetchProfileShared, readProfileCache } from "@/lib/fetch-profile";
import { clearClientCaches } from "@/lib/client-cache";
// Pure, reads only a NEXT_PUBLIC_ var — safe in a client component and beats
// hardcoding the storage bucket path here.
import { companyLogoUrl } from "@/lib/company/storage";

type CompanyOption = { id: string; name: string; logoUrl: string | null };

const ITEM: CSSProperties = {
  display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", borderRadius: 8,
  fontSize: 13.5, fontWeight: 500, color: C.slate, textDecoration: "none", cursor: "pointer",
};
const BTN_ITEM: CSSProperties = { ...ITEM, width: "100%", background: "none", border: "none", textAlign: "left", fontFamily: "inherit" };
const TRUNC: CSSProperties = { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 };

export default function AccountMenu({
  /** The company being viewed, when there is one. Supplied by EmployerShell;
   *  absent on the member side, where the profile IS the person. */
  company,
}: {
  company?: { id: string; name: string; logoUrl: string | null } | null;
}) {
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState<string | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  // null = not fetched yet, so the menu can tell "no companies" from "don't
  // know yet" and never flashes "Create company" at someone who has three.
  const [companies, setCompanies] = useState<CompanyOption[] | null>(null);
  const [busy, setBusy] = useState(false);

  /** Which profile the button is wearing. */
  const viewing = pathname.startsWith("/employer") && company ? company : null;

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
      .then((d) =>
        setCompanies(
          Array.isArray(d?.companies)
            ? d.companies.map((c: { id: string; name: string; logoPath: string | null }) => ({
                id: c.id,
                name: c.name,
                logoUrl: companyLogoUrl(c.logoPath),
              }))
            : []
        )
      )
      .catch(() => setCompanies([]));
  }, [open, companies]);

  async function openCompany(id: string) {
    if (busy) return;
    setBusy(true);
    setOpen(false);
    await fetch("/api/company", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ companyId: id }),
    }).catch(() => {});
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

  /** A company's mark: rounded square, contained, white behind it — a logo
   *  cropped into a circle loses half of most wordmarks. */
  const companyMark = (c: { name: string; logoUrl: string | null }, size: number) => (
    <span style={{ flex: "none", width: size, height: size, borderRadius: Math.round(size / 3), background: c.logoUrl ? "#fff" : GRAD, border: c.logoUrl ? `1px solid ${C.line}` : "none", display: "grid", placeItems: "center", overflow: "hidden", padding: c.logoUrl ? 2 : 0 }}>
      {c.logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={c.logoUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
      ) : (
        <span style={{ fontSize: size <= 20 ? 8.5 : 11, fontWeight: 800, color: "#fff" }}>{c.name.slice(0, 2).toUpperCase()}</span>
      )}
    </span>
  );

  const personMark = (size: number) =>
    photo ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={photo} alt="" style={{ flex: "none", width: size, height: size, borderRadius: "50%", objectFit: "cover", objectPosition: "center top", display: "block" }} />
    ) : (
      <span style={{ flex: "none", width: size, height: size, borderRadius: "50%", background: GRAD, color: "#fff", display: "grid", placeItems: "center", fontSize: size <= 20 ? 8.5 : 12, fontWeight: 700 }}>{initials(name)}</span>
    );

  return (
    <div style={{ position: "relative", flex: "none" }}>
      {/* The name is the first thing to go when the bar runs out of room —
          the avatar alone still answers "am I signed in, and as whom". Without
          this the pill plus a call-to-action overflows a 375px phone on the
          public pages, which have no burger to fold into. */}
      <style>{"@media (max-width:600px){.tzam-name{display:none}}"}</style>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        style={{ display: "flex", alignItems: "center", gap: 9, background: "#fff", border: `1px solid ${C.line}`, borderRadius: 999, padding: "4px 14px 4px 4px", cursor: "pointer", color: C.ink, fontFamily: "inherit" }}
      >
        {viewing ? companyMark(viewing, 32) : personMark(32)}
        {/* Capped and ellipsised: "Muhammad Zia Ul Haq" is wider than the bar
            can spare once the sidebar is out, and an untruncated name pushed
            the whole row past the edge. */}
        <span className="tzam-name" style={{ fontSize: 13, fontWeight: 600, maxWidth: 150, ...TRUNC }}>{viewing ? viewing.name : name}</span>
        <Icon name="chev" size={14} />
      </button>

      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 40 }} />
          <div role="menu" style={{ position: "absolute", right: 0, top: "calc(100% + 8px)", zIndex: 41, background: "#fff", border: `1px solid ${C.line}`, borderRadius: 12, boxShadow: "0 12px 32px rgba(15,23,42,.14)", padding: 6, minWidth: 236, maxWidth: 300 }}>
            {/* Where you can go — never where you already are. */}
            {viewing && (
              <Link href="/feed" style={ITEM}>
                {personMark(20)}
                <span style={TRUNC}>{name ?? "You"}</span>
                <span style={{ marginLeft: "auto", flex: "none", whiteSpace: "nowrap", fontSize: 11, color: C.mut }}>Job search</span>
              </Link>
            )}
            {(companies ?? [])
              .filter((c) => c.id !== viewing?.id)
              .map((c) => (
                <button key={c.id} type="button" onClick={() => openCompany(c.id)} style={{ ...BTN_ITEM, color: C.ink }}>
                  {companyMark(c, 20)}
                  <span style={TRUNC}>{c.name}</span>
                </button>
              ))}
            <Link href="/employer/company/new" style={{ ...ITEM, color: "#4F46E5", fontWeight: 600 }}>
              <Icon name="plus" size={16} />Create company
            </Link>

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
