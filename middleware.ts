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
  await supabase.auth.getUser();
  return response;
}

export const config = {
  // Run on everything except static assets and the click-out redirect.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|go/).*)"],
};
