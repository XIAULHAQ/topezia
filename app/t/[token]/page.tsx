/**
 * /t/{token} — where an invited client writes their testimonial.
 *
 * Read server-side so the page can name the company before anything is typed.
 * A form that says only "write a testimonial" with no idea who for is
 * indistinguishable from a phishing page.
 *
 * No account, no sign-in. The client is doing the company a favour and has no
 * reason to hold a Topezia account; the token is the authorization and the
 * public label claims exactly what that proves and nothing more.
 *
 * noindex, nofollow: this URL is a capability.
 */
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import SiteNav from "@/app/_components/SiteNav";
import { SiteFooter } from "@/app/_components/SiteChrome";
import { companyLogoUrl } from "@/lib/company/storage";
import TestimonialForm from "./testimonial-form";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Write a testimonial — Topezia",
  robots: { index: false, follow: false, nocache: true },
};

export default async function TestimonialInvitePage({ params }: { params: { token: string } }) {
  const invite = await prisma.companyTestimonialInvite.findUnique({
    where: { token: params.token },
    select: {
      status: true, expiresAt: true,
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
      <div style={{ maxWidth: 620, margin: "0 auto", padding: "44px 24px 72px", width: "100%", flex: 1 }}>
        <TestimonialForm
          token={params.token}
          state={state}
          company={invite ? { ...invite.company, logoUrl: companyLogoUrl(invite.company.logoPath) } : null}
        />
      </div>
      <SiteFooter />
    </main>
  );
}
