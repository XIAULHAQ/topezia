"use client";

/**
 * Header nav for the job detail page.
 *
 * The page itself is statically cached (SEO), so it can't know your session
 * server-side without going dynamic. This hydrates after load and shows the
 * right nav: signed-in users get Profile/Settings instead of a "Log in" link
 * that made the page look like it had logged them out. Defaults to the
 * anonymous nav so there's no wrong flash for logged-out visitors.
 */
import { useEffect, useState, type CSSProperties } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

const INDIGO = "#4f46e5";
const MUTED = "#6b7280";

export default function JobNav() {
  const [authed, setAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    createClient().auth.getSession().then(({ data }) => setAuthed(Boolean(data.session)));
  }, []);

  return (
    <header style={S.nav}>
      <Link href="/" style={S.brand}>topezia</Link>
      <div style={S.links}>
        <Link href="/feed" style={S.link}>Feed</Link>
        {authed ? (
          <>
            <Link href="/profile" style={S.link}>Profile</Link>
            <Link href="/settings" style={S.link}>Settings</Link>
          </>
        ) : (
          <Link href="/login" style={S.link}>Log in</Link>
        )}
      </div>
    </header>
  );
}

const S: Record<string, CSSProperties> = {
  nav: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 24px", background: "#fff", borderBottom: "1px solid #ececf2" },
  brand: { fontFamily: "'Sora', sans-serif", fontWeight: 800, fontSize: 22, color: INDIGO, textDecoration: "none" },
  links: { display: "flex", gap: 18, alignItems: "center" },
  link: { color: MUTED, textDecoration: "none", fontSize: 14, fontWeight: 600 },
};
