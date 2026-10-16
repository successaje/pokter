import { keccak256, toBytes } from 'viem';

import { canonicalJson } from '@/lib/erc8183/negotiation';
import { encodePokterJobEnvelope } from '@/lib/erc8183/job-envelope';
import { DELIVERY_WINDOW_SECONDS } from '@/lib/erc8183/deadline';
import { SUBMIT_MARGIN_SECONDS } from '@/lib/house/window';

/**
 * The parts of the integration kit a builder works through rather than
 * looks up: the order to do things in, one complete negotiation, how to
 * read a funded job, and when a delivery still counts.
 *
 * The reference sections said what each field is. Builders still failed on
 * the spaces between them: of 56 agents that answered Pokter's checks on
 * 16 October but could not be hired, 22 declared no negotiate skill, 8
 * returned a price nobody had signed and 3 signed with the wrong wallet.
 * Each of those is a step below with the check that catches it.
 *
 * The worked example is computed, not typed: its hash comes from the same
 * canonical JSON the verifier uses, and a test signs it with a throwaway
 * key and runs it through Pokter's verifier, so the page cannot show an
 * example Pokter would refuse.
 */

export interface ChecklistStep {
  step: string;
  why: string;
  /** The self-check line that confirms it. */
  check: string;
  /** The refusal a buyer's hire would meet without it. */
  refusal?: string;
  anchor: string;
}

export const CHECKLIST: ChecklistStep[] = [
  { step: 'Register an ERC-8004 identity whose agent_wallet is the key you will sign quotes with.', why: 'The signature is checked against this wallet, and payment goes to it.', check: 'ERC-8004 identity', anchor: 'identity' },
  { step: 'Publish an A2A endpoint over public https, with an agent card that declares a JSON-RPC interface.', why: 'Prices and hires go over A2A. MCP alone can be measured but not priced.', check: 'Published endpoint', refusal: 'no-endpoint', anchor: 'transports' },
  { step: 'Leave the card, negotiate and notify_funded open to anonymous calls.', why: 'Buyers and Pokter hold no credentials for your endpoint.', check: 'Answers when called', refusal: 'auth-required', anchor: 'identity' },
  { step: 'Declare a negotiate skill named for the work, with complete example briefs.', why: 'The name is what buyers see; examples are where their briefs start.', check: 'Priced skill named for the work; Example briefs', refusal: 'no-price-skill', anchor: 'skills' },
  { step: 'Answer negotiate within 15 seconds with a signed quote in $U, or decline saying what is missing.', why: 'A price is only a price when your wallet signed the exact terms.', check: 'Signed price quote; Quote can be paid', refusal: 'no-quote, bad-signature, terms-mismatch, payment-incompatible', anchor: 'worked-example' },
  { step: 'Declare notify_funded, accept at once, and deliver in the background.', why: 'Otherwise nothing tells you a buyer paid, and the job expires unpaid.', check: 'Told when a job is funded', anchor: 'reading-a-job' },
  { step: 'Read the brief from the funded job on chain, do the work, and submit within 24 hours.', why: 'A submission must leave the review window before the deadline, or the escrow refuses it.', check: 'Run a paid job on testnet', anchor: 'delivery' },
  { step: 'Serve the delivered bytes at the URL you submitted, unchanged.', why: 'Buyers and Pokter check them against the hash on chain.', check: 'Receipt verifies on the job page', anchor: 'delivery' },
];

/** Canonical JSON as both the reference SDK and Pokter compute it. */
export const CANONICAL_RULES = [
  'Object keys sorted by code point, at every depth. Arrays keep their order.',
  'No whitespace: JSON.stringify of the sorted value.',
  'Every character from U+007F up written as a \\uXXXX escape, so the bytes are ASCII.',
  'In task, deliverables and quality_standards: [ and ] become ( and ), and control characters other than tab and newline are dropped.',
  'price is the string you return (digits); negotiated_at and quote_expires_at are numbers of seconds; verifying_contract is checksummed.',
  'Include quote_expires_at, chain_id and verifying_contract only if you return them, and then exactly as returned.',
];

/** A complete negotiation for one escrow, with its hash computed. */
export function workedExample(escrow: { chainId: number; commerce: string; paymentToken: string }) {
  const task = 'Check the BNB Chain token 0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82 before a buy: is it safe to trade, and why?';
  const terms = { deliverables: 'A JSON assessment with assumptions and data sources.', quality_standards: 'Read-only analysis only. Execute no transaction and move no funds.' };
  const request = {
    jsonrpc: '2.0',
    id: 'b1f0…',
    method: 'message/send',
    params: {
      message: {
        role: 'user',
        messageId: '7c2e…',
        parts: [{ kind: 'data', data: { skill: 'negotiate', task_description: task, terms, chain_id: escrow.chainId, escrow_chains: [escrow.chainId] } }],
      },
      configuration: { acceptedOutputModes: ['application/json'], blocking: true },
    },
  };
  const negotiatedAt = 1797062400;
  const content = {
    version: 1,
    negotiated_at: negotiatedAt,
    task,
    terms,
    price: '50000000000000000',
    currency: escrow.paymentToken,
    quote_expires_at: negotiatedAt + 900,
    chain_id: escrow.chainId,
    verifying_contract: escrow.commerce,
  };
  const canonical = canonicalJson(content);
  const negotiationHash = keccak256(toBytes(canonical));
  const reply = {
    request: { task_description: task },
    response: { accepted: true, terms: { price: content.price, currency: content.currency, ...terms } },
    negotiated_at: negotiatedAt,
    quote_expires_at: content.quote_expires_at,
    chain_id: escrow.chainId,
    verifying_contract: escrow.commerce,
    negotiation_hash: negotiationHash,
    provider_sig: '0x…65 bytes: your agent_wallet’s EIP-191 signature of negotiation_hash',
  };
  const decline = { response: { accepted: false, reason: 'The brief names no token: give the token or pool address (0x…).' } };
  return { request, content, canonical, negotiationHash, reply, decline };
}

/** The signing code, in TypeScript with viem. Kept in step with the test that runs it. */
export const SIGNING_SNIPPET = `import { getAddress, keccak256, toBytes, type LocalAccount } from 'viem';

const sortKeys = (v: unknown): unknown =>
  Array.isArray(v) ? v.map(sortKeys)
  : v && typeof v === 'object'
    ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys((v as Record<string, unknown>)[k])]))
    : v;
const canonicalJson = (v: unknown) =>
  JSON.stringify(sortKeys(v)).replace(/[\\u007f-\\uffff]/g, (c) => '\\\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
const clean = (s: string) => [...s.replaceAll('[', '(').replaceAll(']', ')')]
  .filter((c) => c >= ' ' || c === '\\t' || c === '\\n').join('');

export async function quote(account: LocalAccount, input: {
  task: string; deliverables: string; quality_standards: string;
  priceWei: bigint; currency: string; chainId: number; commerce: string;
}) {
  const negotiated_at = Math.floor(Date.now() / 1000);
  const quote_expires_at = negotiated_at + 15 * 60;
  const terms = { deliverables: clean(input.deliverables), quality_standards: clean(input.quality_standards) };
  const price = input.priceWei.toString();
  const verifying_contract = getAddress(input.commerce);
  const content = { version: 1, negotiated_at, task: clean(input.task), terms, price,
    currency: input.currency, quote_expires_at, chain_id: input.chainId, verifying_contract };
  const negotiation_hash = keccak256(toBytes(canonicalJson(content)));
  const provider_sig = await account.signMessage({ message: { raw: negotiation_hash } });
  return {
    request: { task_description: input.task },
    response: { accepted: true, terms: { price, currency: input.currency, ...terms } },
    negotiated_at, quote_expires_at, chain_id: input.chainId, verifying_contract,
    negotiation_hash, provider_sig,
  };
}`;

/** How a seller finds its brief once told a job is funded. */
export function readingAJob(escrow: { chainId: number; commerce: string }) {
  const description = encodePokterJobEnvelope({
    identityChainId: escrow.chainId,
    agentTokenId: '374115',
    agentName: 'Your agent',
    category: 'token-safety',
    provider: '0x071044a5A92F6C90cf9D08D5059921da734D19e7',
    task: 'Check the BNB Chain token 0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82 before a buy: is it safe to trade, and why?',
    quote: {
      negotiationHash: `0x${'ab'.repeat(32)}`,
      providerSignature: `0x${'cd'.repeat(65)}`,
      priceRaw: '50000000000000000',
      expiresAt: 1797063300,
      domain: { chainId: escrow.chainId, verifyingContract: escrow.commerce as `0x${string}` },
    },
  });
  return {
    steps: [
      `Pokter sends notify_funded with { skill: "notify_funded", job_id }. Answer { status: "accepted", job_id } at once.`,
      `Read the job from the commerce contract (${escrow.commerce} on ${escrow.chainId}): getJob(job_id). Check status is FUNDED and provider is your agent_wallet.`,
      'Its description is the job envelope below, as JSON. The brief is task. quote.negotiationHash is the hash you signed: match it to your own record, and refuse a job whose quote you did not sign.',
      'Run the work on task, then deliver as below. If the brief is one you cannot do, answer { status: "rejected", reason } to notify_funded and submit nothing: the buyer reclaims after the deadline.',
    ],
    envelope: JSON.stringify(JSON.parse(description), null, 2),
  };
}

export const TIMING = {
  deliveryWindowHours: DELIVERY_WINDOW_SECONDS / 3600,
  submitMarginSeconds: SUBMIT_MARGIN_SECONDS,
  rules: [
    `A job's deadline is ${DELIVERY_WINDOW_SECONDS / 3600} hours for delivery plus the policy's review window (15 minutes on testnet, 7 days on mainnet).`,
    `submit reverts once less than the review window remains before the deadline. Deliver within ${DELIVERY_WINDOW_SECONDS / 3600} hours of funding, and Pokter's own agents stop ${SUBMIT_MARGIN_SECONDS / 60} minutes short of that to be safe.`,
    'submit is commerce.submit(jobId, deliverable, optParams): deliverable is keccak256 of the exact bytes you serve, optParams the UTF-8 bytes of { "deliverable_url": "https://…" }.',
    'Serve canonical JSON (the rules above) so anyone who re-serialises it gets the same hash; the buyer-side check hashes the raw bytes you serve.',
  ],
};
