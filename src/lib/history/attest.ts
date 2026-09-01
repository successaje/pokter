import type { Attestation } from '@/lib/proof/attestation';
import type { TrackRecord } from './record';

/**
 * Defects our accumulated measurement has. Published for the same reason we
 * demand it of other measurers: a record that hides its limits is marketing.
 */
export const SWEEP_DEFECTS = [
  'Single vantage point: an agent that geo-blocks or ASN-blocks this prober appears unreachable when it may be healthy.',
  'Liveness is not correctness: an agent that answers every probe may still trade badly.',
  'Sweeps sample periodically, so an outage shorter than the interval between sweeps can go unseen.',
  'History only begins when Pokter first saw the agent; earlier behaviour is unknown to us.',
];

/**
 * Turn accumulated sweeps into a first-party attestation, so our own evidence
 * flows through the same verdict logic as third-party attestations.
 *
 * Unlike the attestations we read from chain, this one carries no transaction
 * hash — it is our measurement, not a published one, and the UI is expected to
 * present it as such rather than mixing it into the on-chain receipts.
 */
export function toSweepAttestation(
  record: TrackRecord,
  { agentId, chainId }: { agentId: string; chainId: number },
): Attestation | null {
  if (record.totalProbes === 0) return null;

  // Prefer the widest window that actually holds probes: a 30-day reading is a
  // stronger claim than a 24-hour one, but only if we have 30 days of probes.
  const window =
    [...record.windows].reverse().find((w) => w.probes > 0) ?? null;
  if (!window || window.ratio === null) return null;

  return {
    id: `sweep:${chainId}:${agentId}`,
    agentId,
    chainId,
    transactionHash: null,
    blockNumber: null,
    ratio: window.ratio,
    dimension: 'uptime',
    window: window.label,
    measuredBy: 'Pokter',
    reasoning:
      `Measured by Pokter from ${window.probes} probe(s) over ${window.label}: ` +
      `${(window.ratio * 100).toFixed(2)}%. A probe counts as answered only when the ` +
      `endpoint returns well-formed JSON; an HTTP 200 alone is not counted.`,
    method: {
      measuredBy: 'Pokter',
      protocol: 'a2a',
      probes: window.probes,
      answered: window.answered,
      // Reported truthfully, and floored: ten minutes of watching is zero days
      // of watching. Rounding up here would let an agent be called proven on
      // the strength of a single afternoon, which is the opposite of the claim
      // this marketplace makes.
      windowDays: Math.floor(record.observedDays),
      medianMs: window.medianMs,
      vantage: 'single region',
      knownDefects: SWEEP_DEFECTS,
    },
    createdAt: record.lastSeen,
    verified: true,
  };
}
