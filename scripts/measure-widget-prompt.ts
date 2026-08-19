/**
 * How many input tokens does a widget reply cost, and where do they go?
 *
 *   npx tsx scripts/measure-widget-prompt.ts [--domain=rodeo.graphics]
 *
 * Runs the real retrieval for a few typical questions, builds the prompt
 * exactly as answerFromSite does (lib/widget/answer.ts buildWidgetPrompt),
 * and counts tokens with the free count_tokens endpoint — no model call, no
 * cost rows. Run before and after any prompt edit; strategy §3.6.
 */
import { prisma } from "@/lib/prisma";
import { embedText } from "@/lib/ingestion/embed";
import { llmCountTokens } from "@/lib/llm";
import { buildWidgetPrompt, RETRIEVE_K, type ChatTurn } from "@/lib/widget/answer";

const QUESTIONS = [
  "how much are vinyl banners?",
  "what are your opening hours?",
  "do you do rush orders?",
  "can you design a logo for me?",
  "I need 3 banners for a rodeo in October, can you help?",
];

async function main() {
  const domainArg = process.argv.find((a) => a.startsWith("--domain="));
  const domain = domainArg ? domainArg.split("=")[1] : "rodeo.graphics";
  const site = await prisma.widgetSite.findFirst({
    where: { domain },
    select: { id: true, domain: true, checkoutPath: true, storeKind: true, company: { select: { name: true } } },
  });
  if (!site) throw new Error(`no site ${domain}`);
  const s = { domain: site.domain, companyName: site.company.name, checkoutPath: site.checkoutPath, storeKind: site.storeKind };

  let totalIn = 0, totalSys = 0;
  for (const q of QUESTIONS) {
    const e = await embedText(q);
    const v = `[${e!.join(",")}]`;
    const [chunks, products, facts] = await Promise.all([
      prisma.$queryRawUnsafe<{ url: string; title: string; content: string; distance: number }[]>(
        `SELECT url, title, content, (embedding <=> $1::vector) AS distance FROM "SiteChunk" WHERE "siteId" = $2 AND embedding IS NOT NULL ORDER BY embedding <=> $1::vector LIMIT ${RETRIEVE_K}`, v, site.id),
      prisma.$queryRawUnsafe<{ url: string; name: string; price: string | null; image: string | null; description: string; externalId: string | null; buyable: boolean; variations: unknown; distance: number }[]>(
        `SELECT url, name, price, image, description, "externalId", buyable, variations, (embedding <=> $1::vector) AS distance FROM "SiteProduct" WHERE "siteId" = $2 AND embedding IS NOT NULL ORDER BY embedding <=> $1::vector LIMIT 6`, v, site.id),
      prisma.$queryRawUnsafe<{ question: string; answer: string; distance: number }[]>(
        `SELECT question, answer, (embedding <=> $1::vector) AS distance FROM "SiteFact" WHERE "siteId" = $2 AND embedding IS NOT NULL ORDER BY embedding <=> $1::vector LIMIT 3`, v, site.id),
    ]);
    const history: ChatTurn[] = [{ role: "bot", text: `Hi — I'm the ${s.companyName} AI assistant. Ask me anything.` }, { role: "visitor", text: q }];
    const { system, messages } = buildWidgetPrompt({ site: s, opts: { pageUrl: null, contactCaptured: null, order: null }, history, taughtRows: facts.filter((f) => f.distance < 0.7), chunks, productRows: products });
    const [all, sysOnly] = await Promise.all([
      llmCountTokens("widget.answer", { system, messages, max_tokens: 1 }),
      llmCountTokens("widget.answer", { system, messages: [{ role: "user", content: "x" }], max_tokens: 1 }),
    ]);
    totalIn += all; totalSys += sysOnly;
    const excerptChars = (messages.at(-1)!.content as string).length; const shown = ((messages.at(-1)!.content as string).match(/<excerpt /g) ?? []).length;
    console.log(`${String(all).padStart(5)} tokens (system ${sysOnly}, user turn ${all - sysOnly}; ${shown}/${chunks.length} chunks shown, ${excerptChars} chars) — ${q}`);
  }
  console.log(`\navg input tokens: ${Math.round(totalIn / QUESTIONS.length)} (system avg ${Math.round(totalSys / QUESTIONS.length)})`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
