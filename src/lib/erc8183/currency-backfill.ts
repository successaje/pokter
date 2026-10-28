import { getAddress } from 'viem';

/**
 * Which token each historical job is in, read from the escrow.
 *
 * Every row written before `payment_token` existed is unknown, and unknown is
 * what it stays until the escrow's `jobPaymentToken(jobId)` answers for it. It
 * is not inferred from the chain's default token, the budget, the agent or the
 * date: a row the chain did not answer for is reported as unread and left
 * null, so a later run can fill it and nothing is ever relabelled $U by
 * assumption.
 */
export interface CurrencyBackfillRow {
  chainId: number;
  jobId: string;
}

export type CurrencyReading =
  | { chainId: number; jobId: string; outcome: 'read'; token: string }
  | { chainId: number; jobId: string; outcome: 'unread'; reason: string };

export interface CurrencyBackfillReport {
  write: boolean;
  examined: number;
  read: number;
  unread: number;
  written: number;
  /** Jobs per chain and token, as read. */
  byToken: Record<string, number>;
  readings: CurrencyReading[];
}

export async function backfillJobCurrencies(input: {
  rows: CurrencyBackfillRow[];
  read: (chainId: number, jobId: string) => Promise<string | null>;
  write: boolean;
  set: (chainId: number, jobId: string, token: string) => number;
  /**
   * One line per job read, on a write run: which token was stored, or why
   * nothing was. The audit trail of what the backfill changed and when.
   */
  audit?: (entry: { chainId: number; jobId: string; token: string | null; outcome: 'written' | 'already-set' | 'unread'; detail: string | null }) => void;
}): Promise<CurrencyBackfillReport> {
  const readings: CurrencyReading[] = [];
  const seen = new Set<string>();
  for (const row of input.rows) {
    const key = `${row.chainId}:${row.jobId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if ((row.chainId !== 56 && row.chainId !== 97) || !/^\d+$/.test(row.jobId)) {
      readings.push({ chainId: row.chainId, jobId: row.jobId, outcome: 'unread', reason: 'not an escrow job id on 56 or 97' });
      continue;
    }
    let token: string | null = null;
    let reason = 'the escrow did not answer';
    try {
      const raw = await input.read(row.chainId, row.jobId);
      token = raw ? getAddress(raw) : null;
    } catch (error) {
      reason = (error as Error).message.slice(0, 160);
    }
    readings.push(token ? { chainId: row.chainId, jobId: row.jobId, outcome: 'read', token } : { chainId: row.chainId, jobId: row.jobId, outcome: 'unread', reason });
  }
  let written = 0;
  if (input.write) {
    for (const r of readings) {
      if (r.outcome === 'read') {
        const changed = input.set(r.chainId, r.jobId, r.token);
        written += changed;
        input.audit?.({ chainId: r.chainId, jobId: r.jobId, token: r.token, outcome: changed > 0 ? 'written' : 'already-set', detail: null });
      } else {
        input.audit?.({ chainId: r.chainId, jobId: r.jobId, token: null, outcome: 'unread', detail: r.reason });
      }
    }
  }
  const byToken: Record<string, number> = {};
  for (const r of readings) if (r.outcome === 'read') byToken[`${r.chainId}:${r.token}`] = (byToken[`${r.chainId}:${r.token}`] ?? 0) + 1;
  return {
    write: input.write,
    examined: readings.length,
    read: readings.filter((r) => r.outcome === 'read').length,
    unread: readings.filter((r) => r.outcome === 'unread').length,
    written,
    byToken,
    readings,
  };
}
