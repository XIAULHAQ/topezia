/**
 * User-generated content — the stuff we publish but do not vouch for.
 *
 * Two jobs, one module, because they are the same concern seen from two sides:
 * what we hand to a crawler (`UGC_REL`), and what we let onto a public page in
 * the first place (`scoreUgc`).
 *
 * ── Why this exists ──────────────────────────────────────────────────────
 * A public profile is an indexed page on our domain carrying links a stranger
 * chose. That is the exact shape spam farms automate against: sign up, paste a
 * link, collect a backlink from a real domain. Two defences, layered, because
 * either alone is soft:
 *
 *   1. Remove the payoff. Every user-supplied outbound link is rel="ugc
 *      nofollow", so a link here passes no ranking signal and the whole
 *      exercise is pointless. This is the load-bearing one — it works even
 *      against content that reads perfectly human.
 *   2. Remove the surface. Text that scores as spam keeps its page out of the
 *      index (and, past a high bar, never gets written at all).
 *
 * ── The bias in the thresholds ───────────────────────────────────────────
 * These signals are heuristics over other people's writing, so they are wrong
 * sometimes, and the two ways of being wrong are not symmetric: a false
 * REJECT blocks a real member from describing their own work, while a false
 * REVIEW only withholds a page from Google. So REJECT sits high and needs
 * several independent signals to agree; REVIEW sits low and is used freely.
 *
 * Résumé-derived fields (work history, certifications) are the sharpest case:
 * a genuine CV legitimately carries a phone number and a personal site. Those
 * paths must gate INDEXING on this score, never the write — see the callers.
 *
 * Nothing here is a claim about a person. A score is a routing decision about
 * a page; it is never shown to anyone or stored as a judgement.
 */

/** `rel` for every outbound link whose target a MEMBER chose, not us.
 *
 *  - `ugc` tells a crawler what this is; `nofollow` is what actually withholds
 *    the ranking signal (Google treats both as hints, so we send both).
 *  - `noopener noreferrer` is the unrelated-but-mandatory half: without
 *    `noopener`, a target="_blank" page gets a handle on window.opener and can
 *    navigate ours. */
export const UGC_REL = "ugc nofollow noopener noreferrer";

/** Score at or above which we refuse the write outright. Deliberately high. */
export const SPAM_REJECT = 60;
/** Score at or above which the content may exist but must not be indexed. */
export const SPAM_REVIEW = 30;

export interface UgcVerdict {
  /** 0–100. Not a probability — a sum of weighted signals, capped. */
  score: number;
  /** Which signals fired, for logs and for telling a member what to fix. */
  reasons: string[];
}

/** Nothing suspicious. Shared so callers don't each build an empty object. */
const CLEAN: UgcVerdict = { score: 0, reasons: [] };

/* ── Signal 1: links ──────────────────────────────────────────────────── */

const SCHEME_URL = /\bhttps?:\/\/[^\s<>"']+/gi;
const WWW_URL = /\bwww\.[a-z0-9-]+\.[a-z]{2,}/gi;

/**
 * Bare domains ("buycheap.xyz"), deliberately NOT covering `.io`/`.co`: those
 * collide with how developers write library names (socket.io, next.co) far more
 * often than they appear in spam, and a false link-count on a real portfolio is
 * exactly the error this module is biased against.
 */
const BARE_DOMAIN =
  /\b[a-z0-9][a-z0-9-]{1,61}\.(?:com|net|org|ru|cn|xyz|top|icu|click|link|shop|store|club|vip|bet|casino|loan|online|site|biz|info|pw|tk|ml|ga|cf|gq)\b/gi;

function countLinks(text: string): { total: number; spammy: number } {
  const lower = text.toLowerCase();
  const seen = new Set<string>();
  for (const re of [SCHEME_URL, WWW_URL, BARE_DOMAIN]) {
    for (const m of lower.matchAll(re)) seen.add(m[0].replace(/^https?:\/\//, "").replace(/\/+$/, ""));
  }
  let spammy = 0;
  for (const host of seen) if (SPAM_TLD.test(host.split("/")[0]!)) spammy++;
  return { total: seen.size, spammy };
}

/* ── Signal 2: contact harvesting ─────────────────────────────────────── */

/**
 * A messaging app named next to a handle or a number. The adjacency matters:
 * "we coordinated over WhatsApp" is a normal sentence about a job, while
 * "WhatsApp +92 300 1234567" is a way to move the conversation off-platform,
 * which is how recruitment scams and paid-service spam both operate.
 */
const CONTACT_HANDOFF =
  /\b(?:whats\s?app|telegram|wechat|viber|imo|skype|signal)\b[\s:@,–—-]{0,4}(?:me\b[\s:@,–—-]{0,4})?(?:\+?\d|@[a-z0-9_.]{3,})/i;

/** Loose international/local phone shapes. Weak on its own — a CV has one. */
const PHONE = /(?:\+\d{1,3}[\s.-]?)?(?:\(?\d{2,4}\)?[\s.-]?){2,4}\d{2,4}/;

/* ── Signal 3: keyword classes ────────────────────────────────────────── */

/**
 * Grouped by CLASS, not flattened into one list, so that hitting two unrelated
 * classes compounds. One gambling word in a paragraph is a coincidence;
 * gambling words plus backlink words is a template.
 *
 * Two weights, because the classes are not equally honest. This site's whole
 * audience is people describing their jobs, and some of those jobs are
 * marketing, SEO and iGaming. "seo services", "buy now" and "online casino"
 * are all things a real member writes about real work they were paid to do —
 * so those score 20, enough to withhold indexing, never enough alone to
 * refuse the write. The 45s are idioms with no honest use on a CV: nobody
 * lists "slot gacor" or "replica watches" as a career.
 */
const HARD = 45;
const SOFT = 20;
const KEYWORD_CLASSES: { name: string; weight: number; re: RegExp }[] = [
  // Unambiguous — spam templates, not occupations.
  { name: "academic-fraud", weight: HARD, re: /\b(?:assignment|essay|dissertation|thesis|homework|coursework)\s+(?:help|writing|writer|service)|\bwrite\s+my\s+(?:essay|paper|assignment)\b/i },
  { name: "get-rich", weight: HARD, re: /\b(?:forex\s?signals?|binary\s?options?|make\s+money\s+(?:online|fast)|earn\s+\$\s?\d|passive\s+income\s+guaranteed|bitcoin\s?(?:doubler|investment\s+plan)|crypto\s+investment\s+plan|investment\s+plan\s+guaranteed)\b/i },
  { name: "gambling-spam", weight: HARD, re: /\b(?:slot\s?(?:gacor|online)|judi\s?bola|situs\s?(?:judi|slot)|bandar\s?(?:togel|judi))\b/i },
  { name: "pharma-adult", weight: HARD, re: /\b(?:viagra|cialis|tramadol|oxycodone|escorts?\s+(?:service|in)|call\s?girls?)\b/i },
  { name: "counterfeit", weight: HARD, re: /\b(?:replica\s+(?:watch|handbag|bag)|cheap\s+jerseys|knock-?off\s+designer)\b/i },
  { name: "visa-scam", weight: HARD, re: /\b(?:guaranteed\s+(?:visa|work\s?permit)|100%\s+visa|visa\s+guarantee|free\s+visa\s+sponsorship\s+guaranteed)\b/i },
  // Ambiguous — the vocabulary of real marketing and iGaming careers.
  { name: "link-selling", weight: SOFT, re: /\b(?:backlinks?|guest\s?post(?:ing)?|link\s?building|do-?follow|pbn|serp\s?boost|rank\s?(?:#\s?1|number\s?one)\s+on\s+google|seo\s+(?:services|company|agency|packages|expert))\b/i },
  { name: "hard-sell", weight: SOFT, re: /\b(?:buy\s+now|order\s+now|limited\s+time\s+offer|act\s+now|click\s+here\s+to\s+(?:buy|order)|100%\s+guaranteed|best\s+price\s+guaranteed)\b/i },
  { name: "gambling", weight: SOFT, re: /\b(?:online\s?casino|betting\s?(?:site|tips)|sportsbook)\b/i },
];

/**
 * TLDs with a spam base rate high enough to be a signal on their own.
 *
 * This is the check that separates an SEO consultant from a link farm, because
 * their VOCABULARY is identical — both write "link building" and "backlinks".
 * What differs is where they point: a consultant links their agency on a
 * normal domain, a farm links buyranks.top. Cheap, disposable TLDs almost
 * never appear in a real professional's own portfolio.
 */
const SPAM_TLD = /\.(?:xyz|top|icu|click|link|vip|pw|tk|ml|ga|cf|gq|bet|casino|loan|work|men|stream)\b/i;

/* ── Signal 4: obfuscation ────────────────────────────────────────────── */

/** Zero-width and direction-override characters: invisible in a browser, so
 *  their only purpose in user text is to break a filter that reads it. */
const INVISIBLE = /[​-‏‪-‮⁠-⁤﻿­]/;

/**
 * A Latin word carrying a Cyrillic lookalike ("раypal" — the a and р are not
 * the ones you think). Adjacency inside a word is the discriminator: a profile
 * legitimately written as "Дмитрий Ivanov" has a space and never matches.
 *
 * Cyrillic ONLY, deliberately. Greek has homoglyphs too (ο, ρ), but it also
 * has honest technical uses that sit flush against Latin letters — "μs",
 * "σx", "λx" — and blocking a real engineer's CV to catch a rarer trick is the
 * wrong side of this module's error budget.
 */
const MIXED_SCRIPT = /[a-z][Ѐ-ӿ]|[Ѐ-ӿ][a-z]/i;

/* ── Signal 5–7: shape ────────────────────────────────────────────────── */

const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu;

/**
 * Function words, excluded before measuring repetition. Without this the
 * signal fires on ordinary English — "the" is legitimately a fifth of a
 * sentence. Content nouns a CV repeats honestly ("team", "years") are NOT
 * listed: they don't reach the threshold in real writing, which the
 * production-text check confirms.
 */
const STOPWORDS = new Set([
  "the", "and", "for", "with", "that", "this", "from", "they", "have", "has", "had", "been", "were", "was",
  "their", "which", "would", "about", "into", "more", "than", "when", "some", "then", "them", "will", "also",
  "over", "only", "such", "most", "many", "other", "our", "its", "his", "her", "not", "but", "all", "can",
  "are", "you", "your", "who", "how", "where", "each", "both", "any", "per", "via", "out", "off", "new",
]);

/**
 * Share of the most-repeated content word — keyword stuffing.
 *
 * Counts words of 3+ letters (minus stopwords) rather than 4+, because the
 * payload term is often short: "seo seo seo" is the canonical case and would
 * slip straight through a 4-character floor.
 */
function repetitionShare(text: string): { share: number; count: number } {
  const words = (text.toLowerCase().match(/\b[a-z]{3,}\b/g) ?? []).filter((w) => !STOPWORDS.has(w));
  if (words.length < 12) return { share: 0, count: 0 };
  const freq = new Map<string, number>();
  for (const w of words) freq.set(w, (freq.get(w) ?? 0) + 1);
  let count = 0;
  for (const n of freq.values()) if (n > count) count = n;
  return { share: count / words.length, count };
}

function shoutShare(text: string): number {
  const letters = text.match(/[a-zA-Z]/g) ?? [];
  if (letters.length < 25) return 0;
  return letters.filter((c) => c >= "A" && c <= "Z").length / letters.length;
}

/* ── The scorer ───────────────────────────────────────────────────────── */

export interface ScoreOptions {
  /**
   * True for fields where a link is normal and expected (a portfolio
   * description, a publication abstract). Halves the link weighting rather
   * than removing it — three links in a sentence is still three links.
   */
  linksExpected?: boolean;
}

/**
 * Score a blob of member-written text. Pass everything the page will show,
 * joined — signals compound across fields, and a spammer who splits a payload
 * across a name and a headline should not score twice as clean.
 */
export function scoreUgc(text: string, opts: ScoreOptions = {}): UgcVerdict {
  const raw = (text ?? "").trim();
  if (raw.length < 8) return CLEAN;

  // Every signal carries its weight, so `reasons` can be ordered by how much
  // each actually contributed. The first reason is what we show a member when
  // we refuse — it has to be the damning one, not whichever check ran first.
  const hits: { weight: number; reason: string }[] = [];
  const hit = (weight: number, reason: string) => hits.push({ weight, reason });

  // 1. Links. Weighted by count, not just presence: one link is a portfolio,
  //    five is a directory listing.
  const { total: links, spammy } = countLinks(raw);
  if (links > 1) {
    const base = links === 2 ? 14 : links === 3 ? 26 : 40;
    hit(opts.linksExpected ? Math.round(base / 2) : base, `${links} links`);
  } else if (links === 1 && !opts.linksExpected) {
    hit(5, "a link");
  }
  // Where they point, not just how many. NOT halved by linksExpected — a
  // portfolio is expected to link its own work, never a disposable domain.
  if (spammy > 0) {
    hit(Math.min(40, spammy * 25), `${spammy === 1 ? "a link" : `${spammy} links`} to a throwaway domain`);
  }

  // 2. Moving the conversation off-platform.
  if (CONTACT_HANDOFF.test(raw)) {
    hit(30, "a messaging handle or number attached to a chat app");
  } else if (PHONE.test(raw) && links > 0) {
    // A number alone is a CV. A number ALONGSIDE links is a listing.
    hit(10, "a phone number alongside links");
  }

  // 3. Keyword classes. Capped at 70 so vocabulary alone can reject only when
  //    two unambiguous classes agree — never on the ambiguous ones.
  const classes = KEYWORD_CLASSES.filter((c) => c.re.test(raw));
  if (classes.length) {
    hit(
      Math.min(70, classes.reduce((n, c) => n + c.weight, 0)),
      `promotional wording (${classes.map((c) => c.name).join(", ")})`
    );
  }

  // 4. Characters whose only use is defeating a reader — human or machine.
  //    Weighted so either one ALONE reaches the review bar: unlike a keyword,
  //    these have no innocent explanation, they are evasion by construction.
  if (INVISIBLE.test(raw)) hit(30, "invisible or direction-override characters");
  if (MIXED_SCRIPT.test(raw)) hit(30, "lookalike characters from mixed scripts");

  // 5. Keyword stuffing.
  const rep = repetitionShare(raw);
  if (rep.share > 0.2 && rep.count >= 5) hit(20, "one word repeated throughout");

  // 6–7. Shape. Small weights: these are how spam often looks, but also how an
  //      enthusiastic real person sometimes writes.
  if (shoutShare(raw) > 0.6) hit(10, "mostly capitals");
  if ((raw.match(EMOJI) ?? []).length >= 8 || /!{4,}/.test(raw)) hit(10, "an emoji or punctuation flood");

  hits.sort((a, b) => b.weight - a.weight);
  return {
    score: Math.min(100, hits.reduce((n, h) => n + h.weight, 0)),
    reasons: hits.map((h) => h.reason),
  };
}

/** Convenience: score several fields as one document, skipping empties. */
export function scoreUgcFields(fields: (string | null | undefined)[], opts?: ScoreOptions): UgcVerdict {
  return scoreUgc(fields.filter(Boolean).join("\n"), opts);
}

/** Refuse the write. High bar — needs several signals to agree. */
export const isSpam = (v: UgcVerdict): boolean => v.score >= SPAM_REJECT;

/** Publish it, but keep it out of the index. Low bar, used freely. */
export const isSuspect = (v: UgcVerdict): boolean => v.score >= SPAM_REVIEW;

/** What we say when we refuse. Names the trigger so an honest member can fix
 *  it, without publishing the whole ruleset to whoever is probing. */
export function spamMessage(v: UgcVerdict): string {
  const lead = "This looks like promotional content rather than your own work";
  return v.reasons.length ? `${lead} (${v.reasons[0]}). Please edit and try again.` : `${lead}. Please edit and try again.`;
}
