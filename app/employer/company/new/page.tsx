/**
 * /employer/company/new — creating a company, on its own screen.
 *
 * It used to be a form that unfolded halfway down the CURRENT company's
 * dashboard: you pressed "New company", the top of the page still said Rodeo
 * Graphics with Rodeo's logo and stats, and the only thing that changed was
 * below the fold. Reported, fairly, as "it makes me think the button didn't
 * work".
 *
 * So this page deliberately wears NO company chrome — no rail, no logo, no
 * other company's numbers. Nothing on it belongs to a company that doesn't
 * exist yet, and the one link out says exactly where it goes back to.
 */
import type { Metadata } from "next";
import NewCompanyForm from "./new-company-form";

export const metadata: Metadata = { title: "Create a company — Topezia", robots: { index: false } };

export default function NewCompanyPage() {
  return <NewCompanyForm />;
}
