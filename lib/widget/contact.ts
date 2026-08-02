/**
 * Reading contact details out of what the visitor actually typed.
 *
 * People do not fill in the card. They answer the assistant in the box that
 * is already in front of them:
 *
 *     Name: Rachel Cash
 *     Email: rachel@example.com
 *     Phone: 405 238 9798
 *
 * or "sure, it's rachel@example.com". Either way those are a lead, and before
 * this existed they were logged as a question and thrown away.
 *
 * DETERMINISTIC ON PURPOSE — regex, not a model. An address is a shape, and
 * asking a model to find one adds cost, latency and the chance of a plausible
 * invention. The model is never told to extract these; it is only told, after
 * the fact, that they were captured, so it stops asking.
 *
 * Everything here is conservative: it would rather find nothing than find the
 * wrong thing. A name it isn't sure of is null, and the owner sees the address
 * and the transcript regardless.
 */

/** Local-part rules are looser than this in the RFC; this is the subset that
 *  survives being typed by a human into a chat box. */
const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,24}/gi;

/** A number the visitor LABELLED as a way to reach them. Trusted down to 7
 *  digits, because they said what it was. */
const PHONE_LABELLED_RE =
  /(?:phone|tel|telephone|mobile|cell|whats\s?app|number|call me|text me|reach me)\b\s*(?:on|at|is)?\s*[:\-]?\s*(\+?\(?\d[\d\s().-]{5,}\d)/i;
/** An unlabelled run. Held to 10-15 digits — real dialable length — so a
 *  price, a year, a quantity and most reference numbers can't qualify. */
const PHONE_BARE_RE = /\+?\(?\d[\d\s().-]{7,}\d/g;

const NAME_LABEL_RE = /(?:^|\n)\s*(?:name|nom|nombre|naam)\s*[:\-]\s*([^\n,;]{2,60})/i;
// Case-insensitive on the LEAD-IN only: the name itself must be capitalised,
// which is most of what separates "I'm Rachel" from "I'm looking".
const NAME_PROSE_RE =
  /\b(?:[Mm]y name(?:'s|s| is)|[Ii] am|[Ii]'m|[Tt]his is)\s+([A-Z][\p{L}'’-]{1,20}(?:\s+[A-Z][\p{L}'’-]{1,20}){0,2})/u;

/** Words that follow "I'm" far more often than a name does. A name that lands
 *  on one of these is dropped — "I'm looking for banners" must never become
 *  a lead called Looking. */
const NOT_A_NAME = new Set([
  "looking", "interested", "trying", "just", "not", "sure", "still", "here", "after",
  "wondering", "asking", "hoping", "needing", "planning", "thinking", "good", "fine",
  "ok", "okay", "sorry", "curious", "new", "back", "done", "ready", "the", "a", "an",
  "in", "on", "at", "with", "from", "for", "about", "my", "our", "your", "his", "her",
  "rachel's", "yes", "no", "maybe", "it", "that", "this", "there",
]);

export type DetectedContact = {
  email: string | null;
  phone: string | null;
  name: string | null;
};

const EMPTY: DetectedContact = { email: null, phone: null, name: null };

/**
 * Details from one message.
 *
 * `siteDomain` suppresses the company's OWN addresses — a visitor quoting
 * "is it info@rodeo.graphics?" is asking a question, not leaving a lead.
 */
export function detectContact(text: string, siteDomain?: string | null): DetectedContact {
  if (!text || text.length > 4000) return EMPTY;

  const own = (siteDomain ?? "").toLowerCase().replace(/^www\./, "");
  const email =
    (text.match(EMAIL_RE) ?? [])
      .map((e) => e.toLowerCase().replace(/[.]+$/, ""))
      .find((e) => {
        const domain = e.slice(e.indexOf("@") + 1);
        return !own || (domain !== own && !domain.endsWith(`.${own}`));
      }) ?? null;

  // Money is never a phone number, however many digits it has.
  const isMoney = (candidate: string) => {
    const at = text.indexOf(candidate);
    return at > 0 && /[$£€¥]\s?$/.test(text.slice(Math.max(0, at - 2), at));
  };
  const digitsOf = (s: string) => s.replace(/\D/g, "").length;

  const labelledPhone = text.match(PHONE_LABELLED_RE)?.[1]?.trim();
  let phone: string | null =
    labelledPhone && digitsOf(labelledPhone) >= 7 && digitsOf(labelledPhone) <= 15 && !isMoney(labelledPhone)
      ? labelledPhone
      : null;
  if (!phone) {
    // 15 is E.164's ceiling; 10 is the floor at which an unlabelled run is
    // more likely a number someone dials than a number someone quoted.
    phone =
      (text.match(PHONE_BARE_RE) ?? [])
        .map((c) => c.trim())
        .find((c) => digitsOf(c) >= 10 && digitsOf(c) <= 15 && !isMoney(c)) ?? null;
  }
  if (phone) phone = phone.slice(0, 30);

  let name: string | null = null;
  const labelled = text.match(NAME_LABEL_RE);
  const prose = labelled ? null : text.match(NAME_PROSE_RE);
  const raw = (labelled?.[1] ?? prose?.[1] ?? "").replace(/\s+/g, " ").trim();
  if (raw) {
    const cleaned = raw
      // A labelled name can arrive with the next field stuck to it.
      .split(/\s(?=(?:email|phone|tel|mobile|cell|service|budget)\b)/i)[0]
      .replace(/[^\p{L}\s'’.-]/gu, "")
      .replace(/\s+/g, " ")
      .trim();
    const words = cleaned.split(" ").filter(Boolean);
    const plausible =
      cleaned.length >= 2 &&
      cleaned.length <= 60 &&
      words.length <= 4 &&
      !NOT_A_NAME.has(words[0].toLowerCase().replace(/[^\p{L}'’]/gu, ""));
    if (plausible) name = cleaned.slice(0, 80);
  }

  return { email, phone, name };
}

/**
 * The same, read across the whole conversation: the newest value of each
 * field wins, because a correction ("sorry, it's rachel@work.com") comes
 * after the mistake. Only the visitor's own turns are read — the assistant
 * quoting an address back is not the visitor giving one.
 */
export function detectContactInChat(
  turns: { role: "visitor" | "bot" | string; text: string }[],
  siteDomain?: string | null
): DetectedContact {
  const found: DetectedContact = { ...EMPTY };
  for (const turn of turns) {
    if (turn.role !== "visitor") continue;
    const hit = detectContact(turn.text, siteDomain);
    if (hit.email) found.email = hit.email;
    if (hit.phone) found.phone = hit.phone;
    if (hit.name) found.name = hit.name;
  }
  return found;
}

/**
 * What the lead's message should say when the details arrived mid-chat rather
 * than through the form.
 *
 * Their own words, always: the first real question they asked is what the
 * owner needs to read, not "visitor shared their details". The contact block
 * itself is skipped — an owner reading back their own captured fields learns
 * nothing — and the full transcript rides along on the inquiry anyway.
 */
export function leadMessageFromChat(turns: { role: string; text: string }[], fallback: string): string {
  const asked = turns
    .filter((t) => t.role === "visitor")
    .map((t) => t.text.trim())
    .filter((t) => t.length >= 20 && !detectContact(t).email);
  const first = asked[0];
  if (!first) return fallback;
  // Their opening question, plus anything substantial they added after it —
  // enough for the owner to reply without opening the transcript.
  const rest = asked.slice(1, 3).filter((t) => t.length >= 40);
  return [first, ...rest].join("\n\n").slice(0, 2000);
}
