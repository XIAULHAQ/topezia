import { parseRobots } from "./lib/widget/robots";

let pass = 0, fail = 0;
const check = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  if (!ok) console.log(`FAIL ${name}: got ${JSON.stringify(got)} want ${JSON.stringify(want)}`);
};

// A typical WordPress robots.txt
const wp = parseRobots(`
User-agent: *
Disallow: /wp-admin/
Allow: /wp-admin/admin-ajax.php

Sitemap: https://example.com/sitemap_index.xml
`);
check("wp: normal page allowed", wp.allows("/about/"), true);
check("wp: admin blocked", wp.allows("/wp-admin/options.php"), false);
check("wp: admin-ajax allowed by longer Allow", wp.allows("/wp-admin/admin-ajax.php"), true);
check("wp: sitemap captured", wp.sitemaps, ["https://example.com/sitemap_index.xml"]);

// Our own name beats the wildcard, even when it says less
const named = parseRobots(`
User-agent: *
Disallow: /

User-agent: TopeziaWidget
Disallow: /private/
Crawl-delay: 2
`);
check("named group wins", named.allows("/shop/"), true);
check("named group's own rule obeyed", named.allows("/private/x"), false);
check("crawl-delay read", named.crawlDelay, 2);

// Blanket block applies when we're not named
const blocked = parseRobots("User-agent: *\nDisallow: /");
check("blanket disallow", blocked.allows("/anything"), false);

// "Disallow:" with no value means allow everything
const empty = parseRobots("User-agent: *\nDisallow:");
check("empty disallow = allow", empty.allows("/anything"), true);

// Wildcards and end-anchors
const wild = parseRobots("User-agent: *\nDisallow: /*.pdf$\nDisallow: /tmp/*/cache");
check("wildcard + anchor blocks", wild.allows("/files/report.pdf"), false);
check("anchor respects suffix", wild.allows("/files/report.pdf?x=1"), true);
check("mid-path wildcard", wild.allows("/tmp/a/cache/y"), false);

// Two agents sharing one block
const shared = parseRobots("User-agent: foo\nUser-agent: *\nDisallow: /nope/");
check("shared group applies to *", shared.allows("/nope/x"), false);

// Regex metacharacters in a rule must stay literal
const meta = parseRobots("User-agent: *\nDisallow: /a+b/");
check("metachars literal (blocks)", meta.allows("/a+b/x"), false);
check("metachars literal (allows)", meta.allows("/aab/x"), true);

// Case-insensitive agent match
const upper = parseRobots("User-agent: TOPEZIAWIDGET\nDisallow: /x/");
check("agent match is case-insensitive", upper.allows("/x/1"), false);

// Comments and junk
const messy = parseRobots("# hi\nUser-agent: *   # all\nDisallow: /a/ # nope\ngarbage line\n");
check("comments stripped", messy.allows("/a/1"), false);
check("junk ignored", messy.allows("/b/1"), true);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
