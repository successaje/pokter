import 'server-only';

import { getAssayStore } from '@/lib/assay/store';
import { demoSellerAddress } from '@/lib/erc8183/demo-seller';
import { getJobStore } from '@/lib/erc8183/store';
import { isPaidOnlyReason, latestRelayOutcome } from './relay-outcome';

export const RELAY_REFUSED_NOTE =
  'Asked directly, this agent replies with a price: it works only when paid through its own escrow, so Pokter’s delivery agent cannot carry a testnet job to it.';

/**
 * Whether this agent is known to refuse a brief Pokter's delivery agent
 * carries to it, and so cannot be hired on testnet through the relay.
 *
 * Testnet hires of mainnet agents fund Pokter's delivery agent, which sends
 * the brief to the agent directly and delivers its answer. An agent that
 * sells its work only through escrow answers that with a price, and the
 * buyer's job sat funded until it expired: "the agent offers only its
 * escrow skills". Two records already say so — Pokter's free check, and
 * the relay's own notice to the agent — and either is enough. A relayed job
 * the agent delivered after its last refusal clears it.
 *
 * Unknown is not refused: an agent nobody has asked yet is still offered.
 */
export async function relayRefusal(chainId: number, tokenId: string): Promise<string | null> {
  if (getAssayStore().latestFreeCall({ chainId, tokenId })?.status === 'paid-only') return RELAY_REFUSED_NOTE;
  const relay = await demoSellerAddress().catch(() => null);
  if (!relay) return null;
  const store = getJobStore();
  const relayed = store
    .byAgent(chainId, tokenId)
    .filter((job) => job.chainId === 97 && job.provider.toLowerCase() === relay.toLowerCase())
    .map((job) => ({ hiredAt: job.hiredAt, status: job.status, notice: store.noticeFor(job.chainId, job.jobId) }));
  return latestRelayOutcome(relayed) === 'refused' ? RELAY_REFUSED_NOTE : null;
}

export { isPaidOnlyReason };
