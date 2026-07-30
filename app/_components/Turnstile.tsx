"use client";

/**
 * Cloudflare Turnstile, wired the way Supabase expects it.
 *
 * ── Why THIS integration and not a proxy route ───────────────────────────
 * Signup runs client-side straight to Supabase, so there is no request of ours
 * to verify a captcha on. Rather than proxy the whole auth flow through an API
 * route — a refactor of the one path that must never break — this uses
 * Supabase's own captcha support: enable it under Auth → Settings, and Supabase
 * verifies the token server-side on every signUp / signInWithPassword. The
 * enforcement is theirs; this component only produces the token.
 *
 * ── Inert until configured ───────────────────────────────────────────────
 * With no NEXT_PUBLIC_TURNSTILE_SITE_KEY the component renders nothing, loads
 * no script, and callers pass no token — so shipping this changes nothing until
 * the keys exist. Same pattern as Stripe here.
 *
 * ── Both halves have to be switched on together ──────────────────────────
 * Turning captcha on in Supabase WITHOUT setting the site key would break every
 * signup and sign-in, because Supabase would demand a token nothing is
 * producing. Setting the key without enabling Supabase's check is harmless but
 * pointless — a token nobody verifies. Set the key first, deploy, then enable
 * it in Supabase.
 *
 * The CSP has to allow challenges.cloudflare.com in script-src and frame-src —
 * already added in next.config.js.
 */
import { useEffect, useRef } from "react";

export const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";

/** Is the captcha configured? Callers use this to decide whether to block
 *  submission on a token — with no key, there is nothing to wait for. */
export const turnstileEnabled = (): boolean => Boolean(TURNSTILE_SITE_KEY);

const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

interface TurnstileApi {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  remove: (id: string) => void;
}
declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

export default function Turnstile({ onToken }: { onToken: (token: string | null) => void }) {
  const box = useRef<HTMLDivElement>(null);
  // The callback lives in a ref so a parent re-render can't re-run the effect
  // and tear down a widget the visitor is halfway through.
  const cb = useRef(onToken);
  cb.current = onToken;

  useEffect(() => {
    if (!TURNSTILE_SITE_KEY) return;
    let widgetId: string | undefined;
    let cancelled = false;

    function render() {
      if (cancelled || !box.current || !window.turnstile) return;
      widgetId = window.turnstile.render(box.current, {
        sitekey: TURNSTILE_SITE_KEY,
        callback: (token: string) => cb.current(token),
        // A token is single-use and expires. Clearing it on expiry means the
        // form blocks again rather than submitting something Supabase rejects.
        "expired-callback": () => cb.current(null),
        "error-callback": () => cb.current(null),
      });
    }

    if (window.turnstile) {
      render();
    } else {
      // One script tag per document, however many widgets mount.
      const existing = document.querySelector<HTMLScriptElement>("script[data-turnstile]");
      if (existing) {
        existing.addEventListener("load", render);
      } else {
        const s = document.createElement("script");
        s.src = SCRIPT_SRC;
        s.async = true;
        s.defer = true;
        s.dataset.turnstile = "1";
        s.addEventListener("load", render);
        document.head.appendChild(s);
      }
    }

    return () => {
      cancelled = true;
      if (widgetId && window.turnstile) {
        try {
          window.turnstile.remove(widgetId);
        } catch {
          /* already gone */
        }
      }
    };
  }, []);

  if (!TURNSTILE_SITE_KEY) return null;
  return <div ref={box} style={{ marginTop: 12 }} />;
}
