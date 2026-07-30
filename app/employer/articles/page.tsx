/**
 * /employer/articles — the company's own writing.
 */
import type { Metadata } from "next";
import AppShell from "@/app/_components/AppShell";
import ArticlesList from "./articles-list";

export const metadata: Metadata = { title: "Articles — Topezia", robots: { index: false } };

export default function EmployerArticlesPage() {
  return (
    <AppShell>
      <ArticlesList />
    </AppShell>
  );
}
