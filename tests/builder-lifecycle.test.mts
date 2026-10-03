import assert from 'node:assert/strict';
import test from 'node:test';

import { builderReadinessSteps, deriveBuilderLifecycle, nextBuilderAction } from '../src/lib/diagnostic/builder-lifecycle';
import type { DiagnosticCheck } from '../src/lib/diagnostic/checks';

const pass = (id: string): DiagnosticCheck => ({ id, label: id, status: 'pass', detail: 'observed' });

test('registration alone never implies measurement or hireability', () => {
  const lifecycle = deriveBuilderLifecycle({ chainId: 56, checks: [pass('identity')], enrolled: true, probeCount: 0 });
  assert.equal(lifecycle.registered, true);
  assert.equal(lifecycle.listed, true);
  assert.equal(lifecycle.measured, false);
  assert.equal(lifecycle.hireable, false);
});

test('hireability requires identity, endpoint, liveness and a signed quote', () => {
  const base = [pass('identity'), pass('endpoint'), pass('liveness')];
  assert.equal(deriveBuilderLifecycle({ chainId: 56, checks: base, enrolled: true, probeCount: 3 }).hireable, false);
  assert.equal(deriveBuilderLifecycle({ chainId: 56, checks: [...base, pass('quote')], enrolled: true, probeCount: 3 }).hireable, true);
});

/*
 * This asserted the opposite until the catalogue spanned both chains.
 *
 * It was right while Pokter listed mainnet only: calling a testnet
 * identity "listed" would have been a claim no page supported. The
 * campaign rules accept an agent registered on chain 56 or 97 and require
 * it to perform its own onchain actions, which on this marketplace only a
 * testnet agent can — so the catalogue now carries both and a testnet
 * identity genuinely is listed.
 *
 * Still gated on registration: being on an accepted chain is not the same
 * as existing in the registry.
 */
test('an identity on either accepted chain counts as listed once registered', () => {
  for (const chainId of [56, 97]) {
    const lifecycle = deriveBuilderLifecycle({ chainId, checks: [pass('identity')], enrolled: true, probeCount: 2 });
    assert.equal(lifecycle.listed, true, `chain ${chainId} should be listed`);
    assert.equal(lifecycle.measured, true);
  }
});

test('an unregistered identity is not listed on either chain', () => {
  for (const chainId of [56, 97]) {
    const lifecycle = deriveBuilderLifecycle({ chainId, checks: [], enrolled: false, probeCount: 0 });
    assert.equal(lifecycle.listed, false, `chain ${chainId} without registration`);
  }
});

test('readiness names the first substantiated blocker without claiming campaign qualification', () => {
  const lifecycle = deriveBuilderLifecycle({
    chainId: 97,
    checks: [pass('identity'), pass('card'), pass('category')],
    enrolled: false,
    probeCount: 0,
  });
  assert.equal(nextBuilderAction(lifecycle)?.id, 'reachable');
  assert.equal(builderReadinessSteps(lifecycle).some((step) => /campaign/i.test(step.label)), false);
});

test('a fully observable agent has no remaining product-readiness action', () => {
  const lifecycle = deriveBuilderLifecycle({
    chainId: 56,
    checks: [pass('identity'), pass('card'), pass('category'), pass('endpoint'), pass('liveness'), pass('quote')],
    enrolled: true,
    probeCount: 4,
  });
  assert.equal(nextBuilderAction(lifecycle), null);
});
