import assert from 'node:assert/strict';
import test from 'node:test';
import { privateKeyToAccount } from 'viem/accounts';

import { signHouseQuote } from '../src/lib/house/quote';
import { negotiationTermsBound } from '../src/lib/erc8183/negotiation';
import { bindingFor, criteriaForTerms, venusAcceptanceSpec } from '../src/lib/proofrun/acceptance';

/*
 * The last mile of ProofRun's distinctive claim, proved without a wallet.
 *
 * ProofRun reports `signed-terms` when an agent's own signature covers the
 * acceptance criteria, and `pokter-asserted` when Pokter merely recorded
 * them. Every artifact produced so far says `pokter-asserted` — not because
 * agents declined, but because `success_criteria` was undocumented and no
 * agent knew the field existed. Pokter's own house agents did not echo it
 * either, so the path had never run end to end anywhere.
 *
 * This signs a real quote with a throwaway key and puts it through the
 * verifier a buyer's hire goes through, so it establishes that the
 * mechanism works.
 *
 * It does **not** establish that the house agent participates in it, and
 * the first version of this comment claimed it did. `signHouseQuote` is
 * tested here directly; the handler that receives a buyer's request had
 * to pass the criteria along, and did not, so the field was dead in
 * production until `tests/house-criteria-wiring.test.mts` pinned that
 * link. Nor does it establish that a funded job on testnet produces such
 * a receipt — that needs escrow, and it is prepared separately.
 */

/* A key that exists only here. It signs test data and holds nothing. */
const TEST_KEY = `0x${'11'.repeat(32)}` as const;
const COMMERCE = '0xa206c0517B6371C6638CD9e4a42Cc9f02A33B0DE' as const;
const PAYMENT_TOKEN = '0xc70B8741B8B07A6d61E54fd4B20f22Fa648E5565' as const;
const COMPTROLLER = '0xfD36E2c2a6789Db23113685031d7F16329158384' as const;

const definition = {
  priceU: 0.1,
  deliverables: 'A health factor report with its block.',
  qualityStandards: 'Read-only analysis. Execute no transaction and move no funds.',
} as never;

async function quoteWith(criteria: readonly string[] | undefined) {
  return signHouseQuote({
    definition,
    account: privateKeyToAccount(TEST_KEY),
    chainId: 97,
    paymentToken: PAYMENT_TOKEN,
    verifyingContract: COMMERCE,
    task: 'Report the health factor of 0xd213846db9fd0b8b282e00ef67dd899da58250cc on Venus Core Pool.',
    successCriteria: criteria,
    now: 1_780_000_000_000,
  });
}

test('a house quote carrying the criteria binds them to the signature', async () => {
  const spec = venusAcceptanceSpec({ deployment: COMPTROLLER, chainId: 56 });
  const sent = criteriaForTerms(spec);
  const quote = await quoteWith(sent);

  /* The signature has to cover the terms, not merely be a signature. */
  assert.equal(
    negotiationTermsBound(quote as unknown as Record<string, unknown>, quote.request.task_description),
    true,
    'the negotiation hash does not cover the terms the agent returned',
  );

  const binding = bindingFor({
    specHash: spec.specHash,
    termsBound: true,
    signedCriteria: quote.response.terms.success_criteria,
    sentCriteria: sent,
    negotiationHash: quote.negotiation_hash,
  });
  assert.equal(binding.kind, 'signed-terms', 'the agent signed the criteria and ProofRun did not recognise it');
  assert.equal(binding.negotiationHash, quote.negotiation_hash);
});

/*
 * Sending none stays ordinary. If echoing became a requirement, every
 * agent that does not send criteria would start failing to be hired, which
 * is a far worse outcome than a binding nobody has yet.
 */
test('a quote without criteria is still valid, and simply is not bound', async () => {
  const spec = venusAcceptanceSpec({ deployment: COMPTROLLER, chainId: 56 });
  const quote = await quoteWith(undefined);

  assert.equal(
    negotiationTermsBound(quote as unknown as Record<string, unknown>, quote.request.task_description),
    true,
    'omitting criteria broke an otherwise valid quote',
  );
  assert.equal(quote.response.terms.success_criteria, undefined, 'an empty list was sent as an empty list');
  assert.equal(
    bindingFor({ specHash: spec.specHash, termsBound: true, signedCriteria: undefined }).kind,
    'pokter-asserted',
  );
});

/*
 * The bracket case, which works today only by luck.
 *
 * `negotiationContent` sanitises each criterion before hashing, so an
 * agent that echoes the raw string signs a different digest than the one
 * the buyer's verifier recomputes — and the quote is refused as
 * terms-mismatch for a signature that was correct. ProofRun's own spec
 * line carries no bracket, so nothing has hit this yet; a buyer-written
 * criterion easily could.
 */
test('a criterion carrying a bracket still binds', async () => {
  const spec = venusAcceptanceSpec({ deployment: COMPTROLLER, chainId: 56 });
  const sent = [...criteriaForTerms(spec), 'health_factor within [0.005] of Venus'];
  const quote = await quoteWith(sent);

  assert.equal(
    negotiationTermsBound(quote as unknown as Record<string, unknown>, quote.request.task_description),
    true,
    'a bracketed criterion broke the terms binding',
  );
  assert.equal(
    bindingFor({
      specHash: spec.specHash,
      termsBound: true,
      signedCriteria: quote.response.terms.success_criteria,
      sentCriteria: sent,
    }).kind,
    'signed-terms',
  );
});
