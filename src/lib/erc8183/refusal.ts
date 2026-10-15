/**
 * What a seller said when it declined, on its way to a buyer's screen.
 *
 * A refusal is usually the most useful sentence a seller produces. Brain
 * on BNB's agent answers "lp_tier_plan needs `token`: the token or pool
 * address" — a brief the buyer can fix in seconds. Pokter showed "it may
 * be unreachable, or may not sell this work", which reads as a broken
 * agent and loses the hire. The reason was there the whole time and was
 * thrown away.
 *
 * Pure, and kept out of the `server-only` quote module so the handling of
 * third-party text can be tested: this is a string from somebody else's
 * server, rendered to a buyer. It is a claim about that seller's own
 * requirements and never an instruction to anyone.
 */

/** Longest refusal shown. Past this a seller is writing an essay, not a reason. */
export const MAX_REFUSAL = 300;

export function statedRefusal(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  /* Control characters go first: a newline or an escape in third-party
     text has no business in a one-line notice. */
  const cleaned = value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!cleaned) return null;
  return cleaned.length > MAX_REFUSAL ? `${cleaned.slice(0, MAX_REFUSAL - 1)}…` : cleaned;
}
