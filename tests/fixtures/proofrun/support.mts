/**
 * The machinery the ProofRun fixtures are read and served through.
 *
 * Not a test and not run by `npm test`, which globs `tests/*.test.mts`. It
 * lives beside the fixtures because it is part of them: the JSON files
 * declare a case, and this turns a case into the three things a test needs —
 * the delivered file, the receipt that was sealed from it, and a BNB Chain
 * endpoint that will answer a replay's own `eth_call`s with that case's
 * state.
 *
 * The stub endpoint is why this exists at all. The captured block is over a
 * million blocks old and every free node has pruned it, and an archive key
 * is not something a test may require, so the only way to run the real CLI
 * end to end — as a process, with its exit code, against a node it has to
 * ask for state — is to stand up a node that answers exactly the calls
 * `readVenusPosition` makes. It serves nothing else, holds no state of its
 * own, and records which blocks it was asked for, which is how the suite
 * proves the verifier never reaches for the head.
 */
import { createServer, type Server } from 'node:http';
import { readFileSync } from 'node:fs';

import { encodeAbiParameters, keccak256, stringToBytes, toFunctionSelector, type Address } from 'viem';

import { VENUS_COMPTROLLER } from '@/lib/assay/venus';
import {
  CHECKED_POOL,
  VENUS_CHAIN_ID,
  readVenusReportClaim,
  verifyVenusReport,
  type VenusEvidence,
  type VenusHealthFacts,
  type VenusHealthSubject,
} from '@/lib/delivery/venus-report-check';
import { venusReadRefusal } from '@/lib/delivery/venus-facts';
import { bindingFor, criteriaForTerms, venusAcceptanceSpec, venusHealthCriteria } from '@/lib/proofrun/acceptance';
import type { SealedArtifact } from '@/lib/proofrun/artifact';
import { proofRun } from '@/lib/proofrun/run';
import type { AcceptanceSpec, Criterion } from '@/lib/shared/contracts';

/* ---------- the fixture files ---------- */

export interface FixtureLeg {
  supplyUsd: number;
  liquidationThreshold: number;
  collateralFactor: number;
}

export interface ProofRunFixture {
  _why: string;
  fixture: true;
  provenance: 'fixture';
  case: string;
  attribution: string;
  basedOn?: string;
  subject?: { chainId: number; account: string; pool: 'core'; blockNumber: string; blockHash: string | null };
  chain?: {
    real: boolean;
    read: 'available' | 'refused';
    note: string;
    servesBlockHash?: string;
    facts?: {
      blockTime: string;
      healthFactor: number | null;
      borrowLimitRatio: number | null;
      liquidatable: boolean;
      debtUsd: number;
      collateralUsd: number;
    };
    legs?: { _note?: string; collateral: Record<string, FixtureLeg>; debt: Record<string, number> };
    nodeError?: string;
    nodeErrorFrom?: string;
    nodeWords?: string;
    nodeRpcCode?: number;
    expectRefusalCode?: 'no-history' | 'read-failed' | 'block-ahead-of-head';
    expectRefusalDetail?: string;
  };
  report?: Record<string, unknown>;
  edits?: Array<{ name: string; guard: string; target: string; to: unknown; reseal: boolean | 'forged-hash'; expect: string; _why: string }>;
  changes?: Array<{ name: string; field: string; to: string; expect: string; _why: string }>;
  expect: Record<string, unknown>;
}

/** Every fixture file, in the order they are numbered. */
export const FIXTURE_FILES = [
  '01-correct-report.json',
  '02-plausible-wrong-report.json',
  '03-bad-decimals.json',
  '04-zero-debt.json',
  '05-stale-oracle.json',
  '06-unsupported-market.json',
  '07-pruned-archive.json',
  '08-mismatched-block-hash.json',
  '09-tampered-artifact.json',
  '10-changed-verifier-version.json',
] as const;

export function loadFixture(file: string): ProofRunFixture {
  return JSON.parse(readFileSync(new URL(`./${file}`, import.meta.url), 'utf8')) as ProofRunFixture;
}

/** The node's own words for a pruned block, read from the one place they are recorded. */
export function nodeErrorOf(fixture: ProofRunFixture): string {
  const chain = fixture.chain;
  if (chain?.nodeError) return chain.nodeError;
  if (chain?.nodeErrorFrom === 'tests/fixtures/venus-health-0x4a4ffcee.json#prunedError') {
    const sibling = JSON.parse(readFileSync(new URL('../venus-health-0x4a4ffcee.json', import.meta.url), 'utf8')) as { prunedError: string };
    return sibling.prunedError;
  }
  throw new Error(`${fixture.case}: no node error recorded`);
}

/**
 * What a node would actually put on the wire, as against what viem makes of it.
 *
 * `nodeErrorOf` returns the captured viem string, which is what the refusal
 * classifier is held to. A stub endpoint must send the node's own part of it
 * instead: feed viem's own packaging back as a node message and it gets
 * wrapped a second time, so the replay's output quotes a URL and a request
 * body belonging to the original capture rather than to the call it just
 * made. The first run of this suite printed bsc-dataseed.bnbchain.org in the
 * output of a run that had only ever talked to 127.0.0.1.
 */
export function stubErrorOf(fixture: ProofRunFixture): { code: number; message: string } {
  const chain = fixture.chain;
  if (!chain?.nodeWords) throw new Error(`${fixture.case}: no node words recorded`);
  return { code: chain.nodeRpcCode ?? -32000, message: chain.nodeWords };
}

/* ---------- a case as the pieces a run needs ---------- */

export function subjectOf(fixture: ProofRunFixture): VenusHealthSubject {
  const subject = fixture.subject;
  if (!subject) throw new Error(`${fixture.case}: no subject`);
  return { chainId: subject.chainId, account: subject.account, pool: CHECKED_POOL };
}

export function factsOf(fixture: ProofRunFixture): VenusHealthFacts {
  const subject = fixture.subject;
  const facts = fixture.chain?.facts;
  if (!subject || !facts) throw new Error(`${fixture.case}: no chain facts`);
  return {
    chainId: subject.chainId,
    account: subject.account,
    pool: CHECKED_POOL,
    block: BigInt(subject.blockNumber),
    blockTime: facts.blockTime,
    blockHash: subject.blockHash,
    healthFactor: facts.healthFactor,
    borrowLimitRatio: facts.borrowLimitRatio,
    liquidatable: facts.liquidatable,
    debtUsd: facts.debtUsd,
    collateralUsd: facts.collateralUsd,
  };
}

export function evidenceOf(fixture: ProofRunFixture): VenusEvidence {
  if (fixture.chain?.read === 'refused') {
    return { available: false, ...venusReadRefusal(new Error(nodeErrorOf(fixture))) };
  }
  return { available: true, facts: factsOf(fixture) };
}

/**
 * The brief the job was funded with.
 *
 * The account is in it because that is where a verdict's subject has to come
 * from: a report that chose its own subject could answer correctly about any
 * wallet and collect a pass for a position nobody asked about.
 */
export function briefOf(fixture: ProofRunFixture): string {
  const subject = fixture.subject;
  if (!subject) throw new Error(`${fixture.case}: no subject`);
  return `How close is ${subject.account} to liquidation on Venus Core Pool? Give the health factor at a named block. Target health factor 1.5.`;
}

/**
 * The delivered file, as an ERC-8183 manifest.
 *
 * `health_factor` goes through `JSON.stringify` untouched, so a fixture
 * stating 1.1 is delivered as `1.1` and `statedHfDecimals` recovers one
 * decimal place from it. Writing it back out through `toFixed` would hand
 * every report four places and switch off the precision guard.
 */
export function manifestOf(fixture: ProofRunFixture): string {
  if (!fixture.report) throw new Error(`${fixture.case}: no report`);
  return JSON.stringify({
    version: 1,
    job_id: 0,
    chain_id: 97,
    response: { content: JSON.stringify(fixture.report), content_type: 'application/json' },
    metadata: {
      producer: 'ProofRun fixture (synthetic). No agent produced this and it is not any builder’s work.',
      generated_at: '2026-10-24T00:00:00.000Z',
    },
  });
}

/**
 * A criteria set that is not the shipped one, for proving a hash over one set
 * does not bind another.
 *
 * This used to be the five criteria `checksFromVerification` could settle,
 * which existed because `binding.account` and `binding.chain` could not be
 * settled positively and the shipped set could therefore never reach
 * `verified`. Both are inferred now, so every fixture runs on the shipped
 * criteria and all this is still needed for is a second, different set.
 */
export function aDifferentCriteriaSet(): Criterion[] {
  return venusHealthCriteria().filter((criterion) => criterion.id !== 'position.collateral_usd');
}

/** A spec whose criteria the agent signed, so the receipt's binding is the real one. */
export function specOf(fixture: ProofRunFixture, criteria?: Criterion[]): AcceptanceSpec {
  const subject = fixture.subject;
  if (!subject) throw new Error(`${fixture.case}: no subject`);
  const spec = venusAcceptanceSpec({ deployment: VENUS_COMPTROLLER, chainId: subject.chainId, criteria });
  return {
    ...spec,
    binding: bindingFor({
      specHash: spec.specHash,
      termsBound: true,
      signedCriteria: criteriaForTerms(spec),
      negotiationHash: `0x${'ab'.repeat(32)}`,
      boundAt: '2026-10-24T00:00:00.000Z',
    }),
  };
}

export interface BuiltRun {
  spec: AcceptanceSpec;
  brief: string;
  manifestText: string;
  deliverableHash: string;
  sealed: SealedArtifact;
}

/**
 * The whole route for one case: criteria agreed, job briefed, file delivered,
 * verdict reached, receipt sealed.
 *
 * Composed by `proofRun`, which is the product's own composition point, so a
 * receipt the suite builds is the receipt the artifact route would serve —
 * including the two rows `checksFromVerification` now infers, which it can
 * only do when it is handed the report's chain claim and the spec's binding.
 * Assembling the artifact here instead would mean passing those by hand and
 * getting them wrong the moment the rule changed: it did change, and the
 * first version of this harness went on producing receipts whose
 * `binding.chain` row no replay could reproduce.
 *
 * `runFixture` from `lib/proofrun/fixture-run` is the obvious thing to reach
 * for and does not fit, for one reason: it forces `blockHash` to null,
 * because its fixtures are synthetic *positions* that never existed on chain
 * and a hash would assert they did. These fixtures are synthetic *reports*
 * over real, named state, and the hash is the thing under test — a receipt
 * without one cannot be replayed at all, which is exactly what the verifier
 * says when it meets one. So this uses `proofRun`, one level down, where the
 * hash is a parameter.
 */
export function buildRun(fixture: ProofRunFixture, options: { criteria?: Criterion[] } = {}): BuiltRun {
  const subject = fixture.subject;
  if (!subject) throw new Error(`${fixture.case}: no subject`);
  const spec = specOf(fixture, options.criteria);
  const brief = briefOf(fixture);
  const manifestText = manifestOf(fixture);
  const deliverableHash = keccak256(stringToBytes(manifestText));

  const verification = verifyVenusReport({
    subject: subjectOf(fixture),
    manifestText,
    manifestMatchesChain: true,
    claim: readVenusReportClaim(manifestText),
    evidence: evidenceOf(fixture),
  });
  const { sealed } = proofRun({
    job: { chainId: 97, jobId: '0' },
    account: subject.account,
    deployment: VENUS_COMPTROLLER,
    chainId: subject.chainId,
    verification,
    manifestText,
    brief,
    blockHash: subject.blockHash,
    /* Never a parameter a fixture can change: nothing here may be counted
       as work an agent did for a buyer. */
    provenance: 'fixture',
    spec,
    checkedAt: '2026-10-24T00:00:00.000Z',
  });
  return { spec, brief, manifestText, deliverableHash, sealed };
}

/* ---------- a BNB Chain endpoint that answers a replay ---------- */

const SELECTORS = {
  oracle: toFunctionSelector('function oracle() view returns (address)'),
  getAssetsIn: toFunctionSelector('function getAssetsIn(address) view returns (address[])'),
  getAccountLiquidity: toFunctionSelector('function getAccountLiquidity(address) view returns (uint256, uint256, uint256)'),
  markets: toFunctionSelector('function markets(address) view returns (bool, uint256, bool)'),
  getAccountSnapshot: toFunctionSelector('function getAccountSnapshot(address) view returns (uint256, uint256, uint256, uint256)'),
  symbol: toFunctionSelector('function symbol() view returns (string)'),
  getUnderlyingPrice: toFunctionSelector('function getUnderlyingPrice(address) view returns (uint256)'),
} as const;

const ORACLE_ADDRESS = '0x0000000000000000000000000000000000000ab1' as Address;
const WAD = 10n ** 18n;

/** A USD figure as Venus's 18-decimal integer, through cents so no float error survives. */
function wad(usd: number): bigint {
  return (BigInt(Math.round(usd * 100)) * WAD) / 100n;
}

/** One synthetic vToken address per market symbol, stable across runs. */
function vTokenFor(symbol: string): Address {
  return `0x${keccak256(stringToBytes(`fixture-vtoken-${symbol}`)).slice(26)}` as Address;
}

export interface StubPosition {
  healthFactor: number | null;
  collateral: Record<string, FixtureLeg>;
  debt: Record<string, number>;
}

export interface StubNodeOptions {
  /** The head this node reports. */
  head: bigint;
  /** Headers it will serve, by decimal block number. */
  headers: Record<string, { hash: string; timestamp: string }>;
  /** The position it serves for any block it answers calls at. */
  position: StubPosition | null;
  /** When set, every `eth_call` is refused with this JSON-RPC error. */
  callError?: { code: number; message: string } | null;
  /** When true, `eth_getBlockByNumber` returns null, as a node with no header for it would. */
  withholdHeader?: boolean;
}

export interface StubNode {
  url: string;
  /** Every block an `eth_call` was made at, in order. This is how "never the head" is proved. */
  callBlocks: string[];
  /** Every block a header was asked for. */
  headerBlocks: string[];
  methods: string[];
  close: () => Promise<void>;
}

function addressArg(data: string): Address {
  return `0x${data.slice(34, 74)}` as Address;
}

function word(value: bigint): string {
  return value.toString(16).padStart(64, '0');
}

function callResult(to: string, data: string, position: StubPosition | null): string {
  const selector = data.slice(0, 10).toLowerCase();
  const target = to.toLowerCase();
  if (!position) throw new Error('the stub has no position to serve');

  const symbols = [...new Set([...Object.keys(position.collateral), ...Object.keys(position.debt)])];
  const bySymbol = new Map(symbols.map((symbol) => [vTokenFor(symbol).toLowerCase(), symbol]));

  if (target === VENUS_COMPTROLLER.toLowerCase()) {
    if (selector === SELECTORS.oracle) return encodeAbiParameters([{ type: 'address' }], [ORACLE_ADDRESS]);
    if (selector === SELECTORS.getAssetsIn) {
      return encodeAbiParameters([{ type: 'address[]' }], [symbols.map(vTokenFor)]);
    }
    if (selector === SELECTORS.getAccountLiquidity) {
      const borrow = symbols.reduce((sum, symbol) => sum + wad(position.debt[symbol] ?? 0), 0n);
      if (borrow === 0n) {
        // No debt: Venus reports spare capacity and no shortfall, and the ratio is undefined.
        const capacity = symbols.reduce((sum, symbol) => sum + wad((position.collateral[symbol]?.supplyUsd ?? 0) * (position.collateral[symbol]?.liquidationThreshold ?? 0)), 0n);
        return encodeAbiParameters([{ type: 'uint256' }, { type: 'uint256' }, { type: 'uint256' }], [0n, capacity, 0n]);
      }
      const hf = position.healthFactor ?? 0;
      const weighted = (borrow * BigInt(Math.round(hf * 1_000_000))) / 1_000_000n;
      const liquidity = weighted > borrow ? weighted - borrow : 0n;
      const shortfall = weighted < borrow ? borrow - weighted : 0n;
      return encodeAbiParameters([{ type: 'uint256' }, { type: 'uint256' }, { type: 'uint256' }], [0n, liquidity, shortfall]);
    }
    if (selector === SELECTORS.markets) {
      const symbol = bySymbol.get(addressArg(data).toLowerCase());
      const leg = symbol ? position.collateral[symbol] : undefined;
      /* isListed, collateralFactor, isVenus, liquidationThreshold — read as raw words by the reader. */
      return `0x${word(1n)}${word(wad(leg?.collateralFactor ?? 0))}${word(1n)}${word(wad(leg?.liquidationThreshold ?? 0))}`;
    }
  }
  if (target === ORACLE_ADDRESS.toLowerCase() && selector === SELECTORS.getUnderlyingPrice) {
    /* Every price is 1e18, so a market's amount in its own units is already its USD value. */
    return encodeAbiParameters([{ type: 'uint256' }], [WAD]);
  }
  const symbol = bySymbol.get(target);
  if (symbol) {
    if (selector === SELECTORS.symbol) return encodeAbiParameters([{ type: 'string' }], [`v${symbol}`]);
    if (selector === SELECTORS.getAccountSnapshot) {
      /* error, vTokenBalance, borrowBalance, exchangeRate. The rate is 1e18 so a balance is its USD value. */
      return encodeAbiParameters(
        [{ type: 'uint256' }, { type: 'uint256' }, { type: 'uint256' }, { type: 'uint256' }],
        [0n, wad(position.collateral[symbol]?.supplyUsd ?? 0), wad(position.debt[symbol] ?? 0), WAD],
      );
    }
  }
  throw new Error(`the stub was asked for ${selector} on ${to}, which it does not serve`);
}

/** Start a node that answers exactly what `readVenusPosition` and `readVenusFactsAt` ask for. */
export async function startStubNode(options: StubNodeOptions): Promise<StubNode> {
  const node: Omit<StubNode, 'url' | 'close'> = { callBlocks: [], headerBlocks: [], methods: [] };
  const handle = (request: { method?: string; params?: unknown[]; id?: unknown }): { result: unknown } | { error: { code: number; message: string } } => {
    const method = String(request.method);
    node.methods.push(method);
    if (method === 'eth_chainId') return { result: '0x38' };
    if (method === 'eth_blockNumber') return { result: `0x${options.head.toString(16)}` };
    if (method === 'eth_getBlockByNumber') {
      const at = BigInt(String(request.params?.[0]));
      node.headerBlocks.push(at.toString());
      const header = options.headers[at.toString()];
      if (!header || options.withholdHeader) return { result: null };
      return {
        result: {
          number: `0x${at.toString(16)}`,
          hash: header.hash,
          parentHash: `0x${'00'.repeat(32)}`,
          nonce: '0x0000000000000000',
          sha3Uncles: `0x${'00'.repeat(32)}`,
          logsBloom: `0x${'00'.repeat(256)}`,
          transactionsRoot: `0x${'00'.repeat(32)}`,
          stateRoot: `0x${'00'.repeat(32)}`,
          receiptsRoot: `0x${'00'.repeat(32)}`,
          miner: '0x0000000000000000000000000000000000000000',
          difficulty: '0x0',
          totalDifficulty: '0x0',
          extraData: '0x',
          size: '0x0',
          gasLimit: '0x0',
          gasUsed: '0x0',
          timestamp: `0x${(BigInt(Math.floor(Date.parse(header.timestamp) / 1000))).toString(16)}`,
          transactions: [],
          uncles: [],
        },
      };
    }
    if (method === 'eth_call') {
      const call = request.params?.[0] as { to?: string; data?: string };
      const at = String(request.params?.[1] ?? 'latest');
      node.callBlocks.push(at.startsWith('0x') ? BigInt(at).toString() : at);
      if (options.callError) return { error: options.callError };
      try {
        return { result: callResult(String(call?.to), String(call?.data), options.position) };
      } catch (error) {
        return { error: { code: -32000, message: (error as Error).message } };
      }
    }
    return { error: { code: -32601, message: `the stub does not implement ${method}` } };
  };

  const server: Server = createServer((request, response) => {
    let body = '';
    request.on('data', (chunk) => {
      body += chunk;
    });
    request.on('end', () => {
      let payload: unknown;
      try {
        payload = JSON.parse(body);
      } catch {
        response.writeHead(400).end();
        return;
      }
      const answer = (one: { method?: string; params?: unknown[]; id?: unknown }) => ({ jsonrpc: '2.0', id: one.id ?? null, ...handle(one) });
      const out = Array.isArray(payload) ? payload.map(answer) : answer(payload as { method?: string });
      response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(out));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const port = typeof address === 'object' && address !== null ? address.port : 0;
  return {
    ...node,
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

/** A stub node standing in for the chain this fixture describes. */
export function stubOptionsFor(fixture: ProofRunFixture, overrides: Partial<StubNodeOptions> = {}): StubNodeOptions {
  const subject = fixture.subject;
  const legs = fixture.chain?.legs;
  if (!subject) throw new Error(`${fixture.case}: no subject`);
  const at = BigInt(subject.blockNumber);
  const servesHash = fixture.chain?.servesBlockHash ?? subject.blockHash;
  return {
    head: at + 100n,
    headers: servesHash ? { [at.toString()]: { hash: servesHash, timestamp: fixture.chain?.facts?.blockTime ?? '2026-10-24T00:00:00.000Z' } } : {},
    position: legs ? { healthFactor: fixture.chain?.facts?.healthFactor ?? null, collateral: legs.collateral, debt: legs.debt } : null,
    callError: fixture.chain?.read === 'refused' ? stubErrorOf(fixture) : null,
    ...overrides,
  };
}

export { VENUS_CHAIN_ID, vTokenFor };
