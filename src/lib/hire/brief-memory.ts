/**
 * The brief a buyer was writing, kept for the rest of this page visit.
 *
 * The hire form is remounted when the buyer switches between hiring on BNB
 * Chain and trying free on testnet, and that threw away whatever they had
 * typed. During a page visit it stays in memory, surviving a network switch.
 * Opening the standalone page from the popup needs one hard reload, so that
 * action alone carries the draft through short-lived session storage. The
 * standalone form removes it as soon as it reads it.
 */
export interface RememberedBrief {
  task: string;
  template: string | null;
  recipe: string | null;
  schema: string;
}

const briefs = new Map<string, RememberedBrief>();
const fullPageKey = 'pokter:hire:full-page-brief';

const keyOf = (agent: { chainId: number; tokenId: string }) => `${agent.chainId}:${agent.tokenId}`;

export function rememberBrief(agent: { chainId: number; tokenId: string }, brief: RememberedBrief): void {
  if (brief.task.trim() || brief.template) briefs.set(keyOf(agent), brief);
  else briefs.delete(keyOf(agent));
}

export function recallBrief(agent: { chainId: number; tokenId: string }): RememberedBrief | null {
  return briefs.get(keyOf(agent)) ?? null;
}

/** One same-tab reload from the hire sheet. */
export function stageBriefForFullPage(agent: { chainId: number; tokenId: string }): void {
  const brief = recallBrief(agent);
  if (!brief) return;
  try {
    window.sessionStorage.setItem(fullPageKey, JSON.stringify({ agent: keyOf(agent), brief, expiresAt: Date.now() + 60_000 }));
  } catch {
    // Browsers that block session storage still open the standalone page.
  }
}

export function readBriefForFullPage(agent: { chainId: number; tokenId: string }): RememberedBrief | null {
  let value: string | null = null;
  try {
    value = window.sessionStorage.getItem(fullPageKey);
  } catch {
    return null;
  }
  if (!value) return null;
  try {
    const transfer = JSON.parse(value) as { agent?: string; brief?: RememberedBrief; expiresAt?: number };
    return transfer.agent === keyOf(agent) && typeof transfer.expiresAt === 'number' && Date.now() <= transfer.expiresAt && typeof transfer.brief?.task === 'string'
      ? transfer.brief
      : null;
  } catch {
    return null;
  }
}

export function clearBriefForFullPage(): void {
  try {
    window.sessionStorage.removeItem(fullPageKey);
  } catch {
    // Session storage may be unavailable.
  }
}

/** Once a job is funded the brief is on chain, and the draft is done with. */
export function forgetBrief(agent: { chainId: number; tokenId: string }): void {
  briefs.delete(keyOf(agent));
}
