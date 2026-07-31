import type { Metadata } from "next";
import EmployerShell from "@/app/employer/_components/EmployerShell";
import PostingForm from "./posting-form";

export const metadata: Metadata = { title: "Post a job or project — Topezia", robots: { index: false } };

export default function NewPostingPage() {
  return (
    <EmployerShell>
      <PostingForm />
    </EmployerShell>
  );
}
