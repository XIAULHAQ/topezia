/**
 * /employer/testimonials — client quotes the company adds itself.
 */
import type { Metadata } from "next";
import AppShell from "@/app/_components/AppShell";
import TestimonialsClient from "./testimonials-client";

export const metadata: Metadata = { title: "Testimonials — Topezia", robots: { index: false } };

export default function EmployerTestimonialsPage() {
  return (
    <AppShell>
      <TestimonialsClient />
    </AppShell>
  );
}
