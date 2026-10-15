/**
 * A request for the agent's price, not a job.
 *
 * Pokter's own price check, its catalogue and its listing diagnostic all
 * ask "Quote your standard deliverable…", and other marketplaces ask much
 * the same. Refusing that because it names no wallet would list the agent
 * as having no price at all. A price enquiry gets the standard price; a
 * job brief is still checked, and Pokter's hire flow always negotiates
 * with the buyer's real brief, so a job the agent cannot answer is still
 * refused before it is funded.
 */
export function isPriceEnquiry(brief: string): boolean {
  const text = brief.trim();
  if (!text) return true;
  if (/standard deliverable/i.test(text)) return true;
  return /^(?:please\s+)?(?:quote|price|what(?:'|’)?s your price|how much)\b/i.test(text) && !/0x[0-9a-fA-F]{40}/.test(text);
}
