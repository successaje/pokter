import assert from 'node:assert/strict';
import test from 'node:test';

import { cardChecks } from '../src/lib/diagnostic/card-checks';

const byId = (card: Record<string, unknown>) => Object.fromEntries(cardChecks(card).map((c) => [c.id, c]));

test('a card ready to be hired passes all three', () => {
  const checks = byId({
    skills: [
      { id: 'negotiate', name: 'Quote a token safety check', examples: ['Check the BNB Chain token 0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82 before a buy'] },
      { id: 'notify_funded', name: 'Accept a funded job', examples: ['{"skill":"notify_funded","job_id":1}'] },
    ],
  });
  assert.equal(checks['notify-funded'].status, 'pass');
  assert.equal(checks['negotiate-name'].status, 'pass');
  assert.equal(checks.examples.status, 'pass');
});

test('the gaps a hire meets are named', () => {
  // The shape of most failing cards Pokter sees: generic name, placeholder example, no notify_funded.
  const checks = byId({ skills: [{ id: 'negotiate', name: 'Negotiate an ERC-8183 job', examples: ['Check the token 0x… before a buy'] }] });
  assert.equal(checks['notify-funded'].status, 'fail');
  assert.equal(checks['negotiate-name'].status, 'unknown');
  assert.equal(checks.examples.status, 'unknown');
  assert.match(checks.examples.detail, /placeholders/);
});

test('a notify_funded call is not counted as an example brief', () => {
  const checks = byId({ skills: [{ id: 'notify_funded', examples: ['{"skill":"notify_funded","job_id":57001}'] }] });
  assert.match(checks.examples.detail, /No skill publishes an example/);
});
