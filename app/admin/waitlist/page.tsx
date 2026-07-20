/**
 * Old bookmark: /admin/waitlist → the merged dashboard at /admin.
 * The token query string is preserved so an existing bookmarked URL with
 * ?token=... still authenticates on arrival.
 */
import { redirect } from "next/navigation";

export default function AdminWaitlistRedirect({ searchParams }: { searchParams: { token?: string } }) {
  redirect(searchParams.token ? `/admin?token=${encodeURIComponent(searchParams.token)}` : "/admin");
}
