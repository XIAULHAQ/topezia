/**
 * /join/{token} — accepting an invitation to a company's team.
 *
 * The token is read SERVER-side so the page can say which company invited you
 * and to which address before you sign in — an invite that says only "accept"
 * is indistinguishable from a phishing link.
 *
 * What it never does is act on the token by itself. Accepting is a POST to
 * /api/company/invites/accept, which re-checks the token, the expiry, and that
 * the signed-in account's email matches the invited address. A link that
 * joined you to a company just by being opened would make every forwarded
 * email a membership claim.
 *
 * noindex, nofollow: this URL is a capability.
 */
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import SiteNav from "@/app/_components/SiteNav";
import { SiteFooter } from "@/app/_components/SiteChrome";
import { companyLogoUrl } from "@/lib/company/storage";
import JoinClient from "./join-client";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Join a team — Topezia",
  robots: { index: false, follow: false, nocache: true },
};

export default async function JoinPage({ params }: { params: { token: string } }) {
  const invite = await prisma.companyInvite.findUnique({
    where: { token: params.token },
    select: {
      email: true, status: true, expiresAt: true,
      company: { select: { name: true, slug: true, tagline: true, logoPath: true } },
    },
  });

  const state =
    !invite ? "missing"
    : invite.status !== "PENDING" ? "used"
    : invite.expiresAt.getTime() < Date.now() ? "expired"
    : "open";

  return (
    <main style={{ background: "#F1F5F9", minHeight: "100vh", display: "flex", flexDirection: "column", fontFamily: "var(--font-sora), var(--font-jakarta), sans-serif", color: "#0F172A" }}>
      <SiteNav />
      <div style={{ maxWidth: 560, margin: "0 auto", padding: "48px 24px 72px", width: "100%", flex: 1 }}>
        <JoinClient
          token={params.token}
          state={state}
          email={invite?.email ?? null}
          company={invite ? { ...invite.company, logoUrl: companyLogoUrl(invite.company.logoPath) } : null}
        />
      </div>
      <SiteFooter />
    </main>
  );
}
