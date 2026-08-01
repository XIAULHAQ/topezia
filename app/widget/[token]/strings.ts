/**
 * The widget's own words, in the visitor's language.
 *
 * Two halves make "the chat speaks your language" true, and this is the
 * smaller one: the fixed chrome (buttons, placeholders, the lead form). The
 * bigger half is the assistant's own replies, which follow whatever language
 * the visitor writes in — a prompt rule in lib/widget/answer.ts, no
 * dictionary needed.
 *
 * DELIBERATELY A DICTIONARY, NOT A TRANSLATION CALL. These strings ship with
 * the page: no latency, no cost, no chance of a mistranslated button. The
 * language comes from the visitor's own browser (navigator.language), which
 * is the honest signal for chrome — English is the fallback, never a guess.
 *
 * The server-rendered greeting stays in the site's own language, because it
 * quotes the site's own product names and page titles. That mixture is
 * intentional: the company's words stay the company's words.
 */
export type Strings = {
  askPlaceholder: string;
  replyPlaceholder: (company: string) => string;
  leaveInstead: string;
  leadTitle: string;
  namePlaceholder: string;
  emailPlaceholder: string;
  phonePlaceholder: string;
  needPlaceholder: string;
  sendToTeam: string;
  sending: string;
  keepChatting: string;
  send: string;
  close: string;
  listen: string;
  listening: string;
  teamLabel: (company: string) => string;
  hiReady: (company: string) => string;
  hiLearning: (company: string) => string;
  sent: (company: string, email: string) => string;
  offline: (backAt: string) => string;
  offlineNoTime: string;
  failed: string;
  aiSub: string;
};

const en: Strings = {
  askPlaceholder: "Ask a question…",
  replyPlaceholder: (c) => `Reply to the ${c} team…`,
  leaveInstead: "Leave a message instead",
  leadTitle: "Leave a message for the team",
  namePlaceholder: "Your name (optional)",
  emailPlaceholder: "Email — the reply goes here",
  phonePlaceholder: "Phone (optional)",
  needPlaceholder: "What do you need?",
  sendToTeam: "Send to the team",
  sending: "Sending…",
  keepChatting: "Keep chatting",
  send: "Send",
  close: "Close chat",
  listen: "Speak your message",
  listening: "Listening…",
  teamLabel: (c) => `${c} team`,
  hiReady: (c) => `Hi — I'm the ${c} AI assistant. Ask me anything, or leave a message and a real person will get back to you.`,
  hiLearning: (c) => `Hi — I'm the ${c} AI assistant. I'm still learning this site, so for now let me take a message for the team.`,
  sent: (c, e) => `Done — your message is with the ${c} team. If they reply while you're here, it shows up right in this chat; otherwise it lands at ${e}.`,
  offline: (b) => `The team is offline right now — back ${b}.`,
  offlineNoTime: "The team is offline right now.",
  failed: "That didn't go through — try again.",
  aiSub: "AI assistant · a person reads every message",
};

const es: Strings = {
  askPlaceholder: "Haz una pregunta…",
  replyPlaceholder: (c) => `Responder al equipo de ${c}…`,
  leaveInstead: "Mejor dejar un mensaje",
  leadTitle: "Deja un mensaje para el equipo",
  namePlaceholder: "Tu nombre (opcional)",
  emailPlaceholder: "Correo — la respuesta llega aquí",
  phonePlaceholder: "Teléfono (opcional)",
  needPlaceholder: "¿Qué necesitas?",
  sendToTeam: "Enviar al equipo",
  sending: "Enviando…",
  keepChatting: "Seguir chateando",
  send: "Enviar",
  close: "Cerrar el chat",
  listen: "Habla tu mensaje",
  listening: "Escuchando…",
  teamLabel: (c) => `equipo de ${c}`,
  hiReady: (c) => `Hola — soy el asistente de IA de ${c}. Pregúntame lo que quieras, o deja un mensaje y una persona real te responderá.`,
  hiLearning: (c) => `Hola — soy el asistente de IA de ${c}. Todavía estoy aprendiendo este sitio, así que por ahora puedo tomar un mensaje para el equipo.`,
  sent: (c, e) => `Listo — tu mensaje está con el equipo de ${c}. Si responden mientras sigues aquí, aparecerá en este chat; si no, llegará a ${e}.`,
  offline: (b) => `El equipo no está disponible ahora — vuelve ${b}.`,
  offlineNoTime: "El equipo no está disponible en este momento.",
  failed: "No se pudo enviar — inténtalo de nuevo.",
  aiSub: "Asistente de IA · una persona lee cada mensaje",
};

const fr: Strings = {
  askPlaceholder: "Posez une question…",
  replyPlaceholder: (c) => `Répondre à l'équipe ${c}…`,
  leaveInstead: "Laisser un message plutôt",
  leadTitle: "Laissez un message à l'équipe",
  namePlaceholder: "Votre nom (facultatif)",
  emailPlaceholder: "E-mail — la réponse arrive ici",
  phonePlaceholder: "Téléphone (facultatif)",
  needPlaceholder: "De quoi avez-vous besoin ?",
  sendToTeam: "Envoyer à l'équipe",
  sending: "Envoi…",
  keepChatting: "Continuer à discuter",
  send: "Envoyer",
  close: "Fermer le chat",
  listen: "Dictez votre message",
  listening: "J'écoute…",
  teamLabel: (c) => `équipe ${c}`,
  hiReady: (c) => `Bonjour — je suis l'assistant IA de ${c}. Posez-moi vos questions, ou laissez un message et une vraie personne vous répondra.`,
  hiLearning: (c) => `Bonjour — je suis l'assistant IA de ${c}. J'apprends encore ce site, alors je peux prendre un message pour l'équipe.`,
  sent: (c, e) => `C'est envoyé — votre message est chez l'équipe ${c}. S'ils répondent pendant que vous êtes là, cela s'affichera ici ; sinon à ${e}.`,
  offline: (b) => `L'équipe est absente pour le moment — de retour ${b}.`,
  offlineNoTime: "L'équipe est absente pour le moment.",
  failed: "L'envoi a échoué — réessayez.",
  aiSub: "Assistant IA · une personne lit chaque message",
};

const de: Strings = {
  askPlaceholder: "Stellen Sie eine Frage…",
  replyPlaceholder: (c) => `Dem ${c}-Team antworten…`,
  leaveInstead: "Lieber eine Nachricht hinterlassen",
  leadTitle: "Hinterlassen Sie dem Team eine Nachricht",
  namePlaceholder: "Ihr Name (optional)",
  emailPlaceholder: "E-Mail — hier kommt die Antwort an",
  phonePlaceholder: "Telefon (optional)",
  needPlaceholder: "Was brauchen Sie?",
  sendToTeam: "An das Team senden",
  sending: "Senden…",
  keepChatting: "Weiter chatten",
  send: "Senden",
  close: "Chat schließen",
  listen: "Nachricht sprechen",
  listening: "Ich höre zu…",
  teamLabel: (c) => `${c}-Team`,
  hiReady: (c) => `Hallo — ich bin der KI-Assistent von ${c}. Fragen Sie mich alles, oder hinterlassen Sie eine Nachricht und ein echter Mensch meldet sich.`,
  hiLearning: (c) => `Hallo — ich bin der KI-Assistent von ${c}. Ich lerne diese Website noch, daher nehme ich gern eine Nachricht für das Team auf.`,
  sent: (c, e) => `Erledigt — Ihre Nachricht liegt beim ${c}-Team. Antworten sie, während Sie hier sind, erscheint es direkt in diesem Chat; sonst an ${e}.`,
  offline: (b) => `Das Team ist gerade nicht da — zurück ${b}.`,
  offlineNoTime: "Das Team ist gerade nicht erreichbar.",
  failed: "Das hat nicht geklappt — bitte erneut versuchen.",
  aiSub: "KI-Assistent · ein Mensch liest jede Nachricht",
};

const pt: Strings = {
  askPlaceholder: "Faça uma pergunta…",
  replyPlaceholder: (c) => `Responder à equipa ${c}…`,
  leaveInstead: "Deixar uma mensagem",
  leadTitle: "Deixe uma mensagem para a equipa",
  namePlaceholder: "O seu nome (opcional)",
  emailPlaceholder: "E-mail — a resposta chega aqui",
  phonePlaceholder: "Telefone (opcional)",
  needPlaceholder: "Do que precisa?",
  sendToTeam: "Enviar à equipa",
  sending: "A enviar…",
  keepChatting: "Continuar a conversar",
  send: "Enviar",
  close: "Fechar o chat",
  listen: "Fale a sua mensagem",
  listening: "A ouvir…",
  teamLabel: (c) => `equipa ${c}`,
  hiReady: (c) => `Olá — sou o assistente de IA da ${c}. Pergunte o que quiser, ou deixe uma mensagem e uma pessoa real responderá.`,
  hiLearning: (c) => `Olá — sou o assistente de IA da ${c}. Ainda estou a aprender este site, por isso posso recolher uma mensagem para a equipa.`,
  sent: (c, e) => `Pronto — a sua mensagem está com a equipa ${c}. Se responderem enquanto está aqui, aparece neste chat; caso contrário, chega a ${e}.`,
  offline: (b) => `A equipa está indisponível agora — regressa ${b}.`,
  offlineNoTime: "A equipa está indisponível de momento.",
  failed: "Não foi possível enviar — tente novamente.",
  aiSub: "Assistente de IA · uma pessoa lê cada mensagem",
};

const it: Strings = {
  askPlaceholder: "Fai una domanda…",
  replyPlaceholder: (c) => `Rispondi al team ${c}…`,
  leaveInstead: "Lascia un messaggio",
  leadTitle: "Lascia un messaggio al team",
  namePlaceholder: "Il tuo nome (facoltativo)",
  emailPlaceholder: "Email — la risposta arriva qui",
  phonePlaceholder: "Telefono (facoltativo)",
  needPlaceholder: "Di cosa hai bisogno?",
  sendToTeam: "Invia al team",
  sending: "Invio…",
  keepChatting: "Continua a chattare",
  send: "Invia",
  close: "Chiudi la chat",
  listen: "Detta il messaggio",
  listening: "In ascolto…",
  teamLabel: (c) => `team ${c}`,
  hiReady: (c) => `Ciao — sono l'assistente IA di ${c}. Chiedimi quello che vuoi, oppure lascia un messaggio e una persona vera ti risponderà.`,
  hiLearning: (c) => `Ciao — sono l'assistente IA di ${c}. Sto ancora imparando questo sito, quindi per ora posso raccogliere un messaggio per il team.`,
  sent: (c, e) => `Fatto — il tuo messaggio è al team ${c}. Se rispondono mentre sei qui, comparirà in questa chat; altrimenti arriverà a ${e}.`,
  offline: (b) => `Il team non è disponibile ora — torna ${b}.`,
  offlineNoTime: "Il team non è disponibile al momento.",
  failed: "Invio non riuscito — riprova.",
  aiSub: "Assistente IA · una persona legge ogni messaggio",
};

const nl: Strings = {
  askPlaceholder: "Stel een vraag…",
  replyPlaceholder: (c) => `Antwoord het ${c}-team…`,
  leaveInstead: "Laat liever een bericht achter",
  leadTitle: "Laat een bericht achter voor het team",
  namePlaceholder: "Je naam (optioneel)",
  emailPlaceholder: "E-mail — hier komt het antwoord",
  phonePlaceholder: "Telefoon (optioneel)",
  needPlaceholder: "Wat heb je nodig?",
  sendToTeam: "Naar het team sturen",
  sending: "Versturen…",
  keepChatting: "Verder chatten",
  send: "Versturen",
  close: "Chat sluiten",
  listen: "Spreek je bericht in",
  listening: "Ik luister…",
  teamLabel: (c) => `${c}-team`,
  hiReady: (c) => `Hoi — ik ben de AI-assistent van ${c}. Vraag me van alles, of laat een bericht achter en een echt persoon reageert.`,
  hiLearning: (c) => `Hoi — ik ben de AI-assistent van ${c}. Ik leer deze site nog, dus voorlopig neem ik graag een bericht aan voor het team.`,
  sent: (c, e) => `Gelukt — je bericht ligt bij het ${c}-team. Reageren ze terwijl je hier bent, dan zie je het in deze chat; anders komt het op ${e}.`,
  offline: (b) => `Het team is er nu niet — terug ${b}.`,
  offlineNoTime: "Het team is momenteel niet bereikbaar.",
  failed: "Versturen is mislukt — probeer opnieuw.",
  aiSub: "AI-assistent · een mens leest elk bericht",
};

const TABLE: Record<string, Strings> = { en, es, fr, de, pt, it, nl };

/** Base language from the browser's preference; English for anything else. */
export function pickLocale(tag: string | undefined): string {
  const base = (tag ?? "en").toLowerCase().split("-")[0];
  return base in TABLE ? base : "en";
}

export function T(locale: string): Strings {
  return TABLE[locale] ?? en;
}
