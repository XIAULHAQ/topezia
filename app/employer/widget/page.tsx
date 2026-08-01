import type { Metadata } from "next";
import EmployerShell from "../_components/EmployerShell";
import WidgetClient from "./widget-client";

export const metadata: Metadata = { title: "Site chat — Topezia", robots: { index: false } };

export default function EmployerWidgetPage() {
  return (
    <EmployerShell>
      <WidgetClient />
    </EmployerShell>
  );
}
