/**
 * /n/{token} — the invitation someone received by email.
 *
 * Public and account-free to LOOK at: nobody should have to create an account
 * to find out who wanted to connect with them. Accepting needs an account,
 * because a connection needs two of them.
 *
 * noindex: these are private one-time links, not pages for search.
 */
import type { Metadata } from "next";
import AcceptClient from "./accept-client";

export const metadata: Metadata = {
  title: "An invitation to connect — Topezia",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

export default function InvitePage({ params }: { params: { token: string } }) {
  return (
    <main style={{
      minHeight: "100vh", background: "#F7F7FB", padding: "48px 20px",
      fontFamily: "var(--font-jakarta), system-ui, sans-serif",
    }}>
      <div style={{
        fontFamily: "var(--font-sora), sans-serif", fontWeight: 800, fontSize: 22,
        color: "#4f46e5", textAlign: "center", marginBottom: 24,
      }}>
        topezia
      </div>
      <AcceptClient token={params.token} />
    </main>
  );
}
