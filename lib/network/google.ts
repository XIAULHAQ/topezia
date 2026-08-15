/**
 * Reading a member's Google contacts, once.
 *
 * THE TOKEN IS NEVER STORED. We ask for an ONLINE token (no `access_type=
 * offline`, so Google issues no refresh token at all), spend it on two API
 * calls inside a single request, and drop it. There is nothing to leak, nothing
 * to rotate, and nothing for a member to revoke later beyond the consent grant
 * itself. The cost is that "refresh my contacts" means clicking the button
 * again, which is the correct trade for an address book we do not own.
 *
 * TWO SCOPES, BOTH SENSITIVE.
 *   contacts.readonly        — the saved address book.
 *   contacts.other.readonly  — "other contacts": people the member has
 *                              corresponded with but never saved. This is where
 *                              most real professional contacts actually live,
 *                              and omitting it makes the feature look broken
 *                              for anyone who never curates their contacts.
 *
 * Both are SENSITIVE scopes, not RESTRICTED (Google's restricted list is the
 * Gmail and Drive families). That means OAuth app verification — a justification
 * and a demo video, roughly ten days — but NOT a CASA third-party security
 * assessment and no annual audit. Until verification clears, the consent screen
 * works for accounts added as test users and shows everyone else the
 * "unverified app" warning. See docs/network-google-oauth.md.
 *
 * LIMITED USE. Google's Limited Use policy governs what we may do with what
 * comes back: use it for the user-facing feature, do not transfer it, do not
 * use it for ads, do not let humans read it, and keep it only as long as the
 * feature needs it. That last clause is why ContactImport is encrypted and
 * expires — see prisma/migrations/071_network_connections/migration.sql.
 */
import { randomBytes } from "crypto";
import { NETWORK_LIMITS } from "@/lib/network/doc";
import { siteUrl } from "@/lib/alerts/send";

export const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/contacts.readonly",
  "https://www.googleapis.com/auth/contacts.other.readonly",
] as const;

/** The cookie holding the CSRF state while the member is away at Google. */
export const STATE_COOKIE = "tz_gcontacts_state";

export type ImportedContact = { name: string | null; email: string };

/** True when this deployment can run the flow at all — for showing "not
 *  available here" instead of bouncing the member to a Google error page. */
export function googleContactsConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

export function redirectUri(): string {
  return `${siteUrl()}/api/network/google/callback`;
}

export function newState(): string {
  return randomBytes(24).toString("base64url");
}

/**
 * Where to send the member.
 *
 * `prompt=consent` every time is deliberate: this flow reads an address book,
 * and silently reusing a grant the member forgot they made is exactly the
 * surprise we do not want. `include_granted_scopes` is omitted so this consent
 * cannot quietly widen a token issued for something else.
 */
export function authUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID ?? "",
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: GOOGLE_SCOPES.join(" "),
    state,
    access_type: "online",
    prompt: "consent",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

/** Code → access token. Throws with Google's own words, which are more useful
 *  than anything we could invent. */
export async function exchangeCode(code: string): Promise<string> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      redirect_uri: redirectUri(),
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) throw new Error(`Google token exchange ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as { access_token?: string };
  if (!json.access_token) throw new Error("Google returned no access token");
  return json.access_token;
}

type PeopleResponse = {
  connections?: GooglePerson[];
  otherContacts?: GooglePerson[];
  nextPageToken?: string;
};
type GooglePerson = {
  names?: { displayName?: string }[];
  emailAddresses?: { value?: string }[];
};

/** Walk one People API list endpoint to the end of its pages. */
async function pageThrough(
  token: string,
  url: string,
  key: "connections" | "otherContacts",
  budget: number
): Promise<GooglePerson[]> {
  const out: GooglePerson[] = [];
  let pageToken: string | undefined;

  do {
    const u = new URL(url);
    u.searchParams.set("pageSize", "1000");
    if (pageToken) u.searchParams.set("pageToken", pageToken);

    const res = await fetch(u, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`Google People ${key} ${res.status}: ${await res.text()}`);

    const json = (await res.json()) as PeopleResponse;
    out.push(...(json[key] ?? []));
    pageToken = json.nextPageToken;
  } while (pageToken && out.length < budget);

  return out;
}

/**
 * Both contact sources, normalised, de-duplicated by address, and capped.
 *
 * `truncated` is returned rather than swallowed: a screen that says "we looked
 * at your contacts" while having quietly stopped at 2,000 of 9,000 is lying
 * about what it did.
 */
export async function fetchContacts(
  token: string
): Promise<{ contacts: ImportedContact[]; truncated: boolean }> {
  const budget = NETWORK_LIMITS.MAX_CONTACTS;

  const [saved, other] = await Promise.all([
    pageThrough(
      token,
      "https://people.googleapis.com/v1/people/me/connections?personFields=names,emailAddresses",
      "connections",
      budget
    ),
    pageThrough(
      token,
      "https://people.googleapis.com/v1/otherContacts?readMask=names,emailAddresses",
      "otherContacts",
      budget
    ),
  ]);

  const seen = new Set<string>();
  const contacts: ImportedContact[] = [];
  let skipped = 0;

  for (const person of [...saved, ...other]) {
    const raw = person.emailAddresses?.[0]?.value?.trim().toLowerCase();
    if (!raw || !raw.includes("@")) continue;
    if (seen.has(raw)) continue;
    seen.add(raw);

    if (contacts.length >= budget) { skipped++; continue; }
    contacts.push({ name: person.names?.[0]?.displayName?.trim() || null, email: raw });
  }

  return { contacts, truncated: skipped > 0 };
}
