// TEMP diagnostic: notFound() AFTER an await, mimicking a DB lookup.
import { notFound } from "next/navigation";
export const dynamic = "force-dynamic";
export default async function C() {
  await new Promise((r) => setTimeout(r, 10));
  notFound();
}
