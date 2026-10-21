import 'server-only';

import type { Address } from 'viem';

import { readVenusPosition, venusClient } from '@/lib/assay/venus';

export interface LoanReading {
  healthFactor: number | null;
  liquidatable: boolean;
  borrowUsd: number;
  collateral: Array<{ symbol: string; usd: number }>;
  debt: Array<{ symbol: string; usd: number }>;
  block: bigint;
}

/** One Venus Core Pool position, read from Venus's own accounting (assay/venus.ts). */
export async function readLoan(wallet: Address): Promise<LoanReading> {
  const r = await readVenusPosition(venusClient(), wallet);
  return {
    healthFactor: r.healthFactor,
    liquidatable: r.liquidatable,
    borrowUsd: r.borrowUsd,
    collateral: Object.entries(r.rows.collateral).map(([symbol, v]) => ({ symbol, usd: v.amount })).sort((a, b) => b.usd - a.usd),
    debt: Object.entries(r.rows.debt).map(([symbol, usd]) => ({ symbol, usd })).sort((a, b) => b.usd - a.usd),
    block: r.block,
  };
}
