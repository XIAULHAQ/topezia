import { redirect } from "next/navigation";

// TEMPORARY: topezia.com/ has nothing of its own yet — the feed (Slice 3)
// is what belongs here eventually. Until then, send visitors to the one
// public thing that exists: the founding-employer waitlist.
export default function RootPage() {
  redirect("/waitlist");
}
