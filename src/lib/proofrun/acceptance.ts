import { keccak256, toHex } from 'viem';

import { canonicalJson, sanitizeForClaim } from '@/lib/erc8183/negotiation';
import type { AcceptanceSpec, Criterion } from '@/lib/shared/contracts';
import { CRITERIA_VERSION, SPEC_TERM_PREFIX, VERIFIER_VERSION } from './versions';

/**
 * The criteria a Venus health-factor report is judged against, and the one
 * place they are turned into something an agent can sign.
 *
 * Pokter already recomputes a delivered health-factor report against the
 * chain (`lib/delivery/venus-report-check.ts`). What it has never had is a
 * statement, made before the money moved, of which figures were going to
 * be checked — so a buyer learned the criteria at the same moment they
 * learned the verdict, and had no way to tell a criterion that had always
 * applied from one chosen after the answer arrived.
 *
 * Everything here is pure. The spec is data, the hash is a function of the
 * data, and nothing reads a clock, a network or a database — so the hash a
 * receipt carries can be recomputed by anyone holding the criteria.
 */

/**
 * The hash a signature binds, over the criteria alone.
 *
 * Deliberately not over the whole `AcceptanceSpec`: `binding` is decided
 * *after* the agent signs and `subject.blockNumber` is only known once a
 * report names one, so hashing the spec would mean hashing fields that do
 * not exist yet and changing the hash the moment they did. The criteria
 * are the agreement; the rest is the circumstances it was made in.
 *
 * `canonicalJson` is the serialiser the negotiation hash already uses —
 * sorted keys, escaped high characters. Reused rather than re-implemented,
 * because two canonicalisers that drift apart would make a correct receipt
 * unverifiable and the cause would be nearly impossible to see.
 */
export function specHashOf(criteria: readonly Criterion[]): string {
  return keccak256(toHex(canonicalJson(criteria)));
}

/**
 * The supported criteria set, version 1.
 *
 * Only facts Venus itself can settle at a named block. Qualitative advice
 * — whether a position is wise, whether to repay — is deliberately absent:
 * it cannot be recomputed, and a check that cannot fail on evidence is not
 * a check. `expected` is left out of every criterion here because all five
 * are recomputed from chain at check time; a literal expected value would
 * be Pokter asserting the answer in advance.
 */
export function venusHealthCriteria(): Criterion[] {
  return [
    {
      id: 'binding.account',
      label: 'The report is about the account the brief named',
      check: { field: 'account', comparator: 'equals' },
    },
    {
      id: 'binding.chain',
      label: 'The report names the chain its figures were read on',
      check: { field: 'chain_id', comparator: 'equals' },
    },
    {
      id: 'binding.block',
      label: 'The report names the block its figures were read at',
      check: { field: 'block_number', comparator: 'present' },
    },
    {
      id: 'hf.value',
      label: 'The health factor matches Venus’s own accounting at the named block',
      check: { field: 'health_factor', comparator: 'within', tolerance: 0.005 },
    },
    {
      id: 'hf.liquidatable',
      label: 'Whether the account is liquidatable matches Venus',
      check: { field: 'liquidatable', comparator: 'equals' },
    },
    {
      id: 'position.debt_usd',
      label: 'Total borrowed value matches Venus, within 1%',
      check: { field: 'debt_usd', comparator: 'within', tolerance: 0.01 },
    },
    {
      id: 'position.collateral_usd',
      label: 'Total collateral value matches Venus, within 1%',
      check: { field: 'collateral_usd', comparator: 'within', tolerance: 0.01 },
    },
  ];
}

/**
 * The strings an agent is asked to sign, hash first.
 *
 * Agent 1's quote route sends these as `terms.success_criteria`, which the
 * reference SDK's negotiation hash covers — so an agent that signs them
 * has signed the criteria, and `bindingFor` can prove it later.
 *
 * The first string carries the hash and the rest are the prose it stands
 * for. Both are sent because neither alone is enough: prose cannot be
 * compared byte for byte across two readings of the same agreement, and a
 * bare hash is something no seller can read before agreeing to it.
 *
 * Bounded at 8 strings of 200 characters, which is the quote route's own
 * limit. Exceeding it would make the route reject the quote outright, so
 * it is enforced here where the cause is obvious rather than there where
 * it would surface as a 400 with no explanation.
 */
export const MAX_TERM_STRINGS = 8;
export const MAX_TERM_LENGTH = 200;

export function criteriaForTerms(spec: AcceptanceSpec): string[] {
  const header = `${SPEC_TERM_PREFIX}${spec.specHash}`;
  if (header.length > MAX_TERM_LENGTH) {
    throw new Error('The spec term is longer than the quote route accepts.');
  }
  const room = MAX_TERM_STRINGS - 1;
  const labels = spec.criteria.slice(0, room).map((criterion) => {
    const line = `${criterion.id}: ${criterion.label}`;
    return line.length > MAX_TERM_LENGTH ? `${line.slice(0, MAX_TERM_LENGTH - 1)}…` : line;
  });
  /*
   * A truncated criteria list would be a lie by omission: the agent would
   * sign a hash covering criteria it was never shown. Rather than send a
   * partial list, say so in the last slot, so the seller can see there is
   * more behind the hash than the lines above it.
   */
  if (spec.criteria.length > room) {
    labels[room - 1] = `and ${spec.criteria.length - room + 1} more, all covered by ${spec.specHash.slice(0, 10)}…`;
  }
  return [header, ...labels];
}

/**
 * Whether the agent agreed to these criteria, or Pokter merely recorded
 * them.
 *
 * The rule is narrow on purpose, and it fails closed. `signed-terms`
 * requires the agent's own signed `success_criteria` to contain the exact
 * spec-hash string — not a criterion that looks like ours, not a hash that
 * is a prefix of ours, not the right hash under a different version
 * prefix. Everything else is `pokter-asserted`, which the UI shows as
 * recorded by Pokter and not agreed by the agent.
 *
 * `termsBound` is `negotiationTermsBound()`'s answer, passed in rather
 * than computed here so this stays pure and so the caller cannot skip it:
 * a signature over a hash proves who signed a hash, never what the hash
 * covered, and without that check a seller could sign any 32 bytes and
 * appear to have agreed to anything.
 */
export function bindingFor(input: {
  specHash: string;
  termsBound: boolean;
  signedCriteria: readonly string[] | null | undefined;
  /**
   * The strings that were sent to be signed, when the caller has them.
   *
   * Only consulted where no spec line is present. A caller that asked for
   * criteria without going through `criteriaForTerms` has no hash to
   * match, and the only thing left is whether every string it sent came
   * back inside the signed terms.
   */
  sentCriteria?: readonly string[] | null;
  negotiationHash?: string | null;
  boundAt?: string | null;
}): AcceptanceSpec['binding'] {
  const asserted: AcceptanceSpec['binding'] = { kind: 'pokter-asserted' };
  if (!input.termsBound || !Array.isArray(input.signedCriteria)) return asserted;

  /*
   * Compared after the same sanitising the hash applies.
   *
   * `negotiationContent` maps `success_criteria` through
   * `sanitizeForClaim` before hashing, so the strings the agent signed
   * are the sanitised ones. Comparing a raw line against them happens to
   * work for the spec line as it stands — it carries no bracket and no
   * control character — but that is a property of today's prefix and not
   * a guarantee, and a version prefix that ever grew one would make
   * every binding silently fall back to `pokter-asserted`. Sanitising
   * both sides removes the coincidence.
   */
  const signed = new Set(input.signedCriteria.map((line) => sanitizeForClaim(String(line))));
  const wanted = sanitizeForClaim(`${SPEC_TERM_PREFIX}${input.specHash}`);

  /*
   * The hash line is what makes the agreement checkable, so when one was
   * sent it is the only thing that counts: prose cannot be compared
   * across two readings of the same agreement, and an agent that tidied
   * whitespace in a label has still signed the spec. Without such a line
   * there is no hash to match, and every string sent must be present —
   * the weaker rule, for callers that did not go through ProofRun.
   */
  const agreed = signed.has(wanted)
    ? true
    : Array.isArray(input.sentCriteria) && input.sentCriteria.length > 0 && !input.sentCriteria.some(isSpecLine)
      ? input.sentCriteria.every((line) => signed.has(sanitizeForClaim(String(line))))
      : false;

  if (!agreed) return asserted;
  return {
    kind: 'signed-terms',
    ...(input.negotiationHash ? { negotiationHash: input.negotiationHash } : {}),
    ...(input.boundAt ? { boundAt: input.boundAt } : {}),
  };
}

/**
 * A spec line of any version, which is what makes the strong rule apply.
 *
 * Any version, deliberately: a line from a future ProofRun is still a
 * spec line, and treating it as prose would quietly apply the weaker
 * every-string rule to criteria that were meant to be bound by a hash.
 * It will not match the current spec hash, so the binding still comes
 * back `pokter-asserted` — refused for the right reason rather than
 * accepted for the wrong one.
 */
export const SPEC_LINE = /^pokter-proofrun\/\d+ spec=0x[0-9a-fA-F]{64}$/;

export function isSpecLine(value: string): boolean {
  return SPEC_LINE.test(value);
}

/**
 * A spec for the one vertical this version supports.
 *
 * The Venus deployment is a required argument and never defaulted from the
 * chain id. BNB Chain carries more than one Venus pool and more than one
 * comptroller has existed; a spec that said "chain 56" would be checked
 * against whichever deployment the verifier happened to use, and a buyer
 * reading the receipt could not tell which one that was.
 */
export function venusAcceptanceSpec(input: {
  deployment: `0x${string}`;
  chainId: number;
  criteria?: Criterion[];
}): AcceptanceSpec {
  const criteria = input.criteria ?? venusHealthCriteria();
  return {
    criteria,
    specHash: specHashOf(criteria),
    binding: { kind: 'pokter-asserted' },
    subject: { chainId: input.chainId, protocol: 'venus-core-pool', deployment: input.deployment },
    versions: { criteria: CRITERIA_VERSION, verifier: VERIFIER_VERSION },
  };
}
