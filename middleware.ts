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

  // Diagnostic: proves from outside whether middleware actually ran for a given
  // path. Excluding /api here once broke sessions silently, and confirming the
  // revert had shipped was otherwise guesswork — nothing about middleware is
  // observable in a response. Carries no user data.
  response.headers.set("x-tz-mw", user ? "1-auth" : "1-anon");

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
   * `api/` MUST stay in here. It was excluded once as an optimisation — the
   * gate never fires for API paths and each route handler resolves the session
   * itself, so the getUser() call looked like pure waste. It is not.
   *
   * This middleware is the ONLY place that can persist a ROTATED session. When
   * Supabase refreshes an access token it issues a new refresh token and
   * invalidates the old one; the new pair has to be written back to the
   * browser. Route handlers cannot do that through the shared server client —
   * its setAll() throws outside a response context and is swallowed (see
   * lib/supabase/server.ts, which says as much and points here).
   *
   * So with api/ excluded: the feed fires four API calls, one of them refreshes
   * the token, the rotation is lost, and the browser is left holding a refresh
   * token the server has already consumed. The session dies a moment later —
   * signing in worked, then the next gated page bounced the user to /login.
   *
   * Any future attempt at this optimisation has to solve cookie persistence
   * first. Verifying the JWT locally (getClaims) is the safe version, because
   * it removes the network round-trip WITHOUT removing the refresh path.
   */
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|go/).*)"],
};
