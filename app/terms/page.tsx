import type { Metadata } from "next";
import LegalShell, { H2, P, UL, LI } from "@/app/_components/LegalShell";

export const metadata: Metadata = {
  title: "Terms of Service — Topezia",
  description: "The terms that govern your use of Topezia — accounts, acceptable use, disclaimers and limitations.",
  alternates: { canonical: "/terms" },
};

const UPDATED = "19 July 2026";

export default function TermsPage() {
  return (
    <LegalShell title="Terms of Service" updated={UPDATED}>
      <P>
        These Terms of Service (&quot;Terms&quot;) are a legal agreement between you and Topezia (&quot;Topezia&quot;, &quot;we&quot;, &quot;us&quot;)
        governing your use of topezia.com and related services (the &quot;Service&quot;). By using the Service, you agree to these Terms and to our <a href="/privacy" style={{ color: "#8B5CF6" }}>Privacy Policy</a>. If you don&apos;t agree, don&apos;t use the Service.
      </P>

      <H2>1. Eligibility</H2>
      <P>You must be at least 16 years old (or the minimum age in your country) and able to form a binding contract. If you use the Service on behalf of an organization, you represent that you&apos;re authorized to accept these Terms for it.</P>

      <H2>2. What Topezia does</H2>
      <P>Topezia aggregates publicly posted jobs, reads your résumé, and shows you AI-generated match scores, explanations and skill-gap insights. <strong>Match scores are informational estimates, not guarantees.</strong> We do not employ you, do not guarantee interviews, offers or outcomes, and are not a party to your relationship with any employer. Applications happen on the employer&apos;s own site — we link you out to the original posting.</P>

      <H2>3. Your account</H2>
      <UL>
        <LI>Provide accurate information and keep your account secure; you&apos;re responsible for activity under it.</LI>
        <LI>You can start without an account; once you create one, your earlier session is linked to it.</LI>
        <LI>Notify us of any unauthorized use.</LI>
      </UL>

      <H2>4. Your content</H2>
      <P>You keep all rights to the résumé and information you provide (&quot;Your Content&quot;). You grant us a worldwide, non-exclusive licence to host, process and display Your Content solely to operate the Service for you (for example, to parse it, match you, and — if you choose — publish your public profile). You confirm you have the right to provide Your Content and that it doesn&apos;t infringe anyone&apos;s rights or contain unlawful material.</P>

      <H2>5. Public profiles</H2>
      <P>If you make your profile public, you are responsible for its contents and understand it may be publicly visible and indexed by search engines. You can make it private or delete it at any time from your account.</P>

      <H2>6. Acceptable use</H2>
      <P>You agree not to:</P>
      <UL>
        <LI>scrape, crawl, or bulk-download the Service, or circumvent rate limits or security;</LI>
        <LI>upload content that is unlawful, infringing, deceptive, or that isn&apos;t yours to submit;</LI>
        <LI>impersonate anyone or misrepresent your identity or experience;</LI>
        <LI>use the Service to send spam or to harvest others&apos; data;</LI>
        <LI>interfere with or disrupt the Service or attempt to access it in unauthorized ways.</LI>
      </UL>

      <H2>7. Third-party jobs and links</H2>
      <P>Job listings originate from employers and third-party sources. We work to keep them fresh and verified, but we don&apos;t control them and don&apos;t guarantee that any listing is accurate, current, available, or legitimate. Your dealings with employers and third-party sites are solely between you and them.</P>

      <H2>8. Intellectual property</H2>
      <P>The Service, including its software, design, and branding, is owned by Topezia and protected by law. Except for Your Content, you may not copy, modify, or create derivative works from the Service without our permission.</P>

      <H2>9. Disclaimers</H2>
      <P>The Service is provided &quot;as is&quot; and &quot;as available,&quot; without warranties of any kind, whether express or implied, including merchantability, fitness for a particular purpose, and non-infringement. We do not warrant that the Service will be uninterrupted or error-free, that match scores are accurate, or that using Topezia will result in a job.</P>

      <H2>10. Limitation of liability</H2>
      <P>To the maximum extent permitted by law, Topezia and its suppliers will not be liable for any indirect, incidental, special, consequential or punitive damages, or for lost profits, data, or goodwill, arising from your use of the Service. Our total liability for any claim will not exceed the greater of the amount you paid us in the 12 months before the claim or USD 100. Some jurisdictions don&apos;t allow certain limitations, so some of the above may not apply to you.</P>

      <H2>11. Indemnification</H2>
      <P>You agree to indemnify and hold Topezia harmless from claims arising out of Your Content or your misuse of the Service or violation of these Terms, to the extent permitted by law.</P>

      <H2>12. Termination</H2>
      <P>You can stop using the Service and delete your account anytime. We may suspend or terminate access if you breach these Terms or to protect the Service or other users. Sections that by their nature should survive termination (e.g., IP, disclaimers, liability) will survive.</P>

      <H2>13. Governing law &amp; disputes</H2>
      <P>These Terms are governed by the laws of the State of Wyoming, United States, without regard to conflict-of-laws rules, and disputes will be resolved in the state or federal courts located in Sheridan County, Wyoming. Nothing here removes mandatory consumer-protection rights you have where you live.</P>

      <H2>14. Changes</H2>
      <P>We may update these Terms; we&apos;ll change the &quot;Last updated&quot; date and, for material changes, provide additional notice. Continued use after changes take effect means you accept them.</P>

      <H2>15. Contact</H2>
      <P>Questions about these Terms: <strong>hello@topezia.com</strong> — Topezia, Sheridan County, Sheridan, WY 82801, United States.</P>
    </LegalShell>
  );
}
