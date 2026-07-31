/**
 * /employer/articles/{id} — the article editor. `new` is the sentinel for
 * "not created yet", exactly as /hq/posts/new is.
 */
import type { Metadata } from "next";
import EmployerShell from "@/app/employer/_components/EmployerShell";
import ArticleEditor from "./article-editor";

export const metadata: Metadata = { title: "Write an article — Topezia", robots: { index: false } };

export default function EmployerArticleEditorPage({ params }: { params: { id: string } }) {
  return (
    <EmployerShell>
      <ArticleEditor articleId={params.id} />
    </EmployerShell>
  );
}
