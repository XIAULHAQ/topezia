import type { Metadata } from "next";
import AppShell from "@/app/_components/AppShell";
import PostingForm from "./posting-form";

export const metadata: Metadata = { title: "Post a job or project — Topezia", robots: { index: false } };

export default function NewPostingPage() {
  return (
    <AppShell>
      <PostingForm />
    </AppShell>
  );
}
