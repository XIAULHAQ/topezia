/**
 * /employer/testimonials — client quotes the company adds itself.
 */
import type { Metadata } from "next";
import EmployerShell from "@/app/employer/_components/EmployerShell";
import TestimonialsClient from "./testimonials-client";

export const metadata: Metadata = { title: "Testimonials — Topezia", robots: { index: false } };

export default function EmployerTestimonialsPage() {
  return (
    <EmployerShell>
      <TestimonialsClient />
    </EmployerShell>
  );
}
