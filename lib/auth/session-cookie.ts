/**
 * "Does this browser look signed in?" — answered synchronously, for the first
 * paint of a statically cached page.
 *
 * Public pages (the marketing site, job pages, public profiles, the chatbot
 * landing page) are cached for SEO, so the server cannot know the session and
 * the markup always ships logged-out. The client then asks Supabase — but
 * `getSession()` can cost a network round-trip when the access token needs
 * refreshing, and until it answers a signed-in member is looking at "Sign in"
 * and "Join free". That is a real, reported bug, not a theoretical flicker.
 *
 * The Supabase auth cookie is not httpOnly, so its PRESENCE is readable
 * immediately. That is all this checks: it is a hint good enough to paint
 * with, never an authorization. Every caller still runs `getSession()` and
 * corrects itself; every server route still verifies the session properly.
 *
 * The `-auth-token-code-verifier` cookie is deliberately NOT matched. It is
 * written during a sign-in attempt and survives signing out, so treating it
 * as a session would show an avatar to logged-out visitors — the mirror
 * image of the bug this exists to fix.
 */
export function hasAuthCookie(): boolean {
  if (typeof document === "undefined") return false;
  return document.cookie
    .split("; ")
    // Supabase splits a large session across `…-auth-token.0`, `.1`, so the
    // numbered suffix counts too.
    .some((c) => /^sb-.+-auth-token(\.\d+)?=/.test(c) && c.split("=").slice(1).join("=").trim().length > 2);
}
