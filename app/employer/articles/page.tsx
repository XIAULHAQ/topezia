/**
 * /employer/articles — the company's own writing.
 */
import type { Metadata } from "next";
import EmployerShell from "@/app/employer/_components/EmployerShell";
import ArticlesList from "./articles-list";

export const metadata: Metadata = { title: "Articles — Topezia", robots: { index: false } };

export default function EmployerArticlesPage() {
  return (
    <EmployerShell>
      <ArticlesList />
    </EmployerShell>
  );
}
