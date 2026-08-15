/**
 * Email address parsing and validation — pure, and CLIENT-SAFE.
 *
 * Split out of lib/network/invites.ts for exactly one reason: the invite form
 * is a client component and needs to parse what the member pasted so it can
 * show a count and name the bad lines before anything is sent. invites.ts
 * imports Prisma and the mail sender, so importing it from the browser would
 * drag the database client into the client bundle.
 *
 * Nothing here touches the network or the database. The server parses and
 * validates again on receipt — a browser is not a validator.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export type CheckedEmail = { ok: true; email: string } | { ok: false; error: string };

export function checkEmail(value: unknown): CheckedEmail {
  const email = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!email) return { ok: false, error: "No address given." };
  if (email.length > 254) return { ok: false, error: "That address is too long." };
  if (!EMAIL_RE.test(email)) return { ok: false, error: "That doesn't look like an email address." };
  return { ok: true, email };
}

/**
 * Parse a pasted list of addresses.
 *
 * This is the path for a member who has no Google account, or who simply wants
 * to invite three people without handing over their whole address book — which
 * is most people, most of the time. It has to cope with what actually lands in
 * a textarea, which is whatever a mail client put on the clipboard:
 *
 *   jane@example.com
 *   Jane Doe <jane@example.com>
 *   "Doe, Jane" <jane@example.com>      ← the comma is INSIDE the name
 *   a@x.com, b@y.com; c@z.com
 *
 * Splitting naively on commas breaks the third line, silently inventing a
 * contact called `"Doe` and losing Jane. So quoted and angle-bracketed spans
 * are walked over rather than split inside.
 *
 * Returns entries in input order, de-duplicated by address (first name wins),
 * plus whatever could not be understood, so the UI can say which line was
 * wrong instead of dropping it.
 */
export function parseAddressList(raw: string): {
  contacts: { name: string | null; email: string }[];
  invalid: string[];
} {
  const chunks: string[] = [];
  let current = "";
  let inQuotes = false;
  let inAngles = false;

  for (const ch of raw) {
    if (ch === '"' && !inAngles) { inQuotes = !inQuotes; current += ch; continue; }
    if (ch === "<" && !inQuotes) { inAngles = true; current += ch; continue; }
    if (ch === ">" && !inQuotes) { inAngles = false; current += ch; continue; }
    // A separator only separates when it is not inside a name or an address.
    if ((ch === "," || ch === ";" || ch === "\n") && !inQuotes && !inAngles) {
      chunks.push(current); current = ""; continue;
    }
    current += ch;
  }
  chunks.push(current);

  const contacts: { name: string | null; email: string }[] = [];
  const invalid: string[] = [];
  const seen = new Set<string>();

  for (const chunk of chunks) {
    const text = chunk.trim();
    if (!text) continue;

    // "Name <addr>" — take the bracketed part as the address, the rest as the
    // name. Without brackets the whole chunk should be an address.
    const angled = text.match(/^(.*?)<([^<>]+)>$/);
    const rawEmail = angled ? angled[2]! : text;
    const rawName = angled ? angled[1]! : "";

    const checked = checkEmail(rawEmail);
    if (!checked.ok) { invalid.push(text); continue; }
    if (seen.has(checked.email)) continue;
    seen.add(checked.email);

    const name = rawName.trim().replace(/^"|"$/g, "").trim();
    contacts.push({ name: name || null, email: checked.email });
  }

  return { contacts, invalid };
}
