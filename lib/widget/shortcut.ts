/**
 * Answers the widget can give WITHOUT the model — Phase 1 §3.1 of
 * docs/ai-cost-strategy.md.
 *
 * Every message used to cost a retrieval plus a ~6k-token Haiku call, even
 * "hi", even "thanks", even a bare email address the route had already turned
 * into a lead. For those, the model was paraphrasing a sentence we could have
 * written ourselves; this file writes it. Four rules, each returning exactly
 * what the model would have said, or something better:
 *
 *   smalltalk  greetings, thanks, closers, a lone emoji → canned line in the
 *              visitor's own language (detected from the phrase itself).
 *   contact    the message was NOTHING but contact details, and the route has
 *              already taken the lead → the fixed "the team has your details"
 *              sentence (rule 5c of the prompt says exactly this anyway).
 *   human      "can I talk to a person" → handoff, with the fixed handoff copy.
 *   taught     the nearest owner-taught answer is a near-exact match to the
 *              question (checked in answer.ts, after retrieval, because it
 *              needs the embedding) → the owner's own words, verbatim.
 *
 * DELIBERATELY NARROW. A wrong shortcut is worse than a paid model call: it
 * replies to a real question with a canned line. So every matcher is a full-
 * string match on a normalised message, not a "contains", and the two that
 * could plausibly swallow an answer to the bot's own question (acknowledgements
 * like "ok", "great") stand down when the bot's previous turn asked something.
 * When in doubt, return null and let the model earn its keep.
 *
 * NEVER fires when an order lookup is in play — those replies are decided by
 * ORDER_RULES in answer.ts and must stay uniform (see the no_match design).
 */
import type { ChatTurn, WidgetAnswer } from "./answer";

export type ShortcutKind = "smalltalk" | "contact" | "human" | "taught";
export type Shortcut = { kind: ShortcutKind; answer: WidgetAnswer };

type Lang = "en" | "es" | "fr" | "de" | "pt" | "it" | "nl";

/* ── phrase tables ─────────────────────────────────────────────────────────── */

const GREETINGS: Record<Lang, string[]> = {
  en: ["hi", "hello", "hey", "hiya", "heya", "yo", "hi there", "hello there", "hey there", "good morning", "good afternoon", "good evening", "morning", "evening", "hi hi", "hello hello", "hey hey", "hi again", "hello again", "hey again", "helo", "hellow", "hallo there"],
  es: ["hola", "buenos dias", "buenas tardes", "buenas noches", "buenas", "hola hola", "que tal", "hey hola"],
  fr: ["bonjour", "bonsoir", "salut", "coucou", "allo", "hello bonjour"],
  de: ["hallo", "guten tag", "guten morgen", "guten abend", "moin", "servus", "gruss gott", "gruezi", "hi hallo"],
  pt: ["ola", "oi", "bom dia", "boa tarde", "boa noite", "oi oi", "ola ola"],
  it: ["ciao", "buongiorno", "buonasera", "salve", "ciao ciao"],
  nl: ["hoi", "hallo hoi", "goedemorgen", "goedemiddag", "goedenavond", "goeiedag", "hey hoi", "dag"],
};

const THANKS: Record<Lang, string[]> = {
  en: ["thanks", "thank you", "thankyou", "thx", "ty", "tnx", "cheers", "thanks a lot", "thank you so much", "thanks so much", "many thanks", "thank u", "thanks alot", "ok thanks", "okay thanks", "ok thank you", "great thanks", "perfect thanks", "cool thanks", "awesome thanks", "great thank you", "perfect thank you", "thanks very much", "thank you very much", "thanks for your help", "thank you for your help", "thanks for the help", "thanks that helps", "that helps thanks", "got it thanks", "brilliant thanks", "lovely thanks", "thanks anyway", "no thanks", "no thank you", "nope thanks", "im good thanks", "i am good thanks", "all good thanks", "thanks bye", "thank you bye", "thanks goodbye"],
  es: ["gracias", "muchas gracias", "mil gracias", "vale gracias", "ok gracias", "perfecto gracias", "genial gracias", "no gracias", "gracias adios", "muchisimas gracias"],
  fr: ["merci", "merci beaucoup", "merci bien", "ok merci", "super merci", "parfait merci", "non merci", "merci au revoir", "merci a vous", "merci pour votre aide"],
  de: ["danke", "vielen dank", "danke schon", "dankeschon", "danke sehr", "ok danke", "super danke", "perfekt danke", "nein danke", "danke tschuss", "danke dir", "danke ihnen", "besten dank"],
  pt: ["obrigado", "obrigada", "muito obrigado", "muito obrigada", "ok obrigado", "ok obrigada", "nao obrigado", "nao obrigada", "valeu", "obrigado tchau", "obrigada tchau"],
  it: ["grazie", "grazie mille", "mille grazie", "ok grazie", "perfetto grazie", "no grazie", "grazie ciao", "grazie tante"],
  nl: ["bedankt", "dank je", "dank u", "dank je wel", "dank u wel", "dankjewel", "dankuwel", "ok bedankt", "top bedankt", "nee bedankt", "nee dank je", "bedankt doei", "hartelijk dank"],
};

const CLOSERS: Record<Lang, string[]> = {
  en: ["bye", "goodbye", "bye bye", "see you", "see ya", "cya", "later", "take care", "have a good day", "have a nice day", "have a good one", "thats all", "that is all", "thats it", "that is it", "nothing else", "no thats all", "no that is all", "im done", "i am done", "all set", "were good", "we are good"],
  es: ["adios", "hasta luego", "chao", "chau", "nos vemos", "eso es todo", "nada mas", "hasta pronto"],
  fr: ["au revoir", "a bientot", "a plus", "bonne journee", "bonne soiree", "cest tout", "rien dautre"],
  de: ["tschuss", "tschuess", "auf wiedersehen", "bis dann", "bis bald", "schonen tag", "schonen tag noch", "das ist alles", "das wars", "das war es", "sonst nichts"],
  pt: ["tchau", "adeus", "ate logo", "ate mais", "e tudo", "so isso", "mais nada", "bom dia entao"],
  it: ["arrivederci", "a presto", "a dopo", "buona giornata", "buona serata", "e tutto", "nientaltro", "basta cosi"],
  nl: ["doei", "dag hoor", "tot ziens", "tot later", "fijne dag", "dat is alles", "dat was het", "verder niets", "doeg"],
};

/** Acknowledgements. Only a closer when the bot did NOT just ask a question —
 *  "ok" after "shall I pass this to the team?" is an answer, not a goodbye. */
const ACKS: Record<Lang, string[]> = {
  en: ["ok", "okay", "k", "kk", "cool", "great", "perfect", "got it", "sounds good", "alright", "all right", "nice", "awesome", "brilliant", "lovely", "fine", "ok cool", "ok great", "ok got it", "okay great", "okay cool", "i see", "understood", "noted", "makes sense", "fair enough", "good to know", "ok good", "very good", "excellent", "sure", "ok sure", "right", "ok then", "okay then", "great stuff", "super", "wonderful", "good"],
  es: ["vale", "ok vale", "perfecto", "genial", "entendido", "de acuerdo", "muy bien", "bien", "estupendo", "claro", "ya veo", "ok perfecto"],
  fr: ["daccord", "dac", "ok daccord", "parfait", "super", "tres bien", "bien", "compris", "je vois", "entendu", "ok parfait", "genial"],
  de: ["okay gut", "ok gut", "gut", "alles klar", "verstanden", "in ordnung", "perfekt", "prima", "super", "klasse", "sehr gut", "ok alles klar", "ah ok", "aha"],
  pt: ["ta bom", "ta bem", "tudo bem", "beleza", "perfeito", "otimo", "entendi", "certo", "ok certo", "combinado", "legal", "show"],
  it: ["va bene", "perfetto", "ottimo", "capito", "ho capito", "daccordo", "bene", "ok va bene", "certo", "benissimo"],
  nl: ["oke", "prima", "top", "goed", "helder", "duidelijk", "begrepen", "ok prima", "ok top", "mooi", "super", "perfect", "is goed", "goed zo"],
};

/* ── the replies ───────────────────────────────────────────────────────────── */

const REPLY: Record<Lang, { hi: (co: string) => string; thanks: string; bye: string; ack: string; contact: (name: string | null) => string; human: string; humanCaptured: string }> = {
  en: {
    hi: (co) => `Hi! Ask me anything about ${co} and I'll do my best to help.`,
    thanks: "You're welcome! If anything else comes up, I'm right here.",
    bye: "Take care! Come back any time you have a question.",
    ack: "Great — anything else I can help with?",
    contact: (name) => `Thanks${name ? `, ${name}` : ""} — the team has your details and will follow up by email. Happy to keep answering questions in the meantime.`,
    human: "Of course. Leave your email and a quick message below and a real person from the team will get back to you directly.",
    humanCaptured: "Of course — the team has your details and a real person will get in touch by email. Anything I can look up for you while you wait?",
  },
  es: {
    hi: (co) => `¡Hola! Pregúntame lo que quieras sobre ${co} y te ayudaré encantado.`,
    thanks: "¡De nada! Si surge algo más, aquí estoy.",
    bye: "¡Hasta pronto! Vuelve cuando tengas cualquier pregunta.",
    ack: "Genial — ¿algo más en lo que pueda ayudarte?",
    contact: (name) => `Gracias${name ? `, ${name}` : ""} — el equipo tiene tus datos y te escribirá por correo. Mientras tanto, sigo aquí para cualquier pregunta.`,
    human: "Claro. Deja tu correo y un breve mensaje abajo y una persona del equipo te responderá directamente.",
    humanCaptured: "Claro — el equipo tiene tus datos y una persona se pondrá en contacto contigo por correo. ¿Quieres que busque algo mientras tanto?",
  },
  fr: {
    hi: (co) => `Bonjour ! Posez-moi vos questions sur ${co} et je ferai de mon mieux pour vous aider.`,
    thanks: "Avec plaisir ! S'il y a autre chose, je suis là.",
    bye: "À bientôt ! Revenez dès que vous avez une question.",
    ack: "Parfait — puis-je vous aider avec autre chose ?",
    contact: (name) => `Merci${name ? `, ${name}` : ""} — l'équipe a vos coordonnées et vous répondra par e-mail. En attendant, je reste disponible pour vos questions.`,
    human: "Bien sûr. Laissez votre e-mail et un court message ci-dessous et une personne de l'équipe vous répondra directement.",
    humanCaptured: "Bien sûr — l'équipe a vos coordonnées et une personne vous contactera par e-mail. Puis-je chercher quelque chose pour vous en attendant ?",
  },
  de: {
    hi: (co) => `Hallo! Fragen Sie mich alles über ${co} — ich helfe gern.`,
    thanks: "Gern geschehen! Wenn noch etwas ist, bin ich hier.",
    bye: "Bis bald! Kommen Sie jederzeit mit Ihren Fragen wieder.",
    ack: "Prima — kann ich sonst noch etwas für Sie tun?",
    contact: (name) => `Danke${name ? `, ${name}` : ""} — das Team hat Ihre Daten und meldet sich per E-Mail. In der Zwischenzeit beantworte ich gern weitere Fragen.`,
    human: "Natürlich. Hinterlassen Sie unten Ihre E-Mail und eine kurze Nachricht, dann meldet sich jemand aus dem Team persönlich bei Ihnen.",
    humanCaptured: "Natürlich — das Team hat Ihre Daten und jemand meldet sich persönlich per E-Mail. Kann ich in der Zwischenzeit etwas für Sie nachsehen?",
  },
  pt: {
    hi: (co) => `Olá! Pergunte-me o que quiser sobre a ${co} e farei o meu melhor para ajudar.`,
    thanks: "De nada! Se surgir mais alguma coisa, estou aqui.",
    bye: "Até breve! Volte sempre que tiver uma pergunta.",
    ack: "Ótimo — posso ajudar com mais alguma coisa?",
    contact: (name) => `Obrigado${name ? `, ${name}` : ""} — a equipa tem os seus dados e vai responder por e-mail. Entretanto, continuo aqui para qualquer pergunta.`,
    human: "Claro. Deixe o seu e-mail e uma breve mensagem abaixo e uma pessoa da equipa responde-lhe diretamente.",
    humanCaptured: "Claro — a equipa tem os seus dados e alguém entrará em contacto por e-mail. Quer que procure alguma coisa entretanto?",
  },
  it: {
    hi: (co) => `Ciao! Chiedimi qualsiasi cosa su ${co} e farò del mio meglio per aiutarti.`,
    thanks: "Di nulla! Se c'è altro, sono qui.",
    bye: "A presto! Torna quando vuoi con le tue domande.",
    ack: "Perfetto — posso aiutarti con altro?",
    contact: (name) => `Grazie${name ? `, ${name}` : ""} — il team ha i tuoi dati e ti risponderà via e-mail. Nel frattempo resto a disposizione per altre domande.`,
    human: "Certo. Lascia la tua e-mail e un breve messaggio qui sotto e una persona del team ti risponderà direttamente.",
    humanCaptured: "Certo — il team ha i tuoi dati e una persona ti contatterà via e-mail. Posso cercare qualcosa per te nel frattempo?",
  },
  nl: {
    hi: (co) => `Hoi! Vraag me alles over ${co} — ik help je graag.`,
    thanks: "Graag gedaan! Als er nog iets is, ben ik hier.",
    bye: "Tot ziens! Kom gerust terug als je een vraag hebt.",
    ack: "Mooi — kan ik nog ergens mee helpen?",
    contact: (name) => `Bedankt${name ? `, ${name}` : ""} — het team heeft je gegevens en neemt per e-mail contact op. Ondertussen beantwoord ik graag andere vragen.`,
    human: "Natuurlijk. Laat hieronder je e-mail en een kort bericht achter en iemand van het team neemt persoonlijk contact met je op.",
    humanCaptured: "Natuurlijk — het team heeft je gegevens en iemand neemt persoonlijk contact op per e-mail. Kan ik ondertussen iets voor je opzoeken?",
  },
};

/* ── "talk to a person" ────────────────────────────────────────────────────── */

const HUMAN_RES: { re: RegExp; lang: Lang }[] = [
  { re: /\b(?:talk|speak|chat|connect|get in touch|deal)\s+(?:to|with)\s+(?:a\s+|an\s+|the\s+)?(?:real\s+|actual\s+|live\s+|human\s+|actual\s+)?(?:person|human|someone|somebody|agent|representative|rep|operator|staff|member of staff|team member|team|people|manager|owner)\b/i, lang: "en" },
  { re: /\b(?:a|an)\s+(?:real|actual|live)\s+(?:person|human|agent)\b/i, lang: "en" },
  { re: /\b(?:call|phone|ring)\s+me\b/i, lang: "en" },
  { re: /\bcan\s+(?:someone|somebody|a person|a human|the team)\s+(?:call|phone|ring|contact|email|reach|get back to)\s+me\b/i, lang: "en" },
  { re: /\b(?:i(?:'d| would) like|i want|i need|can i have|could i have|get me|give me|put me through to)\s+(?:to\s+)?(?:a\s+)?(?:human|person|real person|someone|somebody)\b/i, lang: "en" },
  { re: /\bnot?\s+(?:a\s+)?bot\b/i, lang: "en" },
  { re: /\bhuman\s+(?:please|support|agent|help)\b/i, lang: "en" },
  { re: /\bhablar\s+con\s+(?:una?\s+)?(?:persona|humano|alguien|agente|asesor|encargado)\b/i, lang: "es" },
  { re: /\b(?:que\s+)?me\s+llam(?:en|e|ais|éis)\b/i, lang: "es" },
  { re: /\bparler\s+(?:à|a|avec)\s+(?:une?\s+)?(?:personne|humain|quelqu'?un|conseiller|agent|responsable)\b/i, lang: "fr" },
  { re: /\b(?:rappelez|appelez)[- ]moi\b/i, lang: "fr" },
  { re: /\bmit\s+(?:einem|einer|jemandem|einem echten)\s+(?:menschen|mitarbeiter|mitarbeiterin|person|berater|beraterin|jemandem)\s+(?:sprechen|reden)\b/i, lang: "de" },
  { re: /\b(?:rufen|ruft)\s+sie\s+mich\s+(?:an|zurück)\b/i, lang: "de" },
  { re: /\bfalar\s+com\s+(?:uma?\s+)?(?:pessoa|humano|alguém|alguem|atendente|responsável|responsavel)\b/i, lang: "pt" },
  { re: /\bparlare\s+con\s+(?:una?\s+)?(?:persona|umano|qualcuno|operatore|responsabile)\b/i, lang: "it" },
  { re: /\b(?:praten|spreken)\s+met\s+(?:een\s+)?(?:mens|persoon|iemand|medewerker|echt mens|echte persoon)\b/i, lang: "nl" },
  { re: /\bmet\s+(?:een\s+)?(?:mens|persoon|iemand|medewerker|echt mens|echte persoon)\s+(?:praten|spreken)\b/i, lang: "nl" },
];

/* ── contact-only messages ─────────────────────────────────────────────────── */

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,24}/gi;
const PHONE_RE = /\+?\(?\d[\d\s().-]{5,}\d/g;
/** Labels and filler that surround contact details without being a question. */
const CONTACT_FILLER_RE =
  /\b(?:name|nom|nombre|naam|email|e-mail|mail|correo|courriel|phone|tel|telephone|mobile|cell|whatsapp|number|numero|número|contact|my|mine|is|its|it's|it is|here|here you go|there you go|sure|ok|okay|yes|yep|yeah|you can|reach me|call me|text me|email me|at|on|and|the|a|thanks|thank you|please|pls|mr|mrs|ms|dr|hi|hello|hey|i am|i'm|im|this is|my name is|es|soy|mi|c'est|je suis|ich bin|meine|mein|sono|il mio|ik ben|mijn)\b/gi;

/* ── helpers ───────────────────────────────────────────────────────────────── */

/** Lowercase, strip accents, punctuation and emoji, collapse spaces. */
function normalise(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’']/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Nothing but emoji / punctuation / whitespace — a thumbs-up, a wave. */
function onlyEmoji(s: string): boolean {
  const stripped = s.replace(/[\p{Extended_Pictographic}\p{Emoji_Component}\u200d\ufe0f\s\p{P}]/gu, "");
  return stripped.length === 0 && /\p{Extended_Pictographic}/u.test(s);
}

function inTable(table: Record<Lang, string[]>, norm: string): Lang | null {
  for (const lang of Object.keys(table) as Lang[]) {
    if (table[lang].includes(norm)) return lang;
  }
  return null;
}

/** The turn before the visitor's latest — what they might be replying to. */
function previousBotTurn(history: ChatTurn[]): string | null {
  const idx = history.map((t) => t.role).lastIndexOf("visitor");
  for (let i = idx - 1; i >= 0; i--) if (history[i].role === "bot") return history[i].text;
  return null;
}

const asAnswer = (reply: string, handoff = false): WidgetAnswer => ({ reply, sources: [], products: [], handoff });

/* ── the pre-retrieval rules ───────────────────────────────────────────────── */

export type ShortcutContext = {
  companyName: string;
  /** The route captured contact details from this conversation (see
   *  captureFromChat) — needed to state "the team has your details" as fact. */
  contactCaptured?: { name: string | null; already: boolean } | null;
  /** An order lookup is in play — never shortcut; ORDER_RULES decide wording. */
  orderInPlay?: boolean;
};

/**
 * Small talk, contact-only, "talk to a person". Pure — no I/O — so it runs
 * before retrieval, before the cap is spent, before anything costs anything.
 * Returns null whenever it isn't sure, which is most of the time.
 */
export function preRetrievalShortcut(history: ChatTurn[], ctx: ShortcutContext): Shortcut | null {
  if (ctx.orderInPlay) return null;
  const latest = history.filter((t) => t.role === "visitor").at(-1)?.text ?? "";
  const text = latest.trim();
  if (!text) return null;

  // ── small talk ─────────────────────────────────────────────────────────
  if (text.length <= 60) {
    if (onlyEmoji(text)) return { kind: "smalltalk", answer: asAnswer(REPLY.en.ack) };
    const norm = normalise(text);
    if (norm) {
      let lang: Lang | null;
      if ((lang = inTable(GREETINGS, norm))) return { kind: "smalltalk", answer: asAnswer(REPLY[lang].hi(ctx.companyName)) };
      if ((lang = inTable(THANKS, norm))) return { kind: "smalltalk", answer: asAnswer(REPLY[lang].thanks) };
      if ((lang = inTable(CLOSERS, norm))) return { kind: "smalltalk", answer: asAnswer(REPLY[lang].bye) };
      if ((lang = inTable(ACKS, norm))) {
        // "ok" replying to "would you like me to pass this on?" is a yes.
        const prev = previousBotTurn(history);
        if (!prev || !/\?\s*$/.test(prev.trim())) return { kind: "smalltalk", answer: asAnswer(REPLY[lang].ack) };
        return null;
      }
    }
  }

  // ── nothing but contact details ────────────────────────────────────────
  // Only when the route already turned them into a lead: if it refused
  // (disposable address, spam window) we must not claim the team has them.
  if (ctx.contactCaptured && text.length <= 300 && !/\?/.test(text)) {
    const residue = text
      .replace(EMAIL_RE, " ")
      .replace(PHONE_RE, " ")
      // The visitor's own name, if we caught it, is not a question either.
      .replace(ctx.contactCaptured.name ? new RegExp(ctx.contactCaptured.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi") : /$^/, " ")
      .replace(CONTACT_FILLER_RE, " ")
      .replace(/[^\p{L}]/gu, "");
    // Whatever is left that isn't a label, a name or filler is possibly a
    // question — anything beyond a stray word goes to the model.
    if (residue.length <= 8) {
      const first = ctx.contactCaptured.name?.split(/\s+/)[0] ?? null;
      const lang = guessLangFromFiller(text);
      return { kind: "contact", answer: asAnswer(REPLY[lang].contact(first)) };
    }
  }

  // ── talk to a person ───────────────────────────────────────────────────
  // Short messages only: a paragraph about a project that ends "can someone
  // call me" deserves the model's answer to the paragraph first.
  if (text.length <= 120) {
    for (const { re, lang } of HUMAN_RES) {
      if (re.test(text)) {
        return ctx.contactCaptured
          ? { kind: "human", answer: asAnswer(REPLY[lang].humanCaptured, false) }
          : { kind: "human", answer: asAnswer(REPLY[lang].human, true) };
      }
    }
  }

  return null;
}

/** For a contact-only message the only language cue is the labels around it. */
function guessLangFromFiller(text: string): Lang {
  const t = text.toLowerCase();
  if (/\b(?:correo|tel[eé]fono|nombre|soy|mi)\b/.test(t)) return "es";
  if (/\b(?:courriel|t[eé]l[eé]phone|nom|je suis|c'est)\b/.test(t)) return "fr";
  if (/\b(?:ich bin|meine|mein|telefon)\b/.test(t)) return "de";
  if (/\b(?:sono|il mio|telefono|nome)\b/.test(t)) return "it";
  if (/\b(?:ik ben|mijn|naam|telefoon)\b/.test(t)) return "nl";
  if (/\b(?:sou|meu|minha|telemóvel|telemovel)\b/.test(t)) return "pt";
  return "en";
}

/* ── the post-retrieval rule ───────────────────────────────────────────────── */

/**
 * Cosine distance under which a taught answer is "the same question". Voyage
 * puts paraphrases of one question around 0.05–0.12 and different questions
 * on one topic around 0.2+; 0.15 is the strategy's starting point. Tunable
 * without a deploy — read the WidgetQuestion log before tightening or
 * loosening, and remember rule 0 of the prompt still applies above the line:
 * the model sees the fact either way, this only decides who phrases it.
 */
export function taughtExactDistance(): number {
  const n = Number(process.env.WIDGET_TAUGHT_EXACT_DISTANCE);
  return Number.isFinite(n) && n > 0 && n < 1 ? n : 0.15;
}

/**
 * The owner wrote the answer to THIS question; the model would only reword
 * it. Serve it as written. Only on a fresh conversation (turn one or two —
 * later the retrieval embedding carries the previous exchange and the
 * distance stops meaning "same question") and only when nothing else is in
 * play that the reply would have to weave in.
 */
export function taughtShortcut(
  facts: { question: string; answer: string; distance: number }[],
  history: ChatTurn[],
  ctx: { orderInPlay?: boolean; contactCaptured?: unknown }
): Shortcut | null {
  if (ctx.orderInPlay || ctx.contactCaptured) return null;
  const best = facts[0];
  if (!best || !(best.distance < taughtExactDistance())) return null;
  if (history.filter((t) => t.role === "visitor").length > 2) return null;
  const reply = best.answer.trim().slice(0, 2000);
  if (!reply) return null;
  return { kind: "taught", answer: asAnswer(reply) };
}
