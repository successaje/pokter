import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { brinkwatchReport } from '../src/lib/house/agents/brinkwatch-report';
import { manifestMatch } from '../src/lib/erc8183/manifest-match';
import { readVenusFactsAt, venusReadRefusal } from '../src/lib/delivery/venus-facts';
import {
  CHECK_DOES_NOT_MEAN,
  CHECK_MEANS,
  HF_ABSOLUTE_TOLERANCE,
  HF_MIN_STATED_DECIMALS,
  HF_RELATIVE_TOLERANCE,
  VENUS_CHAIN_ID,
  cannotVerify,
  checkDeliveredVenusReport,
  hfTolerance,
  readVenusReportClaim,
  venusHealthJob,
  venusSubjectFromBrief,
  verifyVenusReport,
  type VenusEvidence,
  type VenusHealthFacts,
  type VenusHealthSubject,
} from '../src/lib/delivery/venus-report-check';

/**
 * A real Venus Core Pool position, captured from BNB Chain mainnet.
 *
 * Account 0x4a4F…61ba at block 129,170,001 on 22 October 2026: $207,792.77
 * of USDC and USDT debt against $291,545.97 of BNB and XVS collateral, health
 * factor 1.122279, not liquidatable. Read with `scripts/capture-venus-fixture.mts`
 * through bsc-dataseed.bnbchain.org, and independently recomputed from raw
 * `eth_call`s to `getAccountLiquidity`, `getAccountSnapshot` and
 * `getUnderlyingPrice` seventy blocks later, which gave 1.122369 on the same
 * $207,792.78 of debt.
 *
 * It cannot be re-read: free BNB Chain endpoints prune state within about a
 * hundred blocks, which is the same fact that makes "could not verify" the
 * ordinary outcome of this check in production.
 *
 * Two things in these tests are synthetic and say so where they are used:
 * the delivered manifests (no agent delivered a report about this account),
 * and the borrowing-limit ratio in the definitional-error test, because on
 * this position Venus's collateral factors and liquidation thresholds very
 * nearly coincide (1.122152 against 1.122279) and the real pair cannot
 * exercise that branch.
 */
const real = JSON.parse(readFileSync(new URL('./fixtures/venus-health-0x4a4ffcee.json', import.meta.url), 'utf8')) as {
  account: string;
  block: string;
  blockTime: string;
  healthFactor: number;
  borrowLimitRatio: number;
  liquidatable: boolean;
  debtUsd: number;
  collateralUsd: number;
  rows: { collateral: Record<string, { amount: number; liqThreshold: number }>; debt: Record<string, number>; prices: Record<string, number> };
  prunedError: string;
};

const BLOCK = BigInt(real.block);
const SUBJECT: VenusHealthSubject = { chainId: VENUS_CHAIN_ID, account: real.account, pool: 'core' };

function facts(overrides: Partial<VenusHealthFacts> = {}): VenusHealthFacts {
  return {
    chainId: VENUS_CHAIN_ID,
    account: real.account,
    pool: 'core',
    block: BLOCK,
    blockTime: real.blockTime,
    /* Null by default: most fixtures never had a header, and a fixture that
       silently carried a hash would make a replay look pinned when it was not. */
    blockHash: null,
    healthFactor: real.healthFactor,
    borrowLimitRatio: real.borrowLimitRatio,
    liquidatable: real.liquidatable,
    debtUsd: real.debtUsd,
    collateralUsd: real.collateralUsd,
    ...overrides,
  };
}

const available = (f: VenusHealthFacts = facts()): VenusEvidence => ({ available: true, facts: f });

/** An ERC-8183 manifest carrying a report, the way a delivery does. */
function manifest(report: unknown): string {
  return JSON.stringify({
    version: 1,
    job_id: 4242,
    chain_id: 97,
    response: { content: JSON.stringify(report), content_type: 'application/json' },
    metadata: { producer: 'Test agent', generated_at: '2026-10-22T17:29:10.000Z' },
  });
}

/** The same, with the health factor written verbatim so its precision survives. */
function manifestWithLiteral(literal: string, extra: Record<string, unknown> = {}): string {
  const report = {
    account: real.account,
    protocol: 'Venus Core Pool, BNB Smart Chain mainnet',
    as_of: { block: real.block, time: real.blockTime },
    health_factor: 0,
    liquidatable: real.liquidatable,
    ...extra,
  };
  return manifest(report).replace('\\"health_factor\\":0', `\\"health_factor\\":${literal}`);
}

/** A Brinkwatch-shaped report over the real figures: the shape a listed agent delivers. */
function brinkwatchManifest(overrides: { healthFactor?: number | null; liquidatable?: boolean } = {}): string {
  return manifest(
    brinkwatchReport({
      account: real.account,
      block: real.block,
      blockTime: real.blockTime,
      healthFactor: overrides.healthFactor === undefined ? real.healthFactor : overrides.healthFactor,
      borrowLimitRatio: real.borrowLimitRatio,
      liquidatable: overrides.liquidatable ?? real.liquidatable,
      collateral: real.rows.collateral,
      debt: real.rows.debt,
      target: 1.5,
    }),
  );
}

/** The whole check with the chain read stubbed, recording which blocks it asked for. */
async function check(manifestText: string | null, evidence: VenusEvidence | ((at: { account: string; block: bigint }) => VenusEvidence), options: { matchesChain?: boolean | null; subject?: VenusHealthSubject } = {}) {
  const asked: Array<{ account: string; block: bigint }> = [];
  const verification = await checkDeliveredVenusReport({
    subject: options.subject ?? SUBJECT,
    manifestText,
    manifestMatchesChain: options.matchesChain === undefined ? true : options.matchesChain,
    readFactsAt: async (at) => {
      asked.push(at);
      return typeof evidence === 'function' ? evidence(at) : evidence;
    },
  });
  return { verification, asked };
}

/* ---------- 1. a matching report ---------- */

test('1. a report whose figures agree with Venus at the named block matches the checked facts', async () => {
  const { verification: v, asked } = await check(brinkwatchManifest(), available());
  assert.equal(v.verdict, 'matches');
  assert.equal(v.headline, 'Matches checked facts');
  assert.equal(v.block, real.block);
  // Bound to the block the report named, and nothing else was read.
  assert.deepEqual(asked, [{ account: real.account, block: BLOCK }]);

  const hf = v.values.find((row) => row.label === 'Health factor');
  assert.equal(hf?.agrees, true, v.detail);
  assert.equal(hf?.checked, String(Number(real.healthFactor.toFixed(4))));
  assert.equal(v.values.find((row) => row.label === 'Liquidatable')?.agrees, true);
  // The USD totals a Brinkwatch report states are checked too, not ignored.
  assert.equal(v.values.find((row) => row.label === 'Debt (USD)')?.agrees, true);
  assert.equal(v.values.find((row) => row.label === 'Collateral (USD)')?.agrees, true);
});

test('1b. a health factor rounded to two decimal places still matches, because rounding is what the tolerance is for', async () => {
  // 1.12 against 1.122279: inside the allowance, and only just.
  const gap = Math.abs(1.12 - real.healthFactor);
  assert.ok(gap > HF_ABSOLUTE_TOLERANCE * 0.4 && gap <= hfTolerance(real.healthFactor), `gap ${gap}`);
  const { verification: v } = await check(manifestWithLiteral('1.12'), available());
  assert.equal(v.verdict, 'matches');
});

test('1c. the tolerances are the documented numbers, and scale the way the comment says', () => {
  assert.equal(HF_ABSOLUTE_TOLERANCE, 0.005);
  assert.equal(HF_RELATIVE_TOLERANCE, 0.005);
  // The absolute floor binds on a position near liquidation, the relative part above it.
  assert.equal(hfTolerance(0.8), 0.005);
  assert.equal(hfTolerance(40), 0.2);
});

/* ---------- 2. a mismatching report ---------- */

test('2. a report whose health factor disagrees with Venus differs from the checked facts', async () => {
  const { verification: v } = await check(brinkwatchManifest({ healthFactor: 1.35 }), available());
  assert.equal(v.verdict, 'differs');
  assert.equal(v.headline, 'Differs from checked facts');
  assert.match(v.detail, /1\.35/);
  assert.match(v.detail, /1\.1223/);
  assert.match(v.detail, new RegExp(real.block));
  assert.equal(v.values.find((row) => row.label === 'Health factor')?.agrees, false);
});

test('2b. the right ratio with the wrong liquidation flag differs', async () => {
  const { verification: v } = await check(brinkwatchManifest({ liquidatable: true }), available());
  assert.equal(v.verdict, 'differs');
  assert.match(v.detail, /health factor is right/i);
  assert.equal(v.values.find((row) => row.label === 'Liquidatable')?.agrees, false);
});

test('2b2. a stated USD total that disagrees differs, even with the ratio right', async () => {
  const { verification: v } = await check(manifestWithLiteral('1.1223', { debt_usd: 9_000 }), available());
  assert.equal(v.verdict, 'differs');
  assert.match(v.detail, /debt \(usd\) figure does not/i);
});

test('2c. the borrowing-limit ratio reported as the health factor is named as the definitional error it is', async () => {
  /*
   * Synthetic ratios: this real position's collateral factors and
   * liquidation thresholds nearly coincide (1.122152 against 1.122279), so
   * the two definitions cannot be told apart on it. The pair here is the
   * spread Venus produces where a market's threshold exceeds its collateral
   * factor — FDUSD is 0.75 against 0.65 — which is the error worth naming
   * and the one a bare equality check would report as an unexplained miss.
   */
  const { verification: v } = await check(manifestWithLiteral('0.9412'), available(facts({ healthFactor: 1.1223, borrowLimitRatio: 0.9412 })));
  assert.equal(v.verdict, 'differs');
  assert.match(v.detail, /borrowing-limit ratio on Venus’s collateral factors/);
  assert.match(v.detail, /liquidation thresholds/);
});

test('2d. a report claiming no debt where Venus shows debt differs, and the reverse too', async () => {
  const noDebt = await check(brinkwatchManifest({ healthFactor: null }), available());
  assert.equal(noDebt.verification.verdict, 'differs');
  assert.match(noDebt.verification.detail, /says this account has no debt/);

  const hasDebt = await check(brinkwatchManifest(), available(facts({ healthFactor: null, liquidatable: false, debtUsd: 0 })));
  assert.equal(hasDebt.verification.verdict, 'differs');
  assert.match(hasDebt.verification.detail, /no debt .*at block|shows no debt/);
});

test('2e. no debt, reported as liquidatable, differs — it cannot be both', () => {
  const v = verifyVenusReport({
    subject: SUBJECT,
    manifestText: manifest({ account: real.account, as_of: { block: real.block }, health_factor: null, liquidatable: true }),
    manifestMatchesChain: true,
    claim: readVenusReportClaim(manifest({ account: real.account, as_of: { block: real.block }, health_factor: null, liquidatable: true })),
    evidence: available(facts({ healthFactor: null, liquidatable: false, debtUsd: 0 })),
  });
  assert.equal(v.verdict, 'differs');
  assert.match(v.detail, /nothing to liquidate/);
});

/* ---------- 3. could not verify ---------- */

test('3. a report that names no block cannot be verified, and is never checked at head', async () => {
  const noBlock = manifest({ account: real.account, protocol: 'Venus Core Pool', health_factor: real.healthFactor, liquidatable: false });
  const { verification: v, asked } = await check(noBlock, available());
  assert.equal(v.verdict, 'unverified');
  assert.equal(v.headline, 'Could not verify');
  assert.match(v.detail, /does not say which block/);
  assert.match(v.detail, /not treated as “the latest”/);
  // The decisive part: with no block, no chain read is even attempted.
  assert.deepEqual(asked, []);
});

test('3b. a node that no longer serves the block cannot verify — the real refusal, in the node’s own words', async () => {
  // The fixture's `prunedError` is what bsc-dataseed.bnbchain.org actually
  // answered for state two million blocks old, through viem.
  const refusal = venusReadRefusal(new Error(real.prunedError));
  assert.equal(refusal.code, 'no-history');
  assert.equal(refusal.detail, 'missing trie node.');

  const { verification: v } = await check(brinkwatchManifest(), { available: false, ...refusal });
  assert.equal(v.verdict, 'unverified');
  assert.match(v.detail, /no longer served by the node/);
  assert.match(v.detail, /missing trie node/);
  assert.match(v.detail, /will not substitute a reading at a different block/);
});

test('3b2. a refusal that is not about history is reported as Pokter’s own failure to see', () => {
  const refusal = venusReadRefusal(new Error('fetch failed'));
  assert.equal(refusal.code, 'read-failed');
  assert.equal(refusal.detail, 'fetch failed.');
});

test('3c. an ambiguous market cannot be verified', async () => {
  const twoPools = manifest({
    account: real.account,
    protocol: 'Venus Core Pool and the Stablecoins pool, BNB Smart Chain',
    as_of: { block: real.block },
    health_factor: real.healthFactor,
    liquidatable: false,
  });
  const { verification: v, asked } = await check(twoPools, available());
  assert.equal(v.verdict, 'unverified');
  assert.match(v.detail, /more than one Venus pool/);
  assert.match(v.detail, /no single health factor spanning them/);
  assert.deepEqual(asked, [], 'an undecidable market is settled before any chain read');

  const isolated = manifest({ account: real.account, pool: 'Stablecoins', as_of: { block: real.block }, health_factor: real.healthFactor, liquidatable: false });
  const only = await check(isolated, available());
  assert.equal(only.verification.verdict, 'unverified');
  assert.match(only.verification.detail, /Stablecoins pool/);
  assert.match(only.verification.detail, /Core Pool only/);
});

test('3c2. “DeFi” inside a sentence is not a second pool', () => {
  const claim = readVenusReportClaim(manifest({ account: real.account, protocol: 'Venus (DeFi lending) Core Pool on BNB Chain', as_of: { block: real.block }, health_factor: 1.1 }));
  assert.ok(claim.ok);
  assert.deepEqual(claim.claim.pools, ['core']);
});

test('3d. a delivery that does not match its hash on chain is not evidence, so nothing is verified', async () => {
  const mismatched = await check(brinkwatchManifest(), available(), { matchesChain: false });
  assert.equal(mismatched.verification.verdict, 'unverified');
  assert.match(mismatched.verification.detail, /does not hash to the deliverable the agent committed/);
  assert.deepEqual(mismatched.asked, []);

  // And a hash Pokter could not read at all is not quietly treated as a match.
  const unknown = await check(brinkwatchManifest(), available(), { matchesChain: null });
  assert.equal(unknown.verification.verdict, 'unverified');
  assert.match(unknown.verification.detail, /could not confirm/);
});

test('3e. a health factor stated too coarsely to check is neither a match nor a mismatch', async () => {
  // 1.1 against 1.122279: outside the tolerance, inside the report's own ±0.05.
  const { verification: v } = await check(manifestWithLiteral('1.1'), available());
  assert.equal(v.verdict, 'unverified');
  assert.match(v.detail, /to 1 decimal place/);
  assert.match(v.detail, /cannot be told apart/);
  assert.equal(v.values.find((row) => row.label === 'Health factor')?.agrees, null);
  assert.equal(HF_MIN_STATED_DECIMALS, 2);

  // The same number written to four places is a precise claim, and is wrong.
  const precise = await check(manifestWithLiteral('1.1000'), available());
  assert.equal(precise.verification.verdict, 'differs');
});

test('3f. a liquidation field that is not a yes or no leaves half the answer unchecked', async () => {
  const { verification: v } = await check(manifestWithLiteral('1.1223', { liquidatable: 'maybe' }), available());
  assert.equal(v.verdict, 'unverified');
  assert.match(v.detail, /liquidation field is/);
  assert.match(v.detail, /cannot be checked/);
});

test('3g. a block the chain has not reached, nothing delivered, and an unreadable file all fail safe', async () => {
  const ahead = await check(brinkwatchManifest(), { available: false, code: 'block-ahead-of-head', detail: 'the chain is at block 1.' });
  assert.equal(ahead.verification.verdict, 'unverified');
  assert.match(ahead.verification.detail, /which the chain has not reached/);

  const nothing = await check(null, available());
  assert.equal(nothing.verification.verdict, 'unverified');
  assert.match(nothing.verification.detail, /Nothing has been delivered/);
  assert.deepEqual(nothing.asked, []);

  const garbage = await check('not json at all', available());
  assert.equal(garbage.verification.verdict, 'unverified');
  assert.match(garbage.verification.detail, /could not be read as a report/);

  const prose = await check(JSON.stringify({ response: { content: 'The health factor is about 1.12 and looks fine.' } }), available());
  assert.equal(prose.verification.verdict, 'unverified');
  assert.match(prose.verification.detail, /does not say which block/);
});

test('3g2. the head is checked before the state is, so an invented block is not reported as a pruned one', async () => {
  /*
   * 3g proves the verdict for a `block-ahead-of-head` packet. This proves
   * the packet: nothing else decides that a block is ahead of the head, and
   * without it a future block arrives as whatever the node says for state
   * it does not have — on BSC "missing trie node", which `venusReadRefusal`
   * classifies as `no-history`. The buyer would then be told the node no
   * longer keeps that block, when the truth is the chain never reached it.
   *
   * Stubbed rather than networked: `getBlockNumber` is the only call a
   * future block ever gets to make, so a position read attempted here is
   * itself the failure.
   */
  const stub = (head: bigint) => {
    const calls: string[] = [];
    const client = {
      getBlockNumber: async () => {
        calls.push('getBlockNumber');
        return head;
      },
      readContract: async () => {
        calls.push('readContract');
        throw new Error('missing trie node');
      },
      getBlock: async () => {
        calls.push('getBlock');
        throw new Error('header not found');
      },
    } as unknown as Parameters<typeof readVenusFactsAt>[0];
    return { client, calls };
  };

  const head = BigInt(real.block);
  const { client, calls } = stub(head);
  const ahead = await readVenusFactsAt(client, { account: real.account, block: head + 1n });
  assert.equal(ahead.available, false);
  if (ahead.available) return;
  assert.equal(ahead.code, 'block-ahead-of-head');
  assert.match(ahead.detail, new RegExp(`the chain is at block ${head}`));
  // Not a pruning refusal, which is what this would otherwise be read as.
  assert.notEqual(ahead.code, 'no-history');
  assert.deepEqual(calls, ['getBlockNumber'], 'no state is read for a block the chain has not reached');

  // And a head read that fails is Pokter's failure to see, not a finding.
  const dead = {
    getBlockNumber: async () => {
      throw new Error('fetch failed');
    },
  } as unknown as Parameters<typeof readVenusFactsAt>[0];
  const unreadable = await readVenusFactsAt(dead, { account: real.account, block: head });
  assert.equal(unreadable.available, false);
  if (unreadable.available) return;
  assert.equal(unreadable.code, 'read-failed');
});

test('3i. a lifecycle receipt is not a report that forgot its figures', async () => {
  /*
   * Pokter's own seller submits these to prove funding, delivery and
   * settlement work; they carry no answer from the agent. Classified with
   * `readDeliveredManifest`, the same reader the rest of the product uses,
   * so this check cannot disagree with an agent's page about what a
   * delivery is. Calling it "no health factor" would put a finding against
   * an agent whose work is not in the file.
   */
  const receipt = JSON.stringify({
    version: 1,
    job_id: 1372,
    chain_id: 97,
    response: { content: JSON.stringify({ status: 'delivered', note: 'Lifecycle proof: funded, delivered, settled.' }) },
    metadata: { producer: 'Pokter delivery agent (courier)' },
  });
  const { verification: v, asked } = await check(receipt, available());
  assert.equal(v.verdict, 'unverified');
  assert.match(v.detail, /lifecycle receipt/);
  assert.match(v.detail, /not a finding about the agent/);
  assert.deepEqual(asked, []);

  // A relayed answer is the agent's own work carried by Pokter, and is checked.
  const relayed = JSON.stringify({
    version: 1,
    job_id: 1585,
    chain_id: 97,
    response: { content: JSON.stringify({ answer: { account: real.account, health_factor: real.healthFactor, liquidatable: false, as_of: { block: real.block } }, answered_by: { chain_id: 97, token_id: '2618' } }) },
    metadata: { producer: 'Pokter delivery agent (courier)', answered_by: '97:2618' },
  });
  assert.equal((await check(relayed, available())).verification.verdict, 'matches');
});

test('3j. a stored delivery that is valid JSON but not a manifest is nothing known, not a crash', () => {
  // `readDeliverable` returns whatever was stored, and `null`, a number and
  // an array all parse and then have no fields (origin/main f2eab0a9).
  for (const stored of ['null', '42', '[1,2]', '"just a string"']) {
    const claim = readVenusReportClaim(stored);
    assert.equal(claim.ok, false, stored);
    if (!claim.ok) assert.equal(claim.code, 'unreadable', stored);
  }
});

test('3h. the subject comes from the funded brief, and an undecidable subject cannot be verified', () => {
  const one = venusSubjectFromBrief(`Venus health factor for ${real.account} and the repay that restores 1.5`);
  assert.ok(one.ok);
  assert.equal(one.subject.account, real.account);
  // Venus Core Pool is on mainnet whichever escrow paid for the job.
  assert.equal(one.subject.chainId, 56);

  const none = venusSubjectFromBrief('Check my Venus position please');
  assert.equal(none.ok, false);

  const two = venusSubjectFromBrief(`Compare ${real.account} with 0x1111111111111111111111111111111111111111`);
  assert.equal(two.ok, false);
  if (!two.ok) assert.equal(two.code, 'ambiguous');

  // The same address twice is one subject, not an ambiguity.
  const repeated = venusSubjectFromBrief(`${real.account} and ${real.account.toLowerCase()}`);
  assert.equal(repeated.ok, true);

  const refusal = cannotVerify('The brief names no wallet address.');
  assert.equal(refusal.verdict, 'unverified');
  assert.equal(refusal.headline, 'Could not verify');
  assert.ok(refusal.method.length > 0 && refusal.limitations.length > 0, 'a refusal still explains the method it could not run');
});

/* ---------- 4. unrelated or wrong-block evidence cannot pass ---------- */

test('4. evidence read at another block cannot pass, even when every figure agrees', () => {
  const v = verifyVenusReport({
    subject: SUBJECT,
    manifestText: brinkwatchManifest(),
    manifestMatchesChain: true,
    claim: readVenusReportClaim(brinkwatchManifest()),
    // Identical figures, one block away. A caller that fell back to the head
    // would hand over exactly this.
    evidence: available(facts({ block: BLOCK + 1n })),
  });
  assert.equal(v.verdict, 'unverified');
  assert.match(v.detail, /does not belong to this claim/);
  assert.notEqual(v.verdict, 'matches');
});

test('4b. evidence about another account or another chain cannot pass', () => {
  const read = (evidence: VenusEvidence) =>
    verifyVenusReport({ subject: SUBJECT, manifestText: brinkwatchManifest(), manifestMatchesChain: true, claim: readVenusReportClaim(brinkwatchManifest()), evidence });

  const otherAccount = read(available(facts({ account: '0x1111111111111111111111111111111111111111' })));
  assert.equal(otherAccount.verdict, 'unverified');
  assert.match(otherAccount.detail, /does not belong to this claim/);

  const otherChain = read(available(facts({ chainId: 97 })));
  assert.equal(otherChain.verdict, 'unverified');
});

test('4c. a report about another wallet cannot pass, however right its numbers are', async () => {
  const other = '0x1111111111111111111111111111111111111111';
  const report = manifest({ account: other, protocol: 'Venus Core Pool', as_of: { block: real.block }, health_factor: real.healthFactor, liquidatable: false });
  const { verification: v, asked } = await check(report, available());
  assert.equal(v.verdict, 'differs');
  assert.match(v.detail, new RegExp(`about ${other}`));
  assert.match(v.detail, /not the account this job asked about/);
  assert.deepEqual(asked, [], 'the wrong subject is settled before any chain read');
});

test('4d. a report that says it read another chain cannot pass', async () => {
  const report = manifest({ account: real.account, chain_id: 97, protocol: 'Venus Core Pool', as_of: { block: real.block }, health_factor: real.healthFactor, liquidatable: false });
  const { verification: v } = await check(report, available());
  assert.equal(v.verdict, 'differs');
  assert.match(v.detail, /read chain 97/);
});

test('4d2. a chain Pokter cannot resolve is never certified as matching BNB Chain', async () => {
  /*
   * The false-claim class, found by an outside review. `readChain` used to
   * return null for anything it could not map, null meant "not compared",
   * and a report declaring Ethereum collected "Matches checked facts"
   * against BNB Chain figures with its own claim never mentioned.
   *
   * Three outcomes, and the only one that may be silent is the one where
   * the report has claimed nothing.
   */
  const withChain = (chain: unknown) =>
    manifest({ account: real.account, protocol: 'Venus Core Pool', chain, as_of: { block: real.block }, health_factor: real.healthFactor, liquidatable: false });

  // Named unmistakably: a disagreement the report earned.
  for (const named of ['Ethereum', 'ethereum mainnet', 'Arbitrum One', 'Polygon PoS']) {
    const { verification: v, asked } = await check(withChain(named), available());
    assert.equal(v.verdict, 'differs', named);
    assert.match(v.detail, new RegExp(named.split(' ')[0], 'i'));
    assert.deepEqual(asked, [], 'a wrong chain is settled before any chain read');
  }

  // Named, and Pokter cannot tell what it is: not a match, and not a finding.
  for (const named of ['Hyperliquid', 'our internal fork', 'chain-42161-beta']) {
    const { verification: v } = await check(withChain(named), available());
    assert.equal(v.verdict, 'unverified', named);
    assert.match(v.detail, /cannot tell whether that is the BNB Chain/);
    assert.equal(v.values.find((row) => row.label === 'Chain')?.agrees, null);
  }

  // A generic deployment qualifier is not a chain claim, and must not cost a match.
  for (const named of ['mainnet', 'Mainnet', 'production', 'live', 'BNB Smart Chain mainnet', 'BSC']) {
    assert.equal((await check(withChain(named), available())).verification.verdict, 'matches', named);
  }

  // A non-numeric `chain_id` is still an explicit claim and is classified the same way.
  const explicit = manifest({ account: real.account, chain_id: 'ethereum', as_of: { block: real.block }, health_factor: real.healthFactor, liquidatable: false });
  assert.equal((await check(explicit, available())).verification.verdict, 'differs');

  // And naming no chain at all stays a match: the request decided the chain.
  const silent = manifest({ account: real.account, protocol: 'Venus Core Pool', as_of: { block: real.block }, health_factor: real.healthFactor, liquidatable: false });
  const quiet = await check(silent, available());
  assert.equal(quiet.verification.verdict, 'matches');
  const parsed = readVenusReportClaim(silent);
  assert.ok(parsed.ok);
  assert.deepEqual(parsed.claim.chain, { kind: 'none' }, 'naming no chain is not the same as naming an unreadable one');
});

test('4e. the check only ever asks for the block the report named', async () => {
  const stray = BLOCK - 5_000n;
  const report = manifest({ account: real.account, protocol: 'Venus Core Pool', as_of: { block: stray.toString() }, health_factor: real.healthFactor, liquidatable: false });
  // The stub answers for whatever block it is given, so a verdict here can
  // only come from the claimed block being the one read.
  const { verification: v, asked } = await check(report, (at) => available(facts({ block: at.block })));
  assert.deepEqual(asked, [{ account: real.account, block: stray }]);
  assert.equal(v.block, stray.toString());
  assert.equal(v.verdict, 'matches');
});

test('4f. a block that is not a block number is refused rather than coerced', () => {
  for (const value of ['latest', '2026-10-22T17:28:47Z', '1.5', '-12', '0', 'abc']) {
    const claim = readVenusReportClaim(manifest({ account: real.account, as_of: { block: value }, health_factor: 1.12, liquidatable: false }));
    assert.equal(claim.ok, false, `accepted ${value}`);
    if (!claim.ok) assert.equal(claim.code, 'bad-block', `wrong refusal for ${value}`);
  }
  // Decimal, hex and separated forms are all real block numbers.
  for (const value of [real.block, '0x79475E5' as const, 129_170_001, '129,170,001']) {
    const claim = readVenusReportClaim(manifest({ account: real.account, as_of: { block: value }, health_factor: 1.12, liquidatable: false }));
    assert.equal(claim.ok, true, `refused ${String(value)}`);
  }
});

test('4g. the check is not offered for a job that asked for something else', () => {
  assert.equal(venusHealthJob({ category: 'health-factor', brief: 'anything' }), true);
  assert.equal(venusHealthJob({ category: null, brief: 'Venus health factor for 0x1234' }), true);
  assert.equal(venusHealthJob({ category: 'grid-trading', brief: 'Is my grid still right for this market?' }), false);
  assert.equal(venusHealthJob({ category: null, brief: 'Rebalance my portfolio to 60/40' }), false);
});

/* ---------- a real delivered report, byte for byte ---------- */

/**
 * The delivery of job 56:57004 on BNB Chain mainnet, as served.
 *
 * A funded hire of Brinkwatch (97/2618) on 15 October 2026, asking how
 * close 0x4f43…297B was to liquidation on Venus. The file is the bytes
 * pokter.xyz serves at the URL the agent committed, and it hashes exactly
 * to the job's on-chain `deliverable`,
 * 0xe866ea28fcdbe697f48aec75f3007abdd868dc7ffbe707dac6a42c5fbd2c5f48 —
 * asserted below, so the fixture cannot drift from the delivery it claims
 * to be.
 *
 * It also shows why the liquidation flag has to be optional: this report
 * states `status: "comfortable"` and no `liquidatable` field at all, which
 * is the gap `house/agents/brinkwatch-report.ts` records being fixed after
 * this delivery was made.
 */
const delivered = readFileSync(new URL('./fixtures/deliverable-57004.json', import.meta.url), 'utf8');
const DELIVERED_HASH = '0xe866ea28fcdbe697f48aec75f3007abdd868dc7ffbe707dac6a42c5fbd2c5f48';
const DELIVERED_ACCOUNT = '0x4f43d4173227bF19b180f1f54804bF2C9045297B';
const DELIVERED_BLOCK = 127_782_760n;

test('a real delivered report is read as the claim it makes, and is the file the chain committed', () => {
  assert.equal(manifestMatch(delivered, DELIVERED_HASH), 'exact', 'the fixture is no longer the committed delivery');

  const parsed = readVenusReportClaim(delivered);
  assert.ok(parsed.ok, 'a real Brinkwatch report should parse');
  const claim = parsed.claim;
  assert.equal(claim.account, DELIVERED_ACCOUNT);
  assert.equal(claim.block, DELIVERED_BLOCK);
  assert.deepEqual(claim.pools, ['core'], 'read from "Venus Core Pool, BNB Smart Chain mainnet"');
  assert.equal(claim.healthFactor, 1.8655);
  assert.equal(claim.statedDecimals, 4);
  assert.equal(claim.liquidatable, null, 'this report states a status, not a liquidation flag');
  assert.equal(claim.liquidatableRaw, null);
  assert.equal(claim.debtUsd, 130_011.88);
  assert.equal(claim.collateralUsd, 376_368.41);
  // `borrow_limit_used` is 1/ratio and is not a health factor; it must not
  // be mistaken for one.
  assert.notEqual(claim.healthFactor, 0.9583);
});

test('the real delivery is checkable end to end, and an unstated liquidation flag does not cost it a match', async () => {
  /*
   * Venus at block 127,782,760 can no longer be read — it is over a
   * million blocks old and every free endpoint has pruned it, which is
   * exactly why this delivery resolves to "could not verify" in
   * production. The facts in this first assertion are therefore
   * reconstructed from the report itself, so what it proves is that a real
   * delivery of this shape flows through the comparison and that a report
   * which states no liquidation flag is not failed for it. The comparison
   * against figures actually read from the chain is the other fixture's
   * job.
   */
  const subject: VenusHealthSubject = { chainId: VENUS_CHAIN_ID, account: DELIVERED_ACCOUNT, pool: 'core' };
  const reconstructed: VenusHealthFacts = {
    chainId: VENUS_CHAIN_ID,
    account: DELIVERED_ACCOUNT,
    pool: 'core',
    block: DELIVERED_BLOCK,
    blockTime: '2026-10-15T11:59:31.000Z',
    blockHash: null,
    healthFactor: 1.8655,
    borrowLimitRatio: 1 / 0.9583,
    liquidatable: false,
    debtUsd: 130_011.88,
    collateralUsd: 376_368.41,
  };
  const matched = await check(delivered, available(reconstructed), { subject });
  assert.equal(matched.verification.verdict, 'matches');
  assert.equal(matched.verification.values.find((row) => row.label === 'Liquidatable')?.agrees, null);
  assert.match(matched.verification.values.find((row) => row.label === 'Liquidatable')?.note ?? '', /does not say/);
  assert.deepEqual(matched.asked, [{ account: DELIVERED_ACCOUNT, block: DELIVERED_BLOCK }]);

  // And what it actually resolves to today: the node no longer has the block.
  const today = await check(delivered, { available: false, ...venusReadRefusal(new Error(real.prunedError)) }, { subject });
  assert.equal(today.verification.verdict, 'unverified');
  assert.equal(today.verification.block, DELIVERED_BLOCK.toString());
  assert.match(today.verification.detail, /no longer served by the node/);

  // The brief this job was funded with names one wallet, and it is that one.
  const fromBrief = venusSubjectFromBrief(`How close is ${DELIVERED_ACCOUNT} to liquidation on Venus? Target health factor 1.3`);
  assert.ok(fromBrief.ok);
  assert.equal(fromBrief.subject.account, DELIVERED_ACCOUNT);
});

/* ---------- 5. a buyer-readable presentation of all three ---------- */

test('5. every verdict is presentable without reading JSON: a headline, a reason, method, tolerances and limits', async () => {
  const matches = (await check(brinkwatchManifest(), available())).verification;
  const differs = (await check(brinkwatchManifest({ healthFactor: 1.35 }), available())).verification;
  const unverified = (await check(brinkwatchManifest(), { available: false, ...venusReadRefusal(new Error(real.prunedError)) })).verification;

  assert.deepEqual(
    [matches.verdict, differs.verdict, unverified.verdict],
    ['matches', 'differs', 'unverified'],
    'the three outcomes, and only the three',
  );
  assert.deepEqual([matches.headline, differs.headline, unverified.headline], ['Matches checked facts', 'Differs from checked facts', 'Could not verify']);

  for (const v of [matches, differs, unverified]) {
    assert.ok(v.detail.length > 40, v.headline);
    // No JSON, no object dumps, no bare contract addresses in the reason.
    assert.doesNotMatch(v.detail, /[{}]|\[object/, v.detail);
    assert.ok(v.method.length >= 3, 'the calculation is stated');
    assert.ok(v.tolerance.length >= 3, 'the tolerances are stated');
    assert.ok(v.limitations.length >= 3, 'the limits are stated');
    assert.ok(v.tolerance.some((line) => line.includes('0.005')), 'the tolerance is numeric');
    assert.ok(v.limitations.some((line) => /Core Pool only/.test(line)));
    for (const row of v.values) {
      assert.doesNotMatch(row.reported, /[{}]|\[object/);
      assert.doesNotMatch(row.checked, /[{}]|\[object/);
    }
  }

  // The checked values are shown with the block they belong to.
  assert.equal(matches.block, real.block);
  assert.equal(matches.blockTime, real.blockTime);
  assert.ok(matches.evidence.some((line) => line.includes('getAccountLiquidity')));
  assert.ok(matches.evidence.every((line) => line.includes(real.block)));
});

test('5b. a match says in the interface what it does not mean', () => {
  assert.ok(CHECK_MEANS.length >= 1);
  const text = CHECK_DOES_NOT_MEAN.join(' ');
  assert.match(text, /does not certify the rest of the report/i);
  assert.match(text, /not investment advice/i);
  assert.match(text, /does not say the position is safe/i);
  assert.match(text, /release, refund or dispute/i);

  const component = readFileSync(new URL('../src/features/workspace/ReportCheck.tsx', import.meta.url), 'utf8');
  // The three headlines are the server's words, rendered rather than restated.
  assert.match(component, /\{v\.headline\}/);
  assert.match(component, /\{v\.detail\}/);
  // A match shows the limits open on the page, not behind a disclosure.
  assert.match(component, /v\.verdict === 'matches' &&[\s\S]{0,600}doesNotMean/);
  // And it renders what was compared rather than serialising it.
  assert.doesNotMatch(component, /JSON\.stringify/);
  assert.match(component, /v\.values\.map/);
  // Phone first: every responsive grid starts at one column.
  for (const grid of component.match(/grid-cols-\[[^\]]*\]/g) ?? []) {
    assert.match(grid, /^grid-cols-\[/);
  }
  assert.ok((component.match(/grid-cols-1/g) ?? []).length >= 1, 'the value rows stack on a phone');
  assert.match(component, /aria-busy="true"/, 'the loading state is announced');
});

test('5c. the route is wired to the same pure check, read-only, and decides nothing about the money', () => {
  /*
   * The route is `server-only` by way of the deliverable store, so it
   * cannot be imported here. Asserted as source facts instead: that it is
   * a GET, that it calls the pure check rather than reimplementing it, and
   * that it touches none of the settlement paths.
   */
  const route = readFileSync(new URL('../src/app/api/jobs/[jobId]/report-check/route.ts', import.meta.url), 'utf8');
  assert.match(route, /export async function GET/);
  assert.doesNotMatch(route, /export async function (POST|PUT|PATCH|DELETE)/);
  assert.match(route, /checkDeliveredVenusReport/);
  assert.match(route, /readVenusFactsAt/);
  // The subject comes from the brief on chain, never from the delivery.
  assert.match(route, /venusSubjectFromBrief\(brief\)/);
  assert.match(route, /jobTaskFromDescription/);
  // The hash is compared, and an absent commitment is null rather than true.
  assert.match(route, /manifestMatch\(manifestText, committed\) !== null/);
  // And the meaning of a verdict travels with it, so the UI cannot drop it.
  assert.match(route, /CHECK_DOES_NOT_MEAN/);

  /*
   * Nothing here settles, releases, disputes, reclaims or signs. Asserted
   * on the code with the comments stripped: the doc comment says in prose
   * that it releases nothing, and matching on the whole file found its own
   * disclaimer.
   */
  const code = route.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  assert.doesNotMatch(code, /adminSigner|settleErc8183|submitErc8183|approveJob|giveFeedback|writeContract|sendTransaction|signMessage/);
  for (const word of ['settle', 'release', 'dispute', 'reclaim']) {
    assert.doesNotMatch(code, new RegExp(`${word}`, 'i'), `the route mentions ${word}`);
  }

  const detail = readFileSync(new URL('../src/features/workspace/JobDetail.tsx', import.meta.url), 'utf8');
  assert.match(detail, /<ReportCheck job=\{job\} \/>/, 'the panel is on the job page');
});
