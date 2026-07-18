import type { Metadata } from "next";
import LegalShell, { H2, P, UL, LI } from "@/app/_components/LegalShell";

export const metadata: Metadata = {
  title: "Cookie Policy — Topezia",
  description: "The cookies Topezia uses, why, and how to control them.",
  alternates: { canonical: "/cookies" },
};

const UPDATED = "19 July 2026";

export default function CookiesPage() {
  return (
    <LegalShell title="Cookie Policy" updated={UPDATED}>
      <P>
        Cookies are small text files a website stores on your device. This policy explains which cookies Topezia uses and how to control them. It supplements our <a href="/privacy" style={{ color: "#8B5CF6" }}>Privacy Policy</a>.
      </P>

      <H2>The cookies we use</H2>
      <P>Topezia only uses <strong>strictly necessary cookies</strong> — the ones required to make the site work. We do <strong>not</strong> use advertising, marketing, or third-party analytics/tracking cookies.</P>
      <UL>
        <LI><strong>Anonymous session cookie</strong> — lets you start using Topezia without an account by remembering your in-progress profile on this browser. Cleared when you sign in (your profile moves to your account).</LI>
        <LI><strong>Authentication cookies</strong> (set by our auth provider, Supabase) — keep you signed in securely between visits.</LI>
      </UL>
      <P>Because these cookies are strictly necessary to provide a service you&apos;ve asked for, most privacy laws (including the EU/UK ePrivacy rules) do not require a consent banner for them. If we ever add analytics or marketing cookies, we will ask for your consent first and update this page.</P>

      <H2>How to control cookies</H2>
      <P>You can block or delete cookies through your browser settings. Note that blocking our necessary cookies will stop you from signing in or keeping an in-progress profile, so the Service may not work.</P>

      <H2>Changes</H2>
      <P>We may update this policy; the &quot;Last updated&quot; date above shows the latest version.</P>

      <H2>Contact</H2>
      <P>Questions about cookies: use the contact details in our <a href="/privacy" style={{ color: "#8B5CF6" }}>Privacy Policy</a>.</P>
    </LegalShell>
  );
}
