/**
 * Refreshes the Supabase auth session on every request and forwards the
 * updated cookies (standard @supabase/ssr Next.js pattern). Without this,
 * server-side `auth.getUser()` can see a stale/expired session.
 */
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

type CookieToSet = { name: string; value: string; options: CookieOptions };

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    }
  );

  // Touch the session so it refreshes if needed.
  const { data: { user } } = await supabase.auth.getUser();

  // ── Auth gate ──
  // These routes need an identity (a Supabase session OR the anonymous
  // profile cookie — "no account needed to start" still holds). Visitors with
  // neither get sent to /login, which carries a prominent "join by uploading
  // your résumé" path to /onboard, and ?next= brings them back here after.
  const GATED = ["/feed", "/profile", "/settings", "/saved", "/coach", "/projects"];
  const { pathname } = request.nextUrl;
  const isGated = GATED.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  if (isGated && !user) {
    // Cookie name mirrors lib/anon-session.ts ANON_COOKIE (inlined: that
    // module imports next/headers, which middleware must not pull in).
    const hasAnon = Boolean(request.cookies.get("topezia_uid")?.value);
    if (!hasAnon) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.search = `?next=${encodeURIComponent(pathname)}`;
      const redirect = NextResponse.redirect(url);
      // Carry any refreshed auth cookies along with the redirect.
      for (const c of response.cookies.getAll()) redirect.cookies.set(c);
      return redirect;
    }
  }

  return response;
}

export const config = {
  /**
   * Page routes only.
   *
   * `api/` is excluded deliberately. Neither thing this middleware does applies
   * to an API request: every GATED entry above is a page path, so the gate
   * never fires for /api/*, and each route handler resolves the session itself
   * through currentIdentity(). Running here as well meant every API call paid
   * TWO network round-trips to Supabase auth — getUser() validates the token
   * against the auth server, it is not a local check. The feed alone fires five
   * API calls, so that was ten auth round-trips per load, and measured as a
   * 1.4-2.3s floor on every endpoint including ones that return an empty list.
   *
   * Session refresh still happens: route handlers can write cookies, and any
   * page navigation passes through here.
   */
  matcher: ["/((?!api/|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|go/).*)"],
};
