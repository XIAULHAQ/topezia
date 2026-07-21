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

  /**
   * getClaims, not getUser. getUser() validates the token by calling Supabase's
   * auth server — a network round-trip on EVERY request, measured at a large
   * share of the 1.4-2.3s per-call floor. getClaims() verifies the JWT's ES256
   * signature locally against the project's JWKS (confirmed present at
   * /auth/v1/.well-known/jwks.json; fetched once and cached per instance).
   *
   * The part that must not regress: token REFRESH. getClaims() still goes
   * through getSession() first, which refreshes an expired token and persists
   * the rotated cookies through setAll — the exact path whose loss broke
   * sessions when /api was excluded from middleware. Only the signature
   * check moved off the network; the refresh machinery is untouched.
   *
   * Trade accepted: a deleted user's JWT stays valid until it expires (≤1h)
   * where getUser() would have caught it immediately. Every lookup keyed on
   * userId just finds nothing in that window.
   */
  const { data: claimsData } = await supabase.auth.getClaims();
  const user = claimsData?.claims ?? null;

  // Diagnostic: proves from outside whether middleware actually ran for a given
  // path. Excluding /api here once broke sessions silently, and confirming the
  // revert had shipped was otherwise guesswork — nothing about middleware is
  // observable in a response. Carries no user data.
  response.headers.set("x-tz-mw", user ? "2-auth" : "2-anon");

  // ── Auth gate ──
  // These routes need an identity (a Supabase session OR the anonymous
  // profile cookie — "no account needed to start" still holds). Visitors with
  // neither get sent to /login, which carries a prominent "join by uploading
  // your résumé" path to /onboard, and ?next= brings them back here after.
  // NOTE the specificity: "/portfolio/new" only, never "/portfolio". Portfolios
  // are public by product decision — browsing the grid and opening someone's
  // work needs no account, and both are indexed. Only authoring is gated.
  const GATED = ["/feed", "/profile", "/settings", "/saved", "/coach", "/projects", "/portfolio/new", "/portfolio/mine"];
  const { pathname } = request.nextUrl;
  // Editing someone's work is gated; viewing it is not. That can't be expressed
  // as a prefix — "/portfolio" would swallow the public pages — so it is matched
  // explicitly. Gating HERE rather than relying on the page's own redirect()
  // also means the check runs before any page code, and page-level redirect()
  // proved unreliable in this route (it throws correctly, but Next rendered
  // not-found instead of honouring it).
  const isEditRoute = /^\/portfolio\/[^/]+\/edit\/?$/.test(pathname);
  const isGated = isEditRoute || GATED.some((p) => pathname === p || pathname.startsWith(`${p}/`));
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
