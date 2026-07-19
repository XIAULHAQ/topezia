import type { Metadata } from "next";
import LegalShell, { H2, P, UL, LI, Placeholder } from "@/app/_components/LegalShell";

export const metadata: Metadata = {
  title: "Privacy Policy — Topezia",
  description: "How Topezia collects, uses, shares and protects your personal data, and the rights you have under GDPR, UK GDPR and US privacy laws.",
  alternates: { canonical: "/privacy" },
};

const UPDATED = "19 July 2026";

export default function PrivacyPage() {
  return (
    <LegalShell title="Privacy Policy" updated={UPDATED}>
      <P>
        This Privacy Policy explains how Topezia (&quot;Topezia&quot;, &quot;we&quot;, &quot;us&quot;)
        collects, uses, shares and protects your personal data when you use topezia.com and related services (the &quot;Service&quot;).
        We are the data controller for the personal data described here.
      </P>

      <H2>1. Information we collect</H2>
      <P>We only collect what we need to match you to jobs and run the Service:</P>
      <UL>
        <LI><strong>Resume content you provide.</strong> The text of your resume (or the answers to our questionnaire): your name, work history, education, skills, certifications, location, and — if your file contains one — a profile photo. We parse your file in memory and <strong>do not store the original file</strong>; we keep the extracted text, the structured fields, and a small photo thumbnail.</LI>
        <LI><strong>Preferences.</strong> Job type, remote/location preferences, and salary expectations you enter.</LI>
        <LI><strong>Account data.</strong> If you create an account, your email address (authentication is handled by our provider; we never see your password).</LI>
        <LI><strong>Usage data.</strong> Jobs you view, save, or dismiss, and email-alert subscriptions — used to improve your matches.</LI>
        <LI><strong>Technical data.</strong> IP address, device/browser information, and cookies necessary to run the site (see our <a href="/cookies" style={{ color: "#8B5CF6" }}>Cookie Policy</a>).</LI>
      </UL>
      <P>
        Some of this may be considered <strong>sensitive/special-category data</strong> depending on what your resume contains (for example, information revealing your origin or health). Please avoid including sensitive details you don&apos;t want processed; where you do provide them, you consent to our processing them to provide the Service.
      </P>

      <H2>2. How we use your data, and our legal bases</H2>
      <UL>
        <LI><strong>To build your profile and match you to jobs</strong> (parse your resume, compute honest match scores and skill-gap insights) — to <em>perform our contract</em> with you and, before an account exists, on the basis of your <em>consent</em>.</LI>
        <LI><strong>To send job-alert emails</strong> you opt into — on the basis of your <em>consent</em>, which you can withdraw at any time via the unsubscribe link.</LI>
        <LI><strong>To operate, secure and improve the Service</strong> — on the basis of our <em>legitimate interests</em> in running a functional, safe product.</LI>
        <LI><strong>To comply with legal obligations.</strong></LI>
      </UL>
      <P>We do <strong>not</strong> use your data for advertising, and we do <strong>not</strong> sell or &quot;share&quot; your personal information as those terms are defined under US state privacy laws.</P>

      <H2>3. Public profiles</H2>
      <P>
        Topezia can generate a <strong>public profile page</strong> for you at a URL like <code>topezia.com/p/your-name</code>. When public, that page — including your name, photo, headline, experience, skills and education — is visible to anyone with the link and may be indexed by search engines. It never includes your salary expectations or contact details. You can request removal of your public profile at any time (see Section 8); <Placeholder>[if you want profiles to be private/opt-in by default, tell us and we will make that the default]</Placeholder>.
      </P>

      <H2>4. Who we share data with (subprocessors)</H2>
      <P>We share data only with vendors that help us run the Service, under contracts that require them to protect it. We never send your resume or profile to employers. Our key subprocessors are:</P>
      <UL>
        <LI><strong>Vercel</strong> — website hosting.</LI>
        <LI><strong>Supabase</strong> — database and authentication.</LI>
        <LI><strong>Anthropic</strong> — AI model used to parse resumes and generate match explanations. Inputs are processed to return a result and are not used to train their models under our terms.</LI>
        <LI><strong>Voyage AI</strong> — generates the numerical &quot;embeddings&quot; used for matching.</LI>
        <LI><strong>Resend</strong> — sends transactional and job-alert emails.</LI>
      </UL>
      <P>We may also disclose data if required by law, to protect our rights or users&apos; safety, or in connection with a merger or acquisition.</P>

      <H2>5. International transfers</H2>
      <P>
        We are based in / process data primarily in the United States. If you are in the EEA, UK or elsewhere, your data may be transferred to and processed in countries whose laws differ from yours. Where required, we rely on appropriate safeguards such as the European Commission&apos;s Standard Contractual Clauses and the UK International Data Transfer Addendum.
      </P>

      <H2>6. How long we keep it</H2>
      <P>We keep your profile data for as long as your account/profile is active. If you delete your account or ask us to erase your data, we remove your profile, skills, matches and activity (see Section 8). We may retain limited records where the law requires.</P>

      <H2>7. Security</H2>
      <P>We use industry-standard measures (encryption in transit, access controls, a reputable managed database). No system is perfectly secure, but we work to protect your data and will notify you and regulators of a breach where the law requires.</P>

      <H2>8. Your rights</H2>
      <P><strong>Everyone</strong> can, from the <a href="/settings" style={{ color: "#8B5CF6" }}>Settings</a> page, export their data, clear their stored resume text, and delete their account and profile.</P>
      <P>If you are in the <strong>EEA or UK (GDPR / UK GDPR)</strong>, you also have the right to access, rectify, erase, restrict or object to processing, to data portability, and to withdraw consent — without affecting prior processing. You have the right to lodge a complaint with your local supervisory authority.</P>
      <P>If you are a <strong>California resident (CCPA/CPRA)</strong> — or in another US state with a comparable law — you have the right to know what we collect, to access and delete it, to correct it, and to opt out of any &quot;sale&quot; or &quot;sharing&quot; (we do neither). We will not discriminate against you for exercising these rights.</P>
      <P>To exercise any right not covered by Settings, email <strong>hello@topezia.com</strong>. We will verify your request and respond within the timeframe the law requires (generally 30 days under GDPR, 45 days under CCPA).</P>

      <H2>9. Children</H2>
      <P>Topezia is not intended for anyone under 16 (or the minimum age in your country). We do not knowingly collect data from children; if you believe a child has provided us data, contact us and we will delete it.</P>

      <H2>10. Changes to this policy</H2>
      <P>We may update this policy; we will change the &quot;Last updated&quot; date and, for material changes, provide additional notice. Continued use after changes take effect means you accept the updated policy.</P>

      <H2>11. Contact us</H2>
      <P>
        Data controller: Topezia, Sheridan County, Sheridan, WY 82801, United States.
        Privacy contact: <strong>hello@topezia.com</strong>.
        {" "}EEA/UK data protection representative: <Placeholder>[appoint if required under GDPR Art. 27 / UK GDPR]</Placeholder>.
      </P>
    </LegalShell>
  );
}
