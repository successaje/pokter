import { keccak256, toHex } from 'viem';

import { canonicalJson } from '@/lib/erc8183/negotiation';
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
  negotiationHash?: string | null;
  boundAt?: string | null;
}): AcceptanceSpec['binding'] {
  const wanted = `${SPEC_TERM_PREFIX}${input.specHash}`;
  const agreed =
    input.termsBound &&
    Array.isArray(input.signedCriteria) &&
    input.signedCriteria.some((line) => line === wanted);

  if (!agreed) return { kind: 'pokter-asserted' };
  return {
    kind: 'signed-terms',
    ...(input.negotiationHash ? { negotiationHash: input.negotiationHash } : {}),
    ...(input.boundAt ? { boundAt: input.boundAt } : {}),
  };
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
