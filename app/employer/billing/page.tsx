import type { Metadata } from "next";
import EmployerShell from "../_components/EmployerShell";
import BillingClient from "./billing-client";

export const metadata: Metadata = { title: "Plan — Topezia", robots: { index: false } };

export default function EmployerBillingPage() {
  return (
    <EmployerShell>
      <BillingClient />
    </EmployerShell>
  );
}
