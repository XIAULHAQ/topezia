/**
 * Disposable / throwaway email domains.
 *
 * ── What this is for ─────────────────────────────────────────────────────
 * The account check in app/p/profile-data.ts asks "is there a real account
 * behind this profile?". A ten-minute mailbox makes that question cheap to
 * answer yes to — which is the whole business model of the services below.
 * Blocking them raises the cost of a profile farm from "free" to "needs a
 * mailbox that survives".
 *
 * ── What this is NOT ─────────────────────────────────────────────────────
 * Not complete, and it cannot be. New throwaway domains appear constantly and
 * some services rotate through hundreds; a static list always trails them. So
 * this is one layer among several, never the thing standing on its own — the
 * nofollow on every member link (lib/ugc.ts) is what actually removes the
 * payoff, and it does not care what address someone signed up with.
 *
 * ── Why the list is curated and short ────────────────────────────────────
 * The big public blocklists run to 100k+ domains and sweep up real providers,
 * privacy-forward relays and small country hosts as collateral. Blocking a
 * real job seeker's real email is worse for this product than admitting a
 * throwaway one, so this stays deliberately narrow: the well-known,
 * unambiguous throwaway services, and nothing that anyone uses for actual mail.
 *
 * Note what is deliberately ABSENT: Apple's iCloud "Hide My Email"
 * (privaterelay.appleid.com), SimpleLogin, DuckDuckGo and Firefox Relay. Those
 * are privacy tools used by people with real inboxes behind them — an alias is
 * not a throwaway, and treating it as one punishes exactly the security-minded
 * users we should want.
 */

/** Well-known throwaway mailbox services. Lowercase, bare registrable domain. */
const DISPOSABLE = new Set([
  "0-mail.com", "10minutemail.com", "10minutemail.net", "20minutemail.com",
  "33mail.com", "guerrillamail.com", "guerrillamail.net", "guerrillamail.org",
  "guerrillamailblock.com", "sharklasers.com", "grr.la", "spam4.me",
  "mailinator.com", "mailinator.net", "mailinator2.com", "notmailinator.com",
  "reallymymail.com", "sogetthis.com", "suremail.info", "veryrealemail.com",
  "tempmail.com", "temp-mail.org", "temp-mail.io", "tempmail.net",
  "tempmailo.com", "tempmail.plus", "tmpmail.org", "tmpmail.net",
  "throwawaymail.com", "throwmail.com", "trashmail.com", "trashmail.net",
  "trashmail.de", "wegwerfmail.de", "wegwerfmail.net", "kurzepost.de",
  "yopmail.com", "yopmail.net", "yopmail.fr", "cool.fr.nf", "jetable.fr.nf",
  "getnada.com", "nada.email", "getairmail.com", "dispostable.com",
  "fakeinbox.com", "fakemailgenerator.com", "maildrop.cc", "mailnesia.com",
  "mintemail.com", "spamgourmet.com", "mytemp.email", "emailondeck.com",
  "moakt.com", "tempr.email", "discard.email", "discardmail.com",
  "mailsac.com", "inboxkitten.com", "harakirimail.com", "mohmal.com",
  "burnermail.io", "emailtemporario.com.br", "einrot.com", "armyspy.com",
  "cuvox.de", "dayrep.com", "fleckens.hu", "gustr.com", "jourrapide.com",
  "rhyta.com", "superrito.com", "teleworm.us", "spambog.com", "spambox.us",
  "mailcatch.com", "mailexpire.com", "mailforspam.com", "mailmetrash.com",
  "mt2015.com", "tempinbox.com", "tempemail.net", "tempemails.net",
  "byom.de", "deadaddress.com", "despam.it", "dodgit.com", "e4ward.com",
  "incognitomail.org", "mailzilla.com", "nervmich.net", "objectmail.com",
  "pookmail.com", "safetymail.info", "sneakemail.com", "spamhole.com",
  "spaml.de", "trbvm.com", "willhackforfood.biz", "yomail.info", "zoemail.com",
]);

/**
 * The registrable domain, roughly — the last two labels.
 *
 * Deliberately crude: it does not consult the public-suffix list, so
 * "foo.co.uk" reduces to "co.uk". That is fine HERE because the set above
 * contains no multi-part suffixes to match against, and the full host is
 * checked first anyway. It exists only so a throwaway service's subdomain
 * ("inbox.mailinator.com") still resolves to the domain we listed.
 */
function registrable(host: string): string {
  const parts = host.split(".");
  return parts.length <= 2 ? host : parts.slice(-2).join(".");
}

/** Is this address on a known throwaway service? Unparseable input is not. */
export function isDisposableEmail(email: string | null | undefined): boolean {
  const at = (email ?? "").trim().toLowerCase().lastIndexOf("@");
  if (at < 1) return false;
  const host = (email ?? "").trim().toLowerCase().slice(at + 1);
  if (!host.includes(".")) return false;
  return DISPOSABLE.has(host) || DISPOSABLE.has(registrable(host));
}

/** What we tell someone at signup. Says why, so an honest person can fix it. */
export const DISPOSABLE_EMAIL_MESSAGE =
  "Please use an email address you can still receive mail at — temporary inboxes can't be used to sign up.";
