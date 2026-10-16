import { getAddress, type Address } from 'viem';

import { readVenusPosition, venusClient } from '@/lib/assay/venus';

import type { HouseAgentDefinition } from '../types';
import { brinkwatchReport, readBrief } from './brinkwatch-report';

/**
 * Brinkwatch: how close a Venus position is to liquidation, and what
 * pulls it back.
 *
 * Built on the reading Pokter already checks agents against, which matched
 * Venus's own figures to four decimals. Reads BNB Chain mainnet whichever
 * escrow pays for the job: the testnet listing is a free trial of the same
 * answer, not a different service.
 */
export const brinkwatch: HouseAgentDefinition = {
  slug: 'brinkwatch',
  name: 'Brinkwatch',
  version: '1.0.0',
  category: 'health-factor',
  description:
    'Reads a wallet’s Venus Core Pool position on BNB Chain and reports its health factor, each market’s collateral and debt, the price drop that would liquidate it, and the repay or added collateral that restores a target (1.5 unless you name one). Needs the wallet address. Read-only: it never signs or moves funds, and covers Venus Core Pool only.',
  priceU: 0.1,
  skill: {
    id: 'venus_health',
    name: 'Venus health factor and liquidation distance',
    description:
      'Give a BNB Chain wallet address, optionally with a target health factor. Returns the health factor, per-market collateral and debt, liquidation price drops, and the repay that restores the target, each figure with its Venus source and block.',
    examples: [
      'Venus health factor for 0x0aEe98f6317ad64472330CA09af6c076BeE99aB7 and the repay that restores 1.5',
      'Venus health factor for 0x… and the repay that restores 1.5',
      'How close is 0x… to liquidation on Venus? Target health factor 1.3',
      'Check the Venus position of 0x…',
    ],
    tags: ['venus', 'health-factor', 'liquidation', 'bnb-chain'],
  },
  deliverables: 'Venus health factor, per-market collateral and debt, liquidation price drops, and the repay or collateral that restores the target, with sources.',
  qualityStandards: 'Every figure read from Venus contracts on BNB Chain mainnet at a stated block.',
  check(brief) {
    const { account } = readBrief(brief);
    if (!account) return { error: 'The brief names no wallet address', need: 'Include the BNB Chain wallet to check, e.g. "Venus health factor for 0x1234…abcd"' };
    return null;
  },
  async run(brief) {
    const { account, target } = readBrief(brief);
    if (!account) return { ok: false, error: 'The brief names no wallet address', need: 'Include the wallet to check' };
    const client = venusClient();
    const reading = await readVenusPosition(client, getAddress(account) as Address).catch((error: Error) => error);
    if (reading instanceof Error) return { ok: false, error: `Venus could not be read: ${reading.message.slice(0, 160)}`, need: 'Try again shortly' };
    const block = await client.getBlock({ blockNumber: reading.block });
    return {
      ok: true,
      content: brinkwatchReport({
        account: reading.account,
        block: reading.block.toString(),
        blockTime: new Date(Number(block.timestamp) * 1000).toISOString(),
        healthFactor: reading.healthFactor,
        borrowLimitRatio: reading.borrowLimitRatio,
        liquidatable: reading.liquidatable,
        collateral: reading.rows.collateral,
        debt: reading.rows.debt,
        target,
      }),
    };
  },
};
