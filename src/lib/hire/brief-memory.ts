/**
 * The brief a buyer was writing, kept for the rest of this page visit.
 *
 * The hire form is remounted when the buyer switches between hiring on BNB
 * Chain and trying free on testnet, and that threw away whatever they had
 * typed. This keeps it in memory only: it survives moving between the two
 * networks and back, and is gone on a reload or a closed tab. Nothing is
 * written to storage, so a brief is never left on a shared device.
 */
export interface RememberedBrief {
  task: string;
  template: string | null;
  recipe: string | null;
  schema: string;
}

const briefs = new Map<string, RememberedBrief>();

const keyOf = (agent: { chainId: number; tokenId: string }) => `${agent.chainId}:${agent.tokenId}`;

export function rememberBrief(agent: { chainId: number; tokenId: string }, brief: RememberedBrief): void {
  if (brief.task.trim() || brief.template) briefs.set(keyOf(agent), brief);
  else briefs.delete(keyOf(agent));
}

export function recallBrief(agent: { chainId: number; tokenId: string }): RememberedBrief | null {
  return briefs.get(keyOf(agent)) ?? null;
}

/** Once a job is funded the brief is on chain, and the draft is done with. */
export function forgetBrief(agent: { chainId: number; tokenId: string }): void {
  briefs.delete(keyOf(agent));
}
