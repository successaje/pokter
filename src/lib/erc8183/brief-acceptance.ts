import 'server-only';

import type { ScanAgentDetail } from '@/lib/scan/types';
import type { QuoteFailure } from '@/lib/hire/failure';
import { POKTER_TERMS, requestQuote } from './quote';

/**
 * Whether the agent itself will take this brief, asked before funding.
 *
 * Pokter cannot check a brief against a contract nobody publishes. A survey
 * of every agent in the catalogue that has answered a probe or carries a
 * signed price found **no** machine-checkable input example: 22 of 26
 * publish nothing at all and the hire page falls back to Pokter's own
 * generic wording, three publish prose questions, and `agent_evidence` is
 * the only structured one anywhere — which is why it has an adapter rather
 * than a rule derived from it.
 *
 * So the general check is not a schema. It is the question the only party
 * who knows the answer can settle: the agent is sent the exact brief over
 * its own `negotiate` skill, and a decline is the agent saying it cannot do
 * this work. "lp_tier_plan needs the token address" is a brief a buyer can
 * fix in seconds; discovering the same thing after the escrow is funded
 * costs them the deadline, which is what job 1585 cost.
 *
 * Two things this deliberately is not.
 *
 * It is **not a price**. Where Pokter's seller is the on-chain provider the
 * agent is not paid from this escrow, so the number it signs governs
 * nothing here and is discarded. Only the refusal is read.
 *
 * It **fails open**. No `negotiate` skill, no endpoint, a timeout, a
 * malformed reply: all pass. Most of the catalogue publishes no price skill
 * at all, and refusing those would stop far more hires than it saves. Only
 * an agent that answered and said no is treated as a no.
 *
 * Passing is not accepting. The hire page reads `answered` and says an
 * unasked brief is unverified, and funds one only when the buyer ticks that
 * they want to for that request — see `lib/hire/brief-check`.
 */
export type BriefAcceptance =
  /**
   * `answered` is the agent having signed for this brief. `failure` is why
   * it could not be asked, when it could not be.
   *
   * Two separate facts, because one boolean covering both says a brief was
   * checked when nobody checked it — most of the catalogue publishes no
   * price skill at all, and those come back `answered: false` with a
   * failure code rather than as an acceptance.
   */
  | { ok: true; answered: boolean; failure: string | null }
  /** The seller's own words, when it gave any. A decline is a decline either way. */
  | { ok: false; reason: string | null };

export async function askIfAgentTakesBrief(
  agent: ScanAgentDetail,
  task: string,
  { timeoutMs = 12_000, signal }: { timeoutMs?: number; signal?: AbortSignal } = {},
): Promise<BriefAcceptance> {
  let refusal: string | null = null;
  let failure: QuoteFailure | null = null;

  const quote = await requestQuote(agent, {
    timeoutMs,
    signal,
    /* The text about to be committed on chain, not a generic enquiry: an
       agent that would decline this brief must be asked about this brief. */
    enquiry: { task_description: task, terms: POKTER_TERMS },
    onRefused: (reason) => {
      refusal = reason;
    },
    onFailure: (reported) => {
      failure = reported;
    },
  }).catch(() => null);

  if (refusal) return { ok: false, reason: refusal };

  /*
   * A decline that arrived as a failure rather than through `onRefused`
   * still means the agent said no. Every other failure code is Pokter being
   * unable to ask.
   *
   * Whether words came with it changes what the buyer is told, not whether
   * the hire proceeds. Requiring a reason let a mainnet agent decline and be
   * funded anyway — 56/269228 answered `seller-declined` with nothing
   * readable attached, and the brief went through the check it had just
   * failed. A silent no is still a no.
   */
  const reported = failure as QuoteFailure | null;
  if (reported?.code === 'seller-declined') {
    return { ok: false, reason: reported.sellerReason ?? null };
  }

  return { ok: true, answered: quote !== null, failure: quote === null ? (reported?.code ?? 'no-answer') : null };
}
