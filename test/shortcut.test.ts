/**
 * The widget's no-model layer (lib/widget/shortcut.ts). Run with:
 *   npx tsx test/shortcut.test.ts
 *
 * Two kinds of case matter equally: what SHOULD short-circuit, and — more —
 * what must NOT, because a wrong shortcut answers a real question with a
 * canned line. When one of these fails after a table edit, that is the
 * table telling you the edit was too broad.
 */
import { preRetrievalShortcut, taughtShortcut } from "@/lib/widget/shortcut";
import type { ChatTurn } from "@/lib/widget/answer";

let pass = 0, fail = 0;
const check = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  if (!ok) console.log(`FAIL ${name}: got ${JSON.stringify(got)} want ${JSON.stringify(want)}`);
};

const WELCOME: ChatTurn = { role: "bot", text: "Hi! I'm Rodeo Graphics's assistant. Ask me anything." };
const chat = (...texts: string[]): ChatTurn[] => [
  WELCOME,
  ...texts.map((t, i): ChatTurn => (i % 2 === 0 ? { role: "visitor", text: t } : { role: "bot", text: t })),
];
const ctx = { companyName: "Rodeo Graphics" };
const kind = (h: ChatTurn[], c = ctx as Parameters<typeof preRetrievalShortcut>[1]) => preRetrievalShortcut(h, c)?.kind ?? null;

// ── small talk: should fire ────────────────────────────────────────────────
for (const t of ["hi", "Hi!", "hello", "Hey there", "good morning", "HELLO", "hi again", "hola", "Bonjour", "Hallo", "olá", "ciao", "hoi", "👋", "🙏🏽", "thanks", "Thank you!", "thx", "cheers", "ok thanks", "no thanks", "gracias", "merci beaucoup", "danke schön", "obrigada", "grazie mille", "dank je wel", "bye", "goodbye", "that's all", "au revoir", "tschüss"]) {
  check(`smalltalk: "${t}"`, kind(chat(t)), "smalltalk");
}
// Language of the reply follows the phrase.
check("smalltalk: spanish greeting replies in spanish", preRetrievalShortcut(chat("hola"), ctx)?.answer.reply.startsWith("¡Hola!"), true);
check("smalltalk: greeting names the company", preRetrievalShortcut(chat("hi"), ctx)?.answer.reply.includes("Rodeo Graphics"), true);
check("smalltalk: never a handoff", preRetrievalShortcut(chat("thanks"), ctx)?.answer.handoff, false);

// ── small talk: acknowledgements only when the bot didn't just ask ────────
check("ack after a statement fires", kind(chat("do you ship?", "Yes, we ship worldwide.", "ok")), "smalltalk");
check("ack after a question does NOT fire", kind(chat("do you ship?", "Yes — would you like the rates for your country?", "ok")), null);
check("'sure' after a question does NOT fire", kind(chat("I need banners", "Shall I pass this to the team?", "sure")), null);
check("'great' after a question does NOT fire", kind(chat("I need banners", "Do you need them by Friday?", "great")), null);

// ── small talk: must NOT fire ─────────────────────────────────────────────
for (const t of [
  "hi, do you ship to Canada?", "hello I need 20 banners", "thanks, and how much is delivery?", "ok what about pricing",
  "yes", "no", "hi there what are your hours", "morning coffee?", "bye the way do you do rush orders",
  "hola, tienen tienda en Madrid?", "thanks — one more thing", "later today ok?", "how much", "price?", "🙏 how much is it",
]) {
  check(`no shortcut: "${t}"`, kind(chat(t)), null);
}
// ("hello?" — a lone greeting with a question mark still normalises to "hello".
//  Treated as a greeting on purpose: it's someone checking the bot is there.)
check("hello? is a greeting", kind(chat("hello?")), "smalltalk");
check("'good' alone is an ack (statement before)", kind(chat("do you ship?", "Yes, worldwide.", "good")), "smalltalk");

// ── contact-only ──────────────────────────────────────────────────────────
const cap = { ...ctx, contactCaptured: { name: "Rachel Cash", already: false } };
for (const t of [
  "rachel@example.com",
  "Name: Rachel Cash\nEmail: rachel@example.com\nPhone: 405 238 9798",
  "sure, it's rachel@example.com",
  "my email is rachel@example.com and my number is 405-238-9798",
  "Rachel Cash, rachel@example.com",
  "you can reach me at rachel@example.com thanks",
  "here you go: rachel@example.com",
]) {
  check(`contact-only: ${JSON.stringify(t)}`, kind(chat("I need a quote", "Sure — best email?", t), cap), "contact");
}
check("contact reply uses first name", preRetrievalShortcut(chat("I need a quote", "Sure — best email?", "rachel@example.com"), cap)?.answer.reply.startsWith("Thanks, Rachel —"), true);
check("contact reply is not a handoff", preRetrievalShortcut(chat("rachel@example.com"), cap)?.answer.handoff, false);
// Details PLUS a question → the model (it has to answer the question).
for (const t of [
  "rachel@example.com — do you ship to Ireland?",
  "my email is rachel@example.com. How much for 500 flyers?",
  "rachel@example.com, I need 20 vinyl banners 3x6 by Friday",
  "Rachel Cash rachel@example.com — please send the price list for outdoor signage",
]) {
  check(`contact+question goes to model: ${JSON.stringify(t)}`, kind(chat(t), cap), null);
}
// Not captured (refused / spam window / disposable): never claim the team has it.
check("contact-only but NOT captured → model", kind(chat("rachel@example.com"), ctx), null);
// Spanish labels → Spanish reply.
check("contact-only spanish", preRetrievalShortcut(chat("mi correo es rachel@example.com"), cap)?.answer.reply.startsWith("Gracias"), true);

// ── talk to a person ──────────────────────────────────────────────────────
for (const t of [
  "can I talk to a person?", "I want to speak with a human", "Can I speak to someone please", "talk to a real person",
  "please call me", "can someone call me back?", "I'd like a human", "not a bot please", "human please",
  "quiero hablar con una persona", "je veux parler à quelqu'un", "kann ich mit einem Menschen sprechen?", "posso falar com uma pessoa?",
  "vorrei parlare con una persona", "kan ik met iemand praten?", "put me through to someone",
]) {
  check(`human: "${t}"`, kind(chat(t)), "human");
}
check("human → handoff when no contact yet", preRetrievalShortcut(chat("can I talk to a person?"), ctx)?.answer.handoff, true);
check("human → no handoff when captured", preRetrievalShortcut(chat("call me on 405 238 9798, rachel@example.com"), cap)?.answer.handoff, false);
check("human french reply", preRetrievalShortcut(chat("je veux parler à quelqu'un"), ctx)?.answer.reply.startsWith("Bien sûr"), true);
// Must NOT: questions ABOUT people/contact that the site can answer, or long messages.
for (const t of [
  "who is the person in charge of sales?", "do you have a phone number?", "what's your customer service number?", "is this a human or a bot?",
  "can you tell me about the team?", "how many people work there?",
  "Hi, I'm planning a trade show booth in October and need three 8ft banners, a table cover and 500 flyers. Can someone call me to talk it through? Budget around $2k.",
]) {
  check(`no human shortcut: ${JSON.stringify(t.slice(0, 40))}`, kind(chat(t)), null);
}

// ── order in play: nothing fires ──────────────────────────────────────────
check("order in play: greeting still goes to model", kind(chat("thanks"), { ...ctx, orderInPlay: true }), null);
check("order in play: human intent still goes to model", kind(chat("can I talk to a person"), { ...ctx, orderInPlay: true }), null);
check("order in play: contact-only still goes to model", kind(chat("rachel@example.com"), { ...cap, orderInPlay: true }), null);

// ── taught near-exact ─────────────────────────────────────────────────────
const facts = (d: number) => [{ question: "What are your opening hours?", answer: "We're open 9–5 Monday to Friday.", distance: d }];
check("taught: close match, first turn → served", taughtShortcut(facts(0.08), chat("what are your hours"), {})?.kind ?? null, "taught");
check("taught: reply is the owner's words", taughtShortcut(facts(0.08), chat("what are your hours"), {})?.answer.reply, "We're open 9–5 Monday to Friday.");
check("taught: sources empty, no handoff", taughtShortcut(facts(0.08), chat("q"), {})?.answer, { reply: "We're open 9–5 Monday to Friday.", sources: [], products: [], handoff: false });
check("taught: at threshold → model", taughtShortcut(facts(0.12), chat("q"), {}), null);
check("taught: cross-language distance (0.142) → model", taughtShortcut(facts(0.142), chat("q"), {}), null);
check("taught: far → model", taughtShortcut(facts(0.3), chat("q"), {}), null);
check("taught: second turn still allowed", taughtShortcut(facts(0.08), chat("hi", "Hi!", "hours?"), {})?.kind ?? null, "taught");
check("taught: third turn → model", taughtShortcut(facts(0.08), chat("a", "b", "c", "d", "hours?"), {}), null);
check("taught: order in play → model", taughtShortcut(facts(0.08), chat("q"), { orderInPlay: true }), null);
check("taught: contact captured this turn → model", taughtShortcut(facts(0.08), chat("q"), { contactCaptured: { name: null, already: false } }), null);
check("taught: no facts → model", taughtShortcut([], chat("q"), {}), null);
process.env.WIDGET_TAUGHT_EXACT_DISTANCE = "0.05";
check("taught: env threshold respected", taughtShortcut(facts(0.08), chat("q"), {}), null);
delete process.env.WIDGET_TAUGHT_EXACT_DISTANCE;

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
