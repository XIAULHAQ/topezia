/**
 * Starter notes for a recommendation or review request.
 *
 * Asking someone to vouch for you is a small social ordeal, and a blank box
 * is where most of these requests die — so we hand over a sentence that is
 * already polite and specific enough to send, and let people edit it.
 *
 * Written as prompts a real person would actually type, not marketing copy:
 * the recommender reads this line believing the member wrote it, and they
 * can, so it must never sound like the platform talking.
 *
 * Deliberately its own module, free of imports: it is used from the profile
 * panel and from the work page, and lib/endorsements/doc.ts pulls in node
 * crypto for token minting — which has no business in a client bundle.
 */
export const NOTE_SUGGESTIONS: Record<"RECOMMENDATION" | "REVIEW", string[]> = {
  RECOMMENDATION: [
    "We worked together for a while and I'd really value a few words from you — whatever you honestly remember is perfect.",
    "You saw my work up close. Would you mind writing a couple of lines about what I was like to work with?",
    "I'm putting my profile together and would love your perspective on how we worked together.",
  ],
  REVIEW: [
    "Thanks again for the project — would you mind leaving a short review of how it went?",
    "You hired me for this one. A couple of honest lines about the result would mean a lot.",
    "Would you write a short review of this work? What you needed, and whether it landed.",
  ],
};

/** Review requests sent from a work's own page, where the piece is already
 *  named on the page the recipient lands on — so these ask about the WORK
 *  rather than re-introducing it. */
export const WORK_REVIEW_NOTES: string[] = [
  "You know this space better than most — I'd really value your honest read on this piece.",
  "Would you take two minutes to look at this and say what you think? Critical is fine.",
  "I'd love an expert eye on this one. What works, what you'd have done differently?",
  "You've seen a lot of work like this. A short, honest review would mean a great deal.",
];
