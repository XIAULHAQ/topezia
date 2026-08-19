/**
 * The widget prompt diet's pure parts (lib/widget/answer.ts). Run with:
 *   npx tsx test/widget-prompt.test.ts
 * Token numbers themselves come from scripts/measure-widget-prompt.ts.
 */
import { tidy, selectExcerpts, TOP_K } from "@/lib/widget/answer";

let pass = 0, fail = 0;
const check = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  if (!ok) console.log(`FAIL ${name}: got ${JSON.stringify(got)} want ${JSON.stringify(want)}`);
};

check("tidy collapses blank-line runs", tidy("Heading\n\n\n \n\n \n \n Body text"), "Heading\nBody text");
check("tidy collapses inner spaces", tidy("a   b\t\tc"), "a b c");
check("tidy keeps single newlines", tidy("line one\nline two"), "line one\nline two");
check("tidy strips CR and nbsp runs", tidy("x\r\n  y"), "x\ny");
check("tidy trims", tidy("  \n padded \n "), "padded");

const mk = (url: string, n: number, len = 1000) => ({ url, content: `${url.slice(-1)}${String(n)}`.padEnd(len, "x"), distance: n / 100 });
// per-url cap: the 3rd chunk of one page is skipped in favour of the next page
const sameUrl = [mk("u/a", 1), mk("u/a", 2), mk("u/a", 3), mk("u/b", 4), mk("u/b", 5), mk("u/b", 6), mk("u/c", 7)];
check("per-url cap of 2", selectExcerpts(sameUrl).map((c) => c.url), ["u/a", "u/a", "u/b", "u/b", "u/c"]);
// rank order kept
check("rank order kept", selectExcerpts(sameUrl).map((c) => c.content.slice(0, 2)), ["a1", "a2", "b4", "b5", "c7"]);
// at most TOP_K
const many = Array.from({ length: 12 }, (_, i) => mk(`u/${i}`, i, 500));
check("at most TOP_K", selectExcerpts(many).length, TOP_K);
// total budget: 1500-char chunks → 5 fit in 7500, a 6th would not; smaller later ones can still slot in
const big = Array.from({ length: 8 }, (_, i) => mk(`u/${i}`, i, 1500));
check("budget caps at 5 × 1500", selectExcerpts(big).length, 5);
const mixed = [...Array.from({ length: 5 }, (_, i) => mk(`u/${i}`, i, 1400)), mk("u/x", 9, 3000), mk("u/y", 10, 10)];
check("a small later chunk still fits after a big one is skipped", selectExcerpts(mixed).map((c) => c.url).includes("u/y"), true);
// per-chunk cap 1500 and tidy applied
check("per-chunk cap", selectExcerpts([mk("u/z", 1, 4000)])[0].content.length, 1500);
check("content tidied", selectExcerpts([{ url: "u", content: "a\n\n\n\nb", distance: 0 }])[0].content, "a\nb");
// first chunk always in even if over budget alone
check("first chunk always in", selectExcerpts([mk("u/q", 1, 9000)]).length, 1);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
