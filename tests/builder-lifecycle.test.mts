import assert from 'node:assert/strict';
import test from 'node:test';

import {
  builderReadinessMilestones,
  deriveBuilderLifecycle,
  nextReadinessMilestone,
  readinessSummary,
  summariseReadinessDelivery,
  type ReadinessDelivery,
  type ReadinessId,
} from '../src/lib/diagnostic/builder-lifecycle';
import type { DiagnosticCheck } from '../src/lib/diagnostic/checks';

const pass = (id: string): DiagnosticCheck => ({ id, label: id, status: 'pass', detail: 'observed' });
const fail = (id: string): DiagnosticCheck => ({ id, label: id, status: 'fail', detail: 'observed' });

const AGENT = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const BUYER = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const OWNER = '0xcccccccccccccccccccccccccccccccccccccccc';

const lifecycleFor = (checks: DiagnosticCheck[], extra: { chainId?: number; enrolled?: boolean; probeCount?: number; delivery?: ReadinessDelivery } = {}) =>
  deriveBuilderLifecycle({
    chainId: extra.chainId ?? 56,
    checks,
    enrolled: extra.enrolled ?? true,
    probeCount: extra.probeCount ?? 0,
    delivery: extra.delivery,
  });

const FULL_CHECKS = [pass('identity'), pass('card'), pass('category'), pass('endpoint'), pass('liveness'), pass('quote'), pass('quote-settles')];

const state = (checks: DiagnosticCheck[], id: ReadinessId, extra?: Parameters<typeof lifecycleFor>[1]) =>
  builderReadinessMilestones(lifecycleFor(checks, extra)).find((milestone) => milestone.id === id)!.state;

test('registration alone never implies measurement, a payable quote or a delivery', () => {
  const lifecycle = lifecycleFor([pass('identity')]);
  assert.equal(lifecycle.registered, true);
  assert.equal(lifecycle.listed, true);
  assert.equal(lifecycle.measured, false);
  assert.equal(lifecycle.fundable, false);
  assert.equal(lifecycle.proven, false);
});

test('a signed quote makes an agent fundable and does not make it proven', () => {
  const lifecycle = lifecycleFor(FULL_CHECKS);
  assert.equal(lifecycle.fundable, true);
  assert.equal(lifecycle.proven, false, 'nothing has been delivered or settled');
  const milestones = builderReadinessMilestones(lifecycle);
  assert.equal(
    milestones.some((milestone) => /hireable/i.test(milestone.label)),
    false,
    'no milestone may claim the end state at the quote stage',
  );
  assert.equal(readinessSummary(milestones).headline, 'A buyer can fund a hire, nothing delivered yet');
});

test('a quote the escrow cannot pay is not a passed quote milestone', () => {
  const checks = [pass('identity'), pass('card'), pass('endpoint'), pass('liveness'), pass('quote'), fail('quote-settles')];
  assert.equal(lifecycleFor(checks).quotePayable, false);
  assert.equal(state(checks, 'quote'), 'failed');
});

/*
 * The whole point of the second half of the ladder. "Hireable" used to be
 * earned by a signed quote, so these two were claimed and never checked.
 */
test('delivery and settlement are earned from jobs, not from a quote', () => {
  const delivery = summariseReadinessDelivery(
    [
      { status: 'COMPLETED', deliverableUrl: 'https://example.com/d', settleTxHash: '0xfeed', client: BUYER, provider: AGENT },
      { status: 'FUNDED', deliverableUrl: null, settleTxHash: null, client: BUYER, provider: AGENT },
    ],
    { agentWallet: AGENT, ownerAddresses: [OWNER] },
  );
  assert.equal(delivery.funded, 2);
  assert.equal(delivery.delivered, 1);
  assert.equal(delivery.deliveredByAgent, 1);
  assert.equal(delivery.settled, 1);
  const lifecycle = lifecycleFor(FULL_CHECKS, { delivery });
  assert.equal(lifecycle.proven, true);
  assert.equal(nextReadinessMilestone(lifecycle), null);
  assert.equal(readinessSummary(builderReadinessMilestones(lifecycle)).headline, 'Delivered and settled');
});

test('a delivery submitted by another wallet does not earn the delivery milestone', () => {
  const delivery = summariseReadinessDelivery(
    [{ status: 'COMPLETED', deliverableUrl: 'https://example.com/d', settleTxHash: '0xfeed', client: BUYER, provider: BUYER }],
    { agentWallet: AGENT },
  );
  assert.equal(delivery.deliveredByAgent, 0);
  assert.equal(delivery.deliveredByOthers, 1);
  const milestone = builderReadinessMilestones(lifecycleFor(FULL_CHECKS, { delivery })).find((m) => m.id === 'delivered')!;
  assert.equal(milestone.state, 'failed');
  assert.match(milestone.reason ?? '', /not by the agent/i);
});

test('a job with one wallet on both sides is counted as a self-hire and named as the reason', () => {
  const delivery = summariseReadinessDelivery(
    [{ status: 'FUNDED', deliverableUrl: null, settleTxHash: null, client: AGENT, provider: AGENT }],
    { agentWallet: AGENT },
  );
  assert.equal(delivery.selfHires, 1);
  const milestone = builderReadinessMilestones(lifecycleFor(FULL_CHECKS, { delivery })).find((m) => m.id === 'delivered')!;
  assert.match(milestone.reason ?? '', /same wallet on both sides/i);
  assert.match(milestone.fix ?? '', /second wallet/i);
});

test('a hire the owner funded is still counted, and separately', () => {
  const delivery = summariseReadinessDelivery(
    [{ status: 'COMPLETED', deliverableUrl: 'https://example.com/d', settleTxHash: '0xfeed', client: OWNER, provider: AGENT }],
    { agentWallet: AGENT, ownerAddresses: [OWNER] },
  );
  assert.equal(delivery.ownFunded, 1);
  assert.equal(delivery.deliveredByAgent, 1, 'a self-funded test still proves the mechanism');
  const milestone = builderReadinessMilestones(lifecycleFor(FULL_CHECKS, { delivery })).find((m) => m.id === 'delivered')!;
  assert.match(milestone.proves, /not demand/i);
});

/*
 * The failure the five-step ladder had in the other direction: it put
 * registration first and marked an unregistered agent as failing the
 * checks that come after it.
 */
test('identity-dependent milestones wait rather than fail before registration', () => {
  const checks = [pass('card'), pass('endpoint'), pass('liveness')];
  assert.equal(state(checks, 'built'), 'done');
  assert.equal(state(checks, 'endpoint'), 'done');
  assert.equal(state(checks, 'identity'), 'todo');
  for (const id of ['quote', 'delivered', 'settled'] as const) {
    assert.equal(state(checks, id), 'waiting', `${id} must not be a failure before registration`);
  }
});

test('built and public endpoint come before identity and do not require it', () => {
  const order = builderReadinessMilestones(lifecycleFor([])).map((milestone) => milestone.id);
  assert.deepEqual(order, ['built', 'endpoint', 'identity', 'quote', 'delivered', 'settled']);
});

test('every milestone that is not done carries a reason, and a failure carries a fix and a retest', () => {
  for (const checks of [[], [pass('card'), pass('endpoint'), pass('liveness')], FULL_CHECKS]) {
    for (const milestone of builderReadinessMilestones(lifecycleFor(checks))) {
      if (milestone.state === 'done') {
        assert.equal(milestone.reason, null, `${milestone.id} is done and should carry no reason`);
        continue;
      }
      assert.ok(milestone.reason, `${milestone.id} must say why it is not done`);
      if (milestone.state === 'failed' || milestone.state === 'todo') {
        assert.ok(milestone.fix, `${milestone.id} must name the next fix`);
        assert.ok(milestone.retest, `${milestone.id} must offer a retest`);
      }
    }
  }
});

test('a retest points at this agent when the agent is known', () => {
  const milestones = builderReadinessMilestones(lifecycleFor([]), { chainId: 97, tokenId: '2554' });
  const endpoint = milestones.find((milestone) => milestone.id === 'endpoint')!;
  assert.equal(endpoint.retest?.href, '/build/import?chainId=97&tokenId=2554');
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
    const lifecycle = lifecycleFor([pass('identity')], { chainId, probeCount: 2 });
    assert.equal(lifecycle.listed, true, `chain ${chainId} should be listed`);
    assert.equal(lifecycle.measured, true);
  }
});

test('an unregistered identity is not listed on either chain', () => {
  for (const chainId of [56, 97]) {
    assert.equal(lifecycleFor([], { chainId, enrolled: false }).listed, false, `chain ${chainId} without registration`);
  }
});

test('readiness names the first blocker and never claims campaign qualification', () => {
  const lifecycle = lifecycleFor([pass('identity'), pass('card'), pass('category')], { enrolled: false });
  assert.equal(nextReadinessMilestone(lifecycle)?.id, 'endpoint');
  assert.equal(builderReadinessMilestones(lifecycle).some((milestone) => /campaign|set and earn/i.test(milestone.label)), false);
  assert.equal(
    builderReadinessMilestones(lifecycle).some((milestone) => /campaign|set and earn/i.test(`${milestone.detail}${milestone.fix ?? ''}${milestone.proves}`)),
    false,
  );
});

/*
 * Found on a rendered page, not in a unit test: an agent whose endpoint
 * was failing with ENOTFOUND, and which had delivered and settled one job
 * months earlier, was headlined "Delivered and settled" directly above
 * the failures. The milestones were right and the sentence over them was
 * a claim about now made out of the past.
 */
test('the headline answers whether a buyer could hire it now, not the best thing that ever happened', () => {
  const delivery = summariseReadinessDelivery(
    [{ status: 'COMPLETED', deliverableUrl: 'https://example.com/d', settleTxHash: '0xfeed', client: BUYER, provider: AGENT }],
    { agentWallet: AGENT },
  );
  const down = lifecycleFor([pass('identity'), pass('category')], { delivery });
  const summary = readinessSummary(builderReadinessMilestones(down));
  assert.equal(summary.headline, 'Delivered before; a buyer cannot hire it now');
  assert.match(summary.unproven, /a public endpoint check/i);

  const live = lifecycleFor(FULL_CHECKS, { delivery });
  assert.equal(readinessSummary(builderReadinessMilestones(live)).headline, 'Delivered and settled');
});

test('a fundable agent that has delivered nothing says so in the headline', () => {
  const summary = readinessSummary(builderReadinessMilestones(lifecycleFor(FULL_CHECKS)));
  assert.equal(summary.headline, 'A buyer can fund a hire, nothing delivered yet');
});

/*
 * Also found on the page. The unproven line was built by lower-casing
 * each label, which rendered "signed quote pokter can pay" — the product
 * name in lower case, in the sentence whose whole job is to be believed.
 */
test('the unproven line keeps Pokter capitalised', () => {
  const summary = readinessSummary(builderReadinessMilestones(lifecycleFor([])));
  assert.doesNotMatch(summary.unproven, /pokter/);
  assert.match(summary.unproven, /Pokter/);
});

test('an incomplete agent is still described, with what is unproven named', () => {
  const summary = readinessSummary(builderReadinessMilestones(lifecycleFor([pass('card'), pass('endpoint'), pass('liveness')])));
  assert.equal(summary.done, 2);
  assert.equal(summary.total, 6);
  assert.equal(summary.headline, 'Answering, not registered');
  assert.match(summary.unproven, /a confirmed settlement/i);
});
