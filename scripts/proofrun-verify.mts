/**
 * Replay a ProofRun receipt without trusting Pokter, or the receipt's own
 * verdict.
 *
 *   npx tsx scripts/proofrun-verify.mts <artifact.json> [--rpc URL] [--deliverable FILE]
 *
 * A buyer holding a verdict from Pokter has to take Pokter's word for it.
 * This is the thing that lets them stop: it reads the receipt's criteria and
 * subject, reads Venus's own contracts again at the block the receipt names,
 * runs the same comparison, and says whether the two runs agree. It talks to
 * one RPC endpoint and to nothing else — no Pokter API, no database, no key,
 * no transaction. Nothing it needs comes from the server whose claim it is
 * checking.
 *
 * What it refuses to do is the substance of it:
 *
 *  - It never substitutes a block. Where the named block's state cannot be
 *    read, or where the node's block at that number is not the block the
 *    receipt names, the answer is `Not verified`. A number is the same on
 *    both sides of a reorg, so the hash is what pins the state; a replay
 *    that matched on the number alone would report agreement between
 *    readings of two different chains, and would be believed.
 *  - It never resolves a disagreement into a pass. Two readings of one block
 *    that differ mean one of the nodes is wrong, and this cannot tell which,
 *    so `compareRuns` reports it as unresolved and the exit code is non-zero.
 *  - It never re-checks a receipt it cannot trust the bytes of. Integrity of
 *    the artifact, and then of the criteria inside it, comes before any
 *    reading of anything.
 *  - It never counts the absence of evidence as agreement. A check that was
 *    not settled on either side is reported as not settled.
 *
 * The comparison itself is not re-implemented here. `verifyVenusReport` is
 * the only thing in this repository that compares a health-factor report
 * with the chain, and this calls it; `checksFromVerification` turns its
 * verdict into the named checks a receipt carries, and `compareRuns` does
 * the comparing. A second comparator would eventually disagree with the
 * first, and then a correct receipt would be unverifiable for reasons
 * nobody could see.
 *
 * Exit codes, so this can be used from a script:
 *
 *   0   agreed        every check in the receipt was re-run and agreed
 *   2   not verified  evidence missing, state unpinnable, versions apart
 *   3   contradicted  the two runs disagree, or the receipt disagrees with itself
 *   4   tampered      the artifact or its criteria do not hash to what they claim
 *   5   unreadable    the file is not a sealed ProofRun artifact
 *   64  usage         bad arguments, or the file could not be opened
 */
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

import { createPublicClient, http } from 'viem';
import { bsc } from 'viem/chains';

import { VENUS_COMPTROLLER } from '@/lib/assay/venus';
import { nodeRealUrl } from '@/lib/chain/rpc';
import { readVenusFactsAt } from '@/lib/delivery/venus-facts';
import {
  CHECKED_POOL,
  readVenusReportClaim,
  verifyVenusReport,
  type VenusEvidence,
  type VenusHealthSubject,
} from '@/lib/delivery/venus-report-check';
import { manifestMatch } from '@/lib/erc8183/manifest-match';
import { specHashOf } from '@/lib/proofrun/acceptance';
import {
  REPLAY_LIMITATIONS,
  checkArtifactIntegrity,
  checkSpecIntegrity,
  compareRuns,
  type ProofRunArtifact,
  type SealedArtifact,
} from '@/lib/proofrun/artifact';
import { checksFromVerification, headlineFor, stateFromChecks } from '@/lib/proofrun/checks';
import { ARTIFACT_VERSION, CRITERIA_VERSION, VERIFIER_VERSION } from '@/lib/proofrun/versions';
import type { CheckResult, VerificationState } from '@/lib/shared/contracts';

export const USAGE = `ProofRun independent verifier

  npx tsx scripts/proofrun-verify.mts <artifact.json> [options]

  --rpc URL           The BNB Chain endpoint to read Venus from. Historical
                      state is required, so this needs an archive node.
                      Without it, NODEREAL_API_KEY is used if it is set, and
                      otherwise nothing is read and the answer is Not verified.
  --deliverable FILE  The delivered file the receipt judged. Given one, the
                      report's own claims are re-read from it and checked
                      against the receipt's deliverable hash, instead of being
                      taken from the rows the receipt recorded.
  --help              This text.

Exit codes: 0 agreed, 2 not verified, 3 contradicted, 4 tampered,
5 unreadable, 64 usage.`;

export const EXIT = {
  agreed: 0,
  'not-verified': 2,
  contradicted: 3,
  tampered: 4,
  unreadable: 5,
  usage: 64,
} as const;

export type ReplayVerdict = 'agreed' | 'not-verified' | 'contradicted' | 'tampered' | 'unreadable';

/**
 * What the output says about itself, every time, including on a pass.
 *
 * The four standing ones are the artifact's own `REPLAY_LIMITATIONS`,
 * printed rather than restated so this cannot drift from what the receipt
 * promises. The fifth is this tool's: the chain side is re-read, but the
 * report's side is whatever the receipt recorded unless the delivered file
 * is supplied, and a reader is entitled to know which half was re-derived.
 */
export const CLAIM_SOURCE_ASSUMPTION = {
  receipt:
    'The report’s own figures were taken from the rows the receipt records, not re-read from the delivered file. That half rests on the artifact hash; the chain half was re-read. Claims the receipt does not record — the Venus pool the report named, its prose, anything outside the criteria — cannot be re-derived this way. Pass --deliverable to re-read them.',
  deliverable:
    'The report’s own figures were re-read from the delivered file supplied, which hashes to the deliverable the receipt names. Both halves of the comparison were re-derived.',
} as const;

export function assumptionsFor(claimSource: keyof typeof CLAIM_SOURCE_ASSUMPTION): string[] {
  return [...REPLAY_LIMITATIONS, CLAIM_SOURCE_ASSUMPTION[claimSource]];
}

export interface ReplayResult {
  verdict: ReplayVerdict;
  headline: string;
  /** Why, in a buyer's terms. Never a raw error object. */
  reasons: string[];
  /** The checks this run produced, when it got far enough to produce any. */
  checks: CheckResult[] | null;
  /** Where the two runs disagree, when they do. */
  disagreements: string[];
  /** The receipt's own summary, recomputed from its own rows rather than read off it. */
  receiptState: VerificationState | null;
  /** This run's summary. */
  replayState: VerificationState | null;
  /** The state this run was pinned to, when it was pinned at all. */
  pinned: { blockNumber: string; blockHash: string } | null;
  claimSource: keyof typeof CLAIM_SOURCE_ASSUMPTION;
  /** Everything the receipt says about itself, for the header. */
  receipt: {
    artifactVersion: string;
    verifierVersion: string;
    criteriaVersion: string;
    provenance: string;
    subject: string;
    storedState: string;
  } | null;
}

function refuse(
  verdict: Exclude<ReplayVerdict, 'agreed'>,
  headline: string,
  reasons: string[],
  extra: Partial<ReplayResult> = {},
): ReplayResult {
  return {
    verdict,
    headline,
    reasons,
    checks: null,
    disagreements: [],
    receiptState: null,
    replayState: null,
    pinned: null,
    claimSource: 'receipt',
    receipt: null,
    ...extra,
  };
}

const HEX32 = /^0x[0-9a-fA-F]{64}$/;

/** A block number as the artifact writes it: a decimal string, because JSON has no bigint. */
function readBlockNumber(value: unknown): bigint | null {
  if (typeof value !== 'string' || !/^\d{1,18}$/.test(value.trim())) return null;
  const parsed = BigInt(value.trim());
  return parsed > 0n ? parsed : null;
}

function rowOf(checks: readonly CheckResult[], id: string): CheckResult | null {
  return checks.find((check) => check.id === id) ?? null;
}

/** A row that actually compared something, as against one standing in for a criterion nothing settled. */
function settled(row: CheckResult | null): boolean {
  return row !== null && row.observed !== '—' && row.outcome !== 'not-verified';
}

/**
 * The report's own claims, rebuilt from the rows the receipt recorded.
 *
 * Only `observed` is read, never `expected`: `observed` is what the report
 * said, which is content of the receipt and covered by its hash, while
 * `expected` is what the previous run's node said — the stored verdict's
 * own evidence, and the thing this must not take on trust.
 *
 * The health factor is spliced in as a literal rather than passed through a
 * number, so that a report which stated "1.1" is replayed as a claim to one
 * decimal place. Rebuild it as `1.1` the number and `statedHfDecimals` still
 * recovers one place; rebuild it as `1.1000` and the precision guard stops
 * firing, and a report too coarse to check would start collecting verdicts.
 *
 * Fields the receipt did not settle are left out rather than filled in from
 * the subject. An omitted account or chain means "the report made no claim
 * this run can see", which is what an unsettled row means; inventing the
 * subject's own values would assert the report named them.
 */
export function reconstructDelivery(artifact: ProofRunArtifact): { ok: true; manifestText: string } | { ok: false; reason: string } {
  const hf = rowOf(artifact.checks, 'hf.value');
  if (!hf || hf.observed === '—') {
    return {
      ok: false,
      reason:
        'The receipt records no figure for the health factor the report gave, so the report’s own claim cannot be rebuilt from it. Supply the delivered file with --deliverable to re-read the claim from the delivery itself.',
    };
  }

  const fields: string[] = [`"as_of":{"block":"${artifact.subject.blockNumber}"}`];
  if (/^-?\d+(?:\.\d+)?$/.test(hf.observed)) {
    fields.push(`"health_factor":${hf.observed}`);
  } else if (/no debt/i.test(hf.observed)) {
    fields.push('"health_factor":null');
  } else {
    return {
      ok: false,
      reason: `The receipt records the report’s health factor as “${hf.observed}”, which is not a figure this replay can restate as a claim. Supply the delivered file with --deliverable.`,
    };
  }

  /*
   * No account goes into the rebuilt claim, and there is nothing to put
   * there.
   *
   * On a report that got the account right there is no address to recover:
   * the checker emits an Account row only when one disagrees, so the row the
   * receipt carries is an inferred pass reading "the same account". Leaving
   * the account out is also the correct rebuild — the replay then makes no
   * account claim, the checker skips the comparison, and the pass is inferred
   * again from the verdict, exactly as it was. Filling in the subject's own
   * address would instead assert that the report had named it.
   *
   * And a receipt that *did* record an address recorded nothing else:
   * `preEvidenceVerdict` refuses an account mismatch before any figure is
   * compared, so such a receipt has no health factor in it and the rebuild
   * refuses above for that reason. An earlier draft read the address out of
   * the row here, which looked careful and could never run. Replaying one of
   * those needs `--deliverable`.
   */
  /*
   * The chain as the field that reproduces the claim, which is not always
   * the same field.
   *
   * `binding.chain` passes only where the report named a chain by id, so a
   * numeric row has to be rebuilt as `chain_id`, the one field `readChain`
   * reads as an id. Rebuilt as `"chain": "56"` it comes back `unreadable` —
   * a string in that field is matched against chain *names* — and the replay
   * would refuse a receipt it should have agreed with. A non-numeric row is
   * a disagreement the report earned ("ethereum"), and goes back in the
   * field that earned it.
   */
  const chain = rowOf(artifact.checks, 'binding.chain');
  if (settled(chain)) {
    const named = chain!.observed;
    fields.push(/^\d{1,7}$/.test(named) ? `"chain_id":${Number(named)}` : `"chain":${JSON.stringify(named)}`);
  }

  const liquidatable = rowOf(artifact.checks, 'hf.liquidatable');
  if (liquidatable && (liquidatable.observed === 'yes' || liquidatable.observed === 'no')) {
    fields.push(`"liquidatable":${liquidatable.observed === 'yes'}`);
  }
  for (const [id, key] of [
    ['position.debt_usd', 'debt_usd'],
    ['position.collateral_usd', 'collateral_usd'],
  ] as const) {
    const row = rowOf(artifact.checks, id);
    // `usd()` writes "$207,792.76"; `readUsd` strips the dollar and the commas back off.
    if (row && row.observed.startsWith('$')) fields.push(`${JSON.stringify(key)}:${JSON.stringify(row.observed)}`);
  }

  const manifestText = JSON.stringify({
    version: 1,
    response: { content: `{${fields.join(',')}}`, content_type: 'application/json' },
    metadata: { producer: 'ProofRun replay, rebuilt from the receipt’s own rows' },
  });
  return { ok: true, manifestText };
}

export interface ReplayInput {
  /** The parsed contents of the artifact file, untrusted. */
  sealed: unknown;
  readFactsAt: (at: { account: string; block: bigint }) => Promise<VenusEvidence>;
  /** The delivered file, when the caller supplied one. */
  deliverableText?: string | null;
}

/**
 * The replay, in the order the order matters.
 *
 * Integrity first, because a forged receipt must not cause so much as a
 * chain read. Then the versions, because a receipt from a different build
 * is not comparable and re-checking it with whatever is current would make
 * "agreed" mean two different things agreed. Then the receipt against
 * itself, because the stored summary is not evidence for the stored rows.
 * Then the state is pinned, and only then is anything recomputed.
 */
export async function replayArtifact(input: ReplayInput): Promise<ReplayResult> {
  /* 1. Are these the bytes that were sealed? */
  const integrity = checkArtifactIntegrity(input.sealed);
  if (!integrity.ok) {
    return refuse(integrity.reason === 'tampered' ? 'tampered' : 'unreadable', integrity.reason === 'tampered' ? 'Tampered' : 'Unreadable', [
      integrity.detail,
      integrity.reason === 'tampered'
        ? 'Nothing was re-run and nothing was read from the chain. A receipt whose bytes are not the bytes that were sealed is not a receipt, and running the checks on it would publish a verdict about a document nobody produced.'
        : 'This file is not a sealed ProofRun artifact, so there is nothing in it to replay.',
    ]);
  }

  const { artifact } = input.sealed as SealedArtifact;

  /* The shape, before any of it is believed. */
  if (!artifact.subject || typeof artifact.subject !== 'object' || !Array.isArray(artifact.criteria) || !Array.isArray(artifact.checks)) {
    return refuse('unreadable', 'Unreadable', ['The artifact hashes correctly but has no criteria, checks or subject to replay.']);
  }

  /* 2. Are the criteria inside it the criteria it says it was judged against? */
  const spec = checkSpecIntegrity(artifact, specHashOf);
  if (!spec.ok) {
    return refuse('tampered', 'Tampered', [
      spec.detail,
      'The receipt itself is intact — these bytes are the bytes that were sealed — but the criteria in it are not the criteria it names. An intact receipt describing a different agreement is the subtler forgery of the two, and it is reported separately for that reason.',
    ]);
  }

  const receipt: NonNullable<ReplayResult['receipt']> = {
    artifactVersion: String(artifact.version),
    verifierVersion: String(artifact.versions?.verifier),
    criteriaVersion: String(artifact.versions?.criteria),
    provenance: String(artifact.provenance),
    subject: `${artifact.subject.account} · ${artifact.subject.protocol} · chain ${artifact.subject.chainId} · block ${artifact.subject.blockNumber}`,
    storedState: String(artifact.state),
  };
  const carry = { receipt };

  /* 3. Was it produced by something this build can replay? */
  const apart: string[] = [];
  if (receipt.artifactVersion !== ARTIFACT_VERSION) {
    apart.push(`The receipt is in artifact format ${receipt.artifactVersion}; this build reads ${ARTIFACT_VERSION}. A field may not mean in that format what it means here.`);
  }
  if (String(artifact.versions?.artifact) !== receipt.artifactVersion) {
    apart.push(`The receipt's own version block names artifact format ${String(artifact.versions?.artifact)} while its header says ${receipt.artifactVersion}. It does not agree with itself about what it is.`);
  }
  if (receipt.verifierVersion !== VERIFIER_VERSION) {
    apart.push(`The receipt was produced by checker ${receipt.verifierVersion}; this build is ${VERIFIER_VERSION}. A checker that reads or compares anything differently produces different figures from the same state, so an agreement or a disagreement here would be about the code change rather than about the report.`);
  }
  if (receipt.criteriaVersion !== CRITERIA_VERSION) {
    apart.push(`The receipt was judged against criteria set ${receipt.criteriaVersion}; this build holds ${CRITERIA_VERSION}. The criteria are what was agreed before the job, and a replay against a different set is a replay of a different agreement.`);
  }
  if (apart.length > 0) {
    return refuse('not-verified', 'Not verified', [
      ...apart,
      'This is the absence of a comparable run and not a disagreement the receipt earned, so it is reported as not verified rather than as a contradiction. Replay it with the build that produced it.',
    ], carry);
  }

  /* 4. Does the receipt agree with itself? The stored summary is not evidence for the stored rows. */
  const receiptState = stateFromChecks(artifact.checks);
  if (receiptState !== artifact.state) {
    return refuse('contradicted', 'Unresolved', [
      `The receipt's summary says “${artifact.state}”, but its own rows come to “${receiptState}”: ${headlineFor(artifact.checks).toLowerCase()}`,
      'A summary that does not follow from the rows beneath it is a contradiction inside the document, and a reader believes the summary over the detail. It is reported as unresolved and never reconciled in the receipt’s favour.',
    ], { ...carry, receiptState });
  }

  /* 5. Can the state be pinned? */
  if (artifact.subject.protocol !== 'venus-core-pool') {
    return refuse('not-verified', 'Not verified', [
      `The receipt is about ${String(artifact.subject.protocol)}. This build reads Venus's Core Pool only, so it has no figures of its own to compare these with.`,
    ], carry);
  }
  if (String(artifact.subject.deployment).toLowerCase() !== VENUS_COMPTROLLER.toLowerCase()) {
    return refuse('not-verified', 'Not verified', [
      `The receipt names Venus deployment ${String(artifact.subject.deployment)}; this build reads ${VENUS_COMPTROLLER}. BNB Chain carries more than one Venus pool and more than one Comptroller has existed, so reading a different one would answer about a different protocol.`,
    ], carry);
  }
  const block = readBlockNumber(artifact.subject.blockNumber);
  if (block === null) {
    return refuse('not-verified', 'Not verified', ['The receipt does not name a block number this replay can read, so there is no point on the chain to pin it to.'], carry);
  }
  const claimedHash = typeof artifact.subject.blockHash === 'string' ? artifact.subject.blockHash : null;
  if (!claimedHash || !HEX32.test(claimedHash)) {
    return refuse('not-verified', 'Not verified', [
      `The receipt names block ${block} but carries no block hash for it. A block number does not pin state: two chains, and one chain either side of a reorg, both have a block ${block}. Matching on the number alone would report agreement between readings of different states, so this replay refuses instead.`,
    ], carry);
  }

  /* 6. Read the chain. At that block, and at no other. */
  const evidence = await input.readFactsAt({ account: artifact.subject.account, block });
  if (!evidence.available) {
    const why =
      evidence.code === 'no-history'
        ? `State at block ${block} is not served by this node: ${evidence.detail} Free BNB Chain endpoints keep only the most recent blocks, so a receipt replayed long after it was written usually cannot be replayed at all.`
        : evidence.code === 'block-ahead-of-head'
          ? `The receipt names block ${block}, which this chain has not reached: ${evidence.detail} There is no state to read there.`
          : `Venus could not be read at block ${block}: ${evidence.detail} That is this replay's failure to see, and says nothing about the report.`;
    return refuse('not-verified', 'Not verified', [
      why,
      'No other block was read. Re-reading at the head would compare a report about one block with a position that has moved since, and the answer would describe the delay rather than the report.',
    ], carry);
  }

  const facts = evidence.facts;
  if (facts.block !== block) {
    return refuse('not-verified', 'Not verified', [
      `The reading came back for block ${facts.block}, not the block ${block} the receipt names. A reading taken anywhere else is not evidence about this receipt.`,
    ], carry);
  }
  if (!facts.blockHash) {
    return refuse('not-verified', 'Not verified', [
      `The node served no hash for block ${block}, so this replay cannot show it read the same state the receipt did rather than the same block number on another chain.`,
    ], carry);
  }
  if (facts.blockHash.toLowerCase() !== claimedHash.toLowerCase()) {
    return refuse('not-verified', 'Not verified', [
      `Block ${block} on this node is ${facts.blockHash}, and the receipt names ${claimedHash}. The number matches and the state does not: this is a different block, from a reorg or from a node on another chain.`,
      'Whatever the figures read here say, they are not about the state the receipt was written against, so they are not compared with it. Figures that agree when read from the wrong state are the worst outcome available, because everything else looks right.',
    ], carry);
  }
  const pinned = { blockNumber: block.toString(), blockHash: facts.blockHash };

  /* 7. What did the report claim? From the delivery if we were given it, else from the receipt's rows. */
  let manifestText: string;
  let manifestMatchesChain: boolean | null;
  let claimSource: keyof typeof CLAIM_SOURCE_ASSUMPTION;
  if (typeof input.deliverableText === 'string') {
    const matched = artifact.deliverableHash ? manifestMatch(input.deliverableText, artifact.deliverableHash) : null;
    if (!matched) {
      return refuse('not-verified', 'Not verified', [
        artifact.deliverableHash
          ? `The file supplied does not hash to the deliverable this receipt names (${artifact.deliverableHash}), so it is not the document the receipt judged. Checking its figures would be checking a different file.`
          : 'The receipt names no deliverable hash, so a file supplied for it cannot be shown to be the document it judged.',
      ], { ...carry, pinned });
    }
    manifestText = input.deliverableText;
    manifestMatchesChain = true;
    claimSource = 'deliverable';
  } else {
    const rebuilt = reconstructDelivery(artifact);
    if (!rebuilt.ok) return refuse('not-verified', 'Not verified', [rebuilt.reason], { ...carry, pinned });
    manifestText = rebuilt.manifestText;
    manifestMatchesChain = true;
    claimSource = 'receipt';
  }

  /* 8. Run the same comparison, and compare the two runs. */
  const subject: VenusHealthSubject = { chainId: artifact.subject.chainId, account: artifact.subject.account, pool: CHECKED_POOL };
  const claim = readVenusReportClaim(manifestText);
  const verification = verifyVenusReport({
    subject,
    manifestText,
    manifestMatchesChain,
    claim,
    evidence,
  });
  /*
   * `chainClaim` and `binding` are passed because the rows depend on them,
   * and a replay that left them out would not be replaying the same run.
   *
   * Two of the checks are inferred rather than emitted: the checker reports
   * the account and the chain only when one disagrees, so a correct report
   * leaves no row and `checksFromVerification` infers a pass from the verdict
   * plus the chain the report actually named. Omit `chainClaim` here and the
   * replay produces `not-verified` for `binding.chain` against a receipt that
   * has it `passed` — a contradiction manufactured by this file, reported
   * against the receipt. `binding` only words the limitation on an unsettled
   * row, but it travels for the same reason: the rows have to be built the
   * way the receipt's were.
   */
  const fresh = checksFromVerification({
    verification,
    criteria: artifact.criteria,
    blockHash: facts.blockHash,
    chainClaim: claim?.ok ? claim.claim.chain : undefined,
    binding: artifact.binding,
  });
  const replayState = stateFromChecks(fresh);
  const outcome = compareRuns(artifact.checks, fresh);
  const base = { ...carry, checks: fresh, receiptState, replayState, pinned, claimSource };

  if (outcome.state === 'agreed') {
    return {
      verdict: 'agreed',
      headline: 'Verified',
      reasons: [
        `Every one of the ${artifact.checks.length} checks in the receipt was re-run against Venus's own contracts at block ${block} and reached the same outcome. ${headlineFor(fresh)}`,
        replayState === 'verified'
          ? 'What the two runs agree on is that the report’s figures match Venus at that block.'
          : `What the two runs agree on is the receipt’s own summary, which is “${replayState}”. Agreement is not the same as a clean report, and this says only that an independent run reached the same rows.`,
      ],
      disagreements: [],
      ...base,
    };
  }
  if (outcome.state === 'contradicted') {
    return {
      verdict: 'contradicted',
      headline: 'Unresolved',
      reasons: [
        `This replay and the receipt disagree on ${outcome.disagreements.length} of the ${artifact.checks.length} checks, both reading block ${block}.`,
        'Two readings of one block that differ mean one of the two nodes is wrong, and nothing here can tell which. The disagreement is reported as unresolved: the receipt is not preferred because it is written down, and the fresh reading is not preferred because it is fresh.',
      ],
      disagreements: [...outcome.disagreements],
      ...base,
    };
  }
  const unsettled = fresh.filter((check) => check.outcome === 'not-verified');
  return {
    verdict: 'not-verified',
    headline: 'Not verified',
    reasons: [
      outcome.reason,
      unsettled.length > 0
        ? `${unsettled.length} of ${fresh.length} checks were not settled by this run: ${unsettled.map((check) => check.id).join(', ')}.`
        : 'A check the receipt carries produced no result in this run.',
      'Nothing that could not be re-run is counted as agreement. That is the whole of it: a silent pass on absent evidence is the failure this exists to refuse.',
    ],
    disagreements: [],
    ...base,
  };
}

/* Always at least one space, or a value as wide as its column runs into the
   next one: "report the same accountchain the account the brief named". */
const pad = (text: string, width: number) => text + ' '.repeat(Math.max(1, width - text.length));

function wrap(text: string, width: number, indent: string): string[] {
  const out: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/)) {
    if (line && line.length + 1 + word.length > width) {
      out.push(indent + line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) out.push(indent + line);
  return out;
}

/** The whole answer as lines, so a test can read it the way a person does. */
export function renderReplay(result: ReplayResult, context: { artifactPath: string; endpoint: string }): string[] {
  const lines: string[] = ['ProofRun independent verification', ''];
  lines.push(`  artifact    ${context.artifactPath}`);
  lines.push(`  endpoint    ${context.endpoint}`);
  if (result.receipt) {
    lines.push(`  receipt     ${result.receipt.artifactVersion} · ${result.receipt.verifierVersion} · ${result.receipt.criteriaVersion}`);
    lines.push(`  provenance  ${result.receipt.provenance}`);
    lines.push(`  subject     ${result.receipt.subject}`);
  }
  if (result.pinned) lines.push(`  pinned to   block ${result.pinned.blockNumber} ${result.pinned.blockHash}`);
  lines.push('');
  lines.push(result.headline);
  for (const reason of result.reasons) lines.push(...wrap(reason, 94, '  '));

  if (result.disagreements.length > 0) {
    lines.push('', 'Where the two runs disagree');
    for (const line of result.disagreements) lines.push(...wrap(line, 94, '  '));
  }

  if (result.checks) {
    lines.push('', `Checks re-run (${result.checks.length})`);
    for (const check of result.checks) {
      lines.push(`  ${pad(check.outcome, 13)}${pad(check.id, 24)}report ${pad(check.observed, 16)}chain ${check.expected}`);
      if (check.limitation) lines.push(...wrap(check.limitation, 88, '      '));
    }
  }
  if (result.receiptState || result.replayState) {
    lines.push('', `  the receipt's rows come to  ${result.receiptState ?? '—'}`, `  this replay comes to        ${result.replayState ?? '—'}`);
  }

  lines.push('', 'What this does and does not establish');
  for (const line of assumptionsFor(result.claimSource)) lines.push(...wrap(`- ${line}`, 94, '  '));
  return lines;
}

export interface Args {
  artifactPath: string;
  rpc: string | null;
  deliverablePath: string | null;
  help: boolean;
}

export function parseArgs(argv: readonly string[]): { ok: true; args: Args } | { ok: false; error: string } {
  const args: Args = { artifactPath: '', rpc: null, deliverablePath: null, help: false };
  const rest = [...argv];
  while (rest.length > 0) {
    const token = rest.shift() as string;
    if (token === '--help' || token === '-h') {
      args.help = true;
      continue;
    }
    if (token === '--rpc' || token === '--deliverable') {
      const value = rest.shift();
      if (!value || value.startsWith('--')) return { ok: false, error: `${token} needs a value.` };
      if (token === '--rpc') args.rpc = value;
      else args.deliverablePath = value;
      continue;
    }
    if (token.startsWith('--')) return { ok: false, error: `Unknown option ${token}.` };
    if (args.artifactPath) return { ok: false, error: 'Only one artifact can be verified at a time.' };
    args.artifactPath = token;
  }
  if (!args.help && !args.artifactPath) return { ok: false, error: 'An artifact file is required.' };
  return { ok: true, args };
}

/**
 * The endpoint, named without its key.
 *
 * A NodeReal URL carries the key in its path and a `--rpc` URL may too.
 * Printing the origin alone says which node answered without putting a
 * credential in the output, where it would end up in anyone's terminal
 * scrollback and in whatever the output was pasted into.
 */
export function endpointLabel(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return 'the endpoint supplied';
  }
}

export const NO_ARCHIVE = [
  'No endpoint was given and NODEREAL_API_KEY is not set, so no chain state was read and nothing was verified.',
  'Replaying a receipt means reading Venus at the block the receipt names, which is historical state. Every free BNB Chain endpoint prunes it within about a hundred blocks, so an archive node is required: pass --rpc with one, or set NODEREAL_API_KEY whose free tier serves history.',
  'This is reported as not verified rather than as a failure of the receipt. Nothing was read, so nothing about the receipt has been established either way.',
];

export async function main(argv: readonly string[]): Promise<{ code: number; lines: string[] }> {
  const parsed = parseArgs(argv);
  if (!parsed.ok) return { code: EXIT.usage, lines: [parsed.error, '', USAGE] };
  if (parsed.args.help) return { code: 0, lines: [USAGE] };
  const { artifactPath, rpc, deliverablePath } = parsed.args;

  let sealed: unknown;
  try {
    sealed = JSON.parse(readFileSync(artifactPath, 'utf8'));
  } catch (error) {
    return { code: EXIT.usage, lines: [`${artifactPath} could not be read as JSON: ${(error as Error).message}`] };
  }
  let deliverableText: string | null = null;
  if (deliverablePath) {
    try {
      deliverableText = readFileSync(deliverablePath, 'utf8');
    } catch (error) {
      return { code: EXIT.usage, lines: [`${deliverablePath} could not be read: ${(error as Error).message}`] };
    }
  }

  const url = rpc ?? nodeRealUrl(56);
  if (!url) {
    /*
     * The code comes from the verdict rather than being written out again
     * here. Two places that have to say "not verified" is one place too many:
     * the headline and the exit code would be free to drift apart, and a
     * script branching on the code would disagree with the person reading the
     * output.
     */
    const result = refuse('not-verified', 'Not verified', NO_ARCHIVE);
    return { code: EXIT[result.verdict], lines: renderReplay(result, { artifactPath, endpoint: 'none' }) };
  }

  /*
   * No multicall batching, on purpose. The replay is one account at one
   * block — a handful of calls — and batching them through Multicall3 makes
   * every one of them depend on that contract existing at that block on
   * whatever node answered, which is one more thing a reader would have to
   * take on trust for no gain.
   */
  const client = createPublicClient({ chain: bsc, transport: http(url, { timeout: 30_000, retryCount: 1 }) });
  const result = await replayArtifact({
    sealed,
    deliverableText,
    readFactsAt: (at) => readVenusFactsAt(client, at),
  });
  return { code: EXIT[result.verdict], lines: renderReplay(result, { artifactPath, endpoint: endpointLabel(url) }) };
}

const invokedDirectly = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  const { code, lines } = await main(process.argv.slice(2));
  process.stdout.write(`${lines.join('\n')}\n`);
  process.exitCode = code;
}
