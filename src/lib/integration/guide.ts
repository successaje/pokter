import { keccak256, toBytes } from 'viem';

import { canonicalJson, sanitizeForClaim } from '@/lib/erc8183/negotiation';
import { encodePokterJobEnvelope } from '@/lib/erc8183/job-envelope';
import { MAX_TERM_LENGTH, MAX_TERM_STRINGS } from '@/lib/proofrun/acceptance';
import { SPEC_TERM_PREFIX } from '@/lib/proofrun/versions';
import { DELIVERY_WINDOW_SECONDS, PROPOSAL_DELIVER_DAYS } from '@/lib/erc8183/deadline';
import { SUBMIT_MARGIN_SECONDS } from '@/lib/house/window';

/**
 * The kit's schema version, which a builder quotes when they say what they
 * built against.
 *
 * Lives here rather than in `kit.ts` because `kit.ts` reaches `probe-target`
 * and is therefore server-only, while the generated build prompt runs in the
 * browser and has to be able to stamp the version it was generated from. One
 * constant, two readers.
 */
export const KIT_VERSION = '2026-10-25';

/**
 * The field on the escrow's own job record that carries the deadline.
 *
 * Named as a constant because three documents have to agree on it and a
 * builder has to be able to find it: it is `expiredAt`, component 6 of the
 * tuple `getJob(jobId)` returns, spelled the same way in the reference SDK's
 * `COMMERCE_ABI` and in Pokter's own `job-onchain.ts`.
 */
export const JOB_DEADLINE_FIELD = 'expiredAt';

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
  { step: 'Answer negotiate within 12 seconds with a quote signed in a token the escrow funds (escrows[].tokens, priced at that token’s own decimals), or decline saying what is missing.', why: 'A price is only a price when your wallet signed the exact terms.', check: 'Signed price quote; Quote can be paid', refusal: 'no-quote, bad-signature, terms-mismatch, payment-incompatible', anchor: 'worked-example' },
  { step: 'Declare notify_funded, accept at once, and deliver in the background.', why: 'Otherwise nothing tells you a buyer paid, and the job expires unpaid.', check: 'Told when a job is funded', anchor: 'reading-a-job' },
  { step: `Read the brief and the deadline from the funded job on chain, and submit before that deadline — never on an assumed window.`, why: `The job you already fetched carries its own ${JOB_DEADLINE_FIELD}; a hire funded from a request proposal runs ${PROPOSAL_DELIVER_DAYS.min}–${PROPOSAL_DELIVER_DAYS.max} days, so an agent that assumes ${DELIVERY_WINDOW_SECONDS / 3600} hours stops days early on a job it could still deliver.`, check: 'Run a paid job on testnet', anchor: 'delivery' },
  { step: 'Serve the delivered bytes at the URL you submitted, unchanged.', why: 'Buyers and Pokter check them against the hash on chain.', check: 'Receipt verifies on the job page', anchor: 'delivery' },
];

/**
 * Canonical JSON as both the reference SDK and Pokter compute it.
 *
 * The sanitising rule used to name only "task, deliverables and
 * quality_standards". `negotiationContent` also maps every element of
 * `success_criteria` through `sanitizeForClaim`, so a builder who learned
 * that field from ProofRun and followed the old rule would hash an
 * unsanitised criterion and be refused as terms-mismatch for a quote that
 * was otherwise correct — the moment any criterion contained a bracket.
 *
 * That has never happened only by luck: ProofRun's spec line is
 * `pokter-proofrun/1 spec=0x…`, which carries no bracket and no control
 * character. A version prefix that ever grew one would break it.
 */
export const CANONICAL_RULES = [
  'Object keys sorted by code point, at every depth. Arrays keep their order.',
  'No whitespace: JSON.stringify of the sorted value.',
  'Every character from U+007F up written as a \\uXXXX escape, so the bytes are ASCII.',
  'In task, deliverables, quality_standards and every element of success_criteria: [ and ] become ( and ), and control characters other than tab and newline are dropped.',
  'price is the string you return (digits); negotiated_at and quote_expires_at are numbers of seconds; verifying_contract is checksummed.',
  'Include quote_expires_at, chain_id and verifying_contract only if you return them, and then exactly as returned.',
  'Include terms.success_criteria only when you return a non-empty array, and then as an array of strings in the order you return them.',
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
        kind: 'message',
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

  /*
   * The same quote with acceptance criteria echoed back, computed the same
   * way.
   *
   * This is the one part of the contract no third party had been told
   * about. Pokter's quote route sends `terms.success_criteria`, the
   * reference hash covers it, and an agent that echoes it has
   * cryptographically agreed to the criteria it will be judged against —
   * `bindingFor` then records `signed-terms` instead of
   * `pokter-asserted`. The kit documented `terms` as
   * `{ deliverables, quality_standards }` and stopped, so every artifact
   * so far says `pokter-asserted`: not because agents declined, but
   * because nothing ever asked them.
   *
   * Computed rather than typed, like the example above, so the hash shown
   * is the hash Pokter would verify.
   */
  /*
   * The prose criterion carries a bracket on purpose.
   *
   * An example whose strings happen to need no sanitising demonstrates
   * nothing and hides the rule — which is the same coincidence that let
   * `canonicalRules` omit `success_criteria` for as long as it did. With a
   * bracket here, the published `signedTerms` visibly differ from `sent`,
   * and a change that stopped sanitising the echo fails the test that runs
   * this example through Pokter's verifier.
   */
  const criteria = [
    `${SPEC_TERM_PREFIX}0x${'7d'.repeat(32)}`,
    'collateral: Total collateral value matches Venus [within the larger of ±$1 and 1%]',
  ];
  const withCriteria = { ...content, terms: { ...terms, success_criteria: criteria.map(sanitizeForClaim) } };
  const criteriaCanonical = canonicalJson(withCriteria);
  const criteriaEcho = {
    sent: criteria,
    signedTerms: withCriteria.terms,
    canonical: criteriaCanonical,
    negotiationHash: keccak256(toBytes(criteriaCanonical)),
    rules: [
      `Pokter may include terms.success_criteria in the negotiate request: up to ${MAX_TERM_STRINGS} strings of ${MAX_TERM_LENGTH} characters. The first is a spec line, "${SPEC_TERM_PREFIX}0x…", and the rest are the prose it stands for.`,
      'To bind yourself to them, echo the array back unchanged in response.terms.success_criteria. It then enters the terms your negotiation_hash covers, and the hire records that you agreed to the criteria rather than that Pokter recorded them.',
      'Echoing is optional and omitting it is not an error: the quote verifies either way. What it costs is the binding — the delivery is then judged against criteria you never signed.',
      'Echo the strings exactly as sent. Reordering is fine, rewording is not: the spec line is matched byte for byte after sanitising, so a tidied hash line loses the binding silently.',
    ],
  };

  return { request, content, canonical, negotiationHash, reply, decline, criteriaEcho };
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
      `Take the deadline from that same response: ${JOB_DEADLINE_FIELD} (component 6 of the tuple) is a unix timestamp in seconds. Store it with the job and schedule against it. Do not compute a deadline from when you were notified — this job may be a ${PROPOSAL_DELIVER_DAYS.max}-day one, and an agent assuming ${DELIVERY_WINDOW_SECONDS / 3600} hours abandons it while it is still payable.`,
      'Its description is the job envelope below, as JSON. The brief is task. quote.negotiationHash is the hash you signed: match it to your own record, and refuse a job whose quote you did not sign.',
      `Run the work on task, then deliver as below, before ${JOB_DEADLINE_FIELD} less the policy's review window. If the brief is one you cannot do, answer { status: "rejected", reason } to notify_funded and submit nothing: the buyer reclaims after the deadline.`,
    ],
    envelope: JSON.stringify(JSON.parse(description), null, 2),
  };
}

/*
 * When a delivery still counts — read from the job, not computed.
 *
 * This section said a job's deadline was 24 hours plus the review window,
 * twice, and the checklist said "submit within 24 hours". That is only the
 * default a direct hire uses. A hire funded from a request proposal carries
 * the proposal's own delivery time, 1 to 30 days (`deliverySecondsFor`), and
 * `deadline.ts` records the bug that proves it: "hiring with the fixed 24
 * hours turned a 7-day proposal into a job that expired after one."
 *
 * An agent built from the old text computed `funded + 24h + review` and, on
 * a seven-day job, concluded it was out of time six days early — a delivery
 * and a payment lost on a job it had days left to do, failing in a way that
 * reads as the agent being broken. The kit already said the right thing
 * under `delivery` ("deliver before the job's deadline"); these rules now
 * agree with it instead of contradicting it.
 *
 * The authority is the job itself: `expiredAt` sits in the same `getJob`
 * response the agent already reads to check its status and provider.
 */
export const TIMING = {
  /** The default a direct hire uses, not the deadline of any particular job. */
  defaultDeliveryWindowHours: DELIVERY_WINDOW_SECONDS / 3600,
  /** What a proposal-funded hire may set instead. */
  proposalDeliverDays: PROPOSAL_DELIVER_DAYS,
  submitMarginSeconds: SUBMIT_MARGIN_SECONDS,
  /** The field on the job that carries the deadline. Read it; never assume it. */
  deadlineField: JOB_DEADLINE_FIELD,
  rules: [
    `Take the deadline from the job, never from a clock you started at funding: getJob(job_id).${JOB_DEADLINE_FIELD} is a unix timestamp in seconds and is the only authority on when your delivery stops counting.`,
    `${DELIVERY_WINDOW_SECONDS / 3600} hours is the default delivery window for a direct hire. A hire funded from a request proposal carries that proposal's own time instead, ${PROPOSAL_DELIVER_DAYS.min} to ${PROPOSAL_DELIVER_DAYS.max} days, so an agent that hardcodes ${DELIVERY_WINDOW_SECONDS / 3600} hours gives up days early on the longer jobs and loses the payment.`,
    `submit reverts once less than the policy's review window remains before ${JOB_DEADLINE_FIELD}. Read that window from the escrow's policy with disputeWindow() — 15 minutes on testnet, 7 days on mainnet — and derive your own margin from ${JOB_DEADLINE_FIELD} minus it. Pokter's own agents stop a further ${SUBMIT_MARGIN_SECONDS / 60} minutes short to be safe.`,
    'submit is commerce.submit(jobId, deliverable, optParams): deliverable is keccak256 of the exact bytes you serve, optParams the UTF-8 bytes of { "deliverable_url": "https://…" }.',
    'Serve canonical JSON (the rules above) so anyone who re-serialises it gets the same hash; the buyer-side check hashes the raw bytes you serve.',
  ],
};
