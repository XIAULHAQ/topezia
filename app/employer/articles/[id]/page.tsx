/**
 * /employer/articles/{id} — the article editor. `new` is the sentinel for
 * "not created yet", exactly as /hq/posts/new is.
 */
import type { Metadata } from "next";
import AppShell from "@/app/_components/AppShell";
import ArticleEditor from "./article-editor";

export const metadata: Metadata = { title: "Write an article — Topezia", robots: { index: false } };

export default function EmployerArticleEditorPage({ params }: { params: { id: string } }) {
  return (
    <AppShell>
      <ArticleEditor articleId={params.id} />
    </AppShell>
  );
}
