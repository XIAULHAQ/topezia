/**
 * robots.txt, obeyed.
 *
 * Two reasons this exists. It is a requirement of Cloudflare's Verified Bots
 * programme ("obey robots.txt and crawl directives"), which we need so that
 * customers behind a bot firewall aren't forced to weaken it for us. And it
 * is simply correct: a crawler that ignores the one file the web agreed on
 * for saying "not here" has no business calling itself well-behaved.
 *
 * ONE DELIBERATE DEPARTURE, stated plainly. RFC 9309 allows a crawler to
 * treat an unreachable robots.txt (5xx) as "disallow everything". We do not.
 * Every site this crawler touches belongs to someone who asked us to read it
 * — they typed their own domain in, or installed our plugin on their own
 * WordPress. Refusing a consented scan of your own website because your host
 * hiccuped on one file would be pedantry at the customer's expense. Explicit
 * Disallow rules are always obeyed; only the absence of an answer is treated
 * as permission.
 *
 * The parser is the Google/RFC 9309 shape: group by user-agent, most
 * specific group wins, longest matching rule wins within it, `Allow` beats
 * `Disallow` on an equal-length tie.
 */

const UA_TOKEN = "topeziawidget";
const FETCH_TIMEOUT_MS = 6_000;

export type Robots = {
  /** May we fetch this path? */
  allows: (pathname: string) => boolean;
  /** Seconds the site asked us to wait between requests, if it did. */
  crawlDelay: number | null;
  /** Sitemaps declared in robots.txt — often more complete than /sitemap.xml. */
  sitemaps: string[];
};

const ALLOW_ALL: Robots = { allows: () => true, crawlDelay: null, sitemaps: [] };

type Rule = { allow: boolean; pattern: string };

/**
 * A robots pattern to a matcher. `*` is any run of characters, a trailing `$`
 * anchors the end; everything else is literal. Built as a regex from an
 * escaped pattern so a path containing regex metacharacters can't change the
 * meaning of somebody's rule.
 */
function matches(pattern: string, path: string): boolean {
  if (pattern === "") return false;
  const anchored = pattern.endsWith("$");
  const body = anchored ? pattern.slice(0, -1) : pattern;
  const rx = body
    .split("*")
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${rx}${anchored ? "$" : ""}`).test(path);
}

export function parseRobots(text: string): Robots {
  // Groups keyed by user-agent, in file order. A blank line ends a group's
  // agent list, which is what lets several agents share one rule block.
  const groups: { agents: string[]; rules: Rule[]; delay: number | null }[] = [];
  const sitemaps: string[] = [];
  let current: (typeof groups)[number] | null = null;
  let expectingAgents = false;

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.split("#")[0].trim();
    if (!line) continue;
    const idx = line.indexOf(":");
    if (idx < 0) continue;
    const field = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();

    if (field === "sitemap") {
      if (value) sitemaps.push(value);
      continue;
    }
    if (field === "user-agent") {
      if (!current || !expectingAgents) {
        current = { agents: [], rules: [], delay: null };
        groups.push(current);
        expectingAgents = true;
      }
      current.agents.push(value.toLowerCase());
      continue;
    }
    if (!current) continue; // a rule before any user-agent line is nobody's
    expectingAgents = false;
    if (field === "allow") current.rules.push({ allow: true, pattern: value });
    else if (field === "disallow") current.rules.push({ allow: false, pattern: value });
    else if (field === "crawl-delay") {
      const n = Number(value);
      if (Number.isFinite(n) && n >= 0) current.delay = n;
    }
  }

  // Records naming the SAME agent are one group (RFC 9309 §2.2.1), and real
  // files rely on it — Yoast appends its own "User-agent: *" block to a
  // WordPress robots.txt that already has one, so taking only the first
  // would silently ignore half the file.
  const merge = (token: string) => {
    const mine = groups.filter((g) => g.agents.includes(token));
    if (!mine.length) return null;
    return {
      rules: mine.flatMap((g) => g.rules),
      delay: mine.map((g) => g.delay).find((d) => d !== null) ?? null,
    };
  };

  // Most specific wins: our own name beats the wildcard. A group naming us
  // but saying nothing still wins — an empty group is a deliberate
  // "everything is fine for you", not a fallthrough to the wildcard.
  const group = merge(UA_TOKEN) ?? merge("*");
  if (!group) return { ...ALLOW_ALL, sitemaps };

  const rules = group.rules;
  return {
    crawlDelay: group.delay,
    sitemaps,
    allows(pathname: string) {
      let best: Rule | null = null;
      for (const rule of rules) {
        if (!matches(rule.pattern, pathname)) continue;
        if (
          !best ||
          rule.pattern.length > best.pattern.length ||
          // Equal length: Allow wins, per the spec's tie-break.
          (rule.pattern.length === best.pattern.length && rule.allow && !best.allow)
        ) {
          best = rule;
        }
      }
      // "Disallow:" with an empty value means allow — matches() returns false
      // for it, so an empty rule simply never becomes `best`.
      return best ? best.allow : true;
    },
  };
}

/** Fetch and parse a host's robots.txt. Never throws. */
export async function loadRobots(host: string, headers: Record<string, string> = {}): Promise<Robots> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(`https://${host}/robots.txt`, {
      signal: ctrl.signal,
      redirect: "follow",
      headers: { "User-Agent": "TopeziaWidget/1.0 (+https://www.topezia.com)", ...headers },
    });
    if (!res.ok) {
      await res.body?.cancel().catch(() => {});
      // 404 is the common, correct "no rules". 5xx is the departure explained
      // at the top of this file: a consented scan is not blocked by a flaky
      // file, though every explicit Disallow still would be.
      return ALLOW_ALL;
    }
    const text = await res.text();
    // A robots.txt bigger than this is not a robots.txt.
    return parseRobots(text.length > 500_000 ? text.slice(0, 500_000) : text);
  } catch {
    return ALLOW_ALL;
  } finally {
    clearTimeout(timer);
  }
}

/** The path a rule is matched against, query string included. */
export function pathOf(url: string): string {
  try {
    const u = new URL(url);
    return `${u.pathname}${u.search}`;
  } catch {
    return "/";
  }
}
