import type { Metadata } from "next";
import EmployerShell from "../_components/EmployerShell";
import InquiriesClient from "./inquiries-client";

export const metadata: Metadata = { title: "Inbox — Topezia", robots: { index: false } };

export default function EmployerInquiriesPage() {
  return (
    <EmployerShell>
      <InquiriesClient />
    </EmployerShell>
  );
}
