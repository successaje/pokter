import 'server-only';

import { getAssayStore } from '@/lib/assay/store';
import { demoSellerAddress } from '@/lib/erc8183/demo-seller';
import { getJobStore } from '@/lib/erc8183/store';
import { relayJobEvidence, relayStatusFrom, type RelayEvidence } from './relay-outcome';
import { PROBE_RETRY_MS } from './relay-probe-policy';

export type RelayStatus = { status: 'ok' | 'refused' | 'unknown'; note: string | null };

export const RELAY_REFUSED_NOTE =
  'Asked directly, this agent replies with a price: it works only when paid through its own escrow, so Pokter’s delivery agent cannot carry a testnet job to it.';
export const RELAY_UNKNOWN_NOTE = 'Pokter has not yet confirmed that this agent answers a brief its delivery agent carries, so testnet is not offered until it has.';

/**
 * Whether Pokter's delivery agent can carry a testnet job to this agent.
 *
 * Testnet hires of agents registered elsewhere fund Pokter's delivery agent,
 * which sends the brief to the agent directly and delivers its answer. An
 * agent that sells its work only through its own escrow answers with a
 * price, and an agent with no endpoint cannot be asked at all; either way
 * the buyer's job sat funded until it expired. Every record Pokter keeps of
 * a brief sent to the agent counts: the free check (assay), relayed jobs
 * and their notices, and the relay test (relay-probe.ts). The newest wins.
 */
export async function relayStatus(chainId: number, tokenId: string, nowMs = Date.now()): Promise<RelayStatus> {
  const evidence: RelayEvidence[] = [];

  const free = getAssayStore().latestFreeCall({ chainId, tokenId });
  if (free) {
    const atMs = Date.parse(free.ranAt);
    if (free.status === 'checked') evidence.push({ atMs, verdict: 'ok', note: 'It answered Pokter’s free check.' });
    else if (free.status === 'paid-only') evidence.push({ atMs, verdict: 'refused', note: RELAY_REFUSED_NOTE });
    else evidence.push({ atMs, verdict: 'refused', note: 'It publishes no endpoint or work skill a brief can be sent to, so Pokter’s delivery agent cannot reach it.' });
  }

  const store = getJobStore();
  const probe = store.relayProbe(chainId, tokenId);
  if (probe) {
    const atMs = Date.parse(probe.at);
    if (probe.outcome === 'answers') evidence.push({ atMs, verdict: 'ok', note: 'It answered Pokter’s relay test.' });
    else if (probe.outcome === 'paid-only') evidence.push({ atMs, verdict: 'refused', note: RELAY_REFUSED_NOTE });
    else if (probe.outcome === 'not-askable') evidence.push({ atMs, verdict: 'refused', note: 'It publishes no endpoint or work skill a brief can be sent to, so Pokter’s delivery agent cannot reach it.' });
    else evidence.push({ atMs, verdict: 'refused', note: 'It did not answer Pokter’s relay test, so a testnet job could not be delivered. Pokter tries again in a few hours.', validMs: PROBE_RETRY_MS });
  }

  const relay = await demoSellerAddress().catch(() => null);
  if (relay) {
    const relayed = store
      .byAgent(chainId, tokenId)
      .filter((job) => job.chainId === 97 && job.provider.toLowerCase() === relay.toLowerCase())
      .map((job) => ({ hiredAt: job.hiredAt, status: job.status, notice: store.noticeFor(job.chainId, job.jobId) }));
    evidence.push(...relayJobEvidence(relayed));
  }

  const result = relayStatusFrom(evidence, nowMs);
  return result.status === 'unknown' ? { status: 'unknown', note: RELAY_UNKNOWN_NOTE } : result;
}

/** The older yes/no form: a note when the relay must not be offered (refused or unknown), null when it may. */
export async function relayRefusal(chainId: number, tokenId: string): Promise<string | null> {
  const s = await relayStatus(chainId, tokenId);
  return s.status === 'ok' ? null : s.note;
}
