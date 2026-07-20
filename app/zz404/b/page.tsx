// TEMP diagnostic: notFound() with force-dynamic (what our real pages use).
import { notFound } from "next/navigation";
export const dynamic = "force-dynamic";
export default async function B() { notFound(); }
