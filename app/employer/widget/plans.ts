/**
 * The plan offer as the settings page needs it.
 *
 * Its own module because the shape crosses the server/client line — the
 * server page reads the real prices out of Stripe, the client component draws
 * the cards — and a type exported from a "use client" file is a client
 * reference rather than data.
 */
export type PlanOffer = {
  id: string;
  name: string;
  /** Already formatted, because only the server knows the real amount. */
  monthly: string;
  yearly: string;
  perMonth: string;
  perYear: string;
  noteMonthly: string;
  noteYearly: string;
  feats: string[];
  /** False when Stripe has no live price — the card says so instead of
   *  offering a button that fails at checkout. */
  forSale: boolean;
};
