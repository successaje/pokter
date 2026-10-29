import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { campaignHeadline, campaignSteps } from '../src/lib/campaign/check-state';

/*
 * The campaign checker answers each step with one of three things:
 * verified, not yet met, or something Pokter cannot verify. A tick means
 * verified, and nothing short of that earns one.
 */

const code = (path: string) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');
type Report = Parameters<typeof campaignSteps>[0];
const report = (over: Partial<{ distinctAgents: number; marketplacesStatus: 'met' | 'likely' | 'not-met'; build: Report['build']; adoption: Report['adoption'] }> = {}): Report => ({
  hires: { distinctAgents: over.distinctAgents ?? 0, marketplacesStatus: over.marketplacesStatus ?? 'not-met' } as Report['hires'],
  build: over.build === undefined ? [] : over.build,
  adoption: over.adoption ?? null,
});
const agent = { chainId: 56, tokenId: '1', name: 'A', inWindow: true };
const counts = (independentWallets: number, actions: number, activeDays: number) => ({ chainId: 56, tokenId: '1', name: 'A', independentWallets, actions, activeDays, actionsBlockedReason: null });
const states = (r: Report, registered = false) => campaignSteps(r, registered).map((s) => s.state);

test('registering is the participant’s word: never verified, only marked', () => {
  assert.equal(states(report(), true)[0], 'cannot-verify');
  assert.equal(states(report(), false)[0], 'not-yet');
});

test('hires are verified only when the records show three agents on two marketplaces', () => {
  assert.equal(states(report({ distinctAgents: 3, marketplacesStatus: 'met' }))[1], 'verified');
  assert.equal(states(report({ distinctAgents: 3, marketplacesStatus: 'likely' }))[1], 'cannot-verify', 'a hire whose record names no marketplace cannot confirm the second');
  assert.equal(states(report({ distinctAgents: 3, marketplacesStatus: 'not-met' }))[1], 'not-yet');
  assert.equal(states(report({ distinctAgents: 2, marketplacesStatus: 'met' }))[1], 'not-yet');
  assert.equal(campaignSteps(report({ distinctAgents: 1 }), false)[1].progress, 1 / 3);
});

test('enough actions on enough days is counted, not verified: the category is BNB Chain’s call', () => {
  assert.equal(states(report({ build: [agent], adoption: counts(3, 5, 3) }))[3], 'cannot-verify');
  assert.equal(states(report({ build: [agent], adoption: counts(3, 9, 2) }))[3], 'not-yet', 'two days is not three');
  assert.equal(states(report({ build: [], adoption: counts(3, 5, 3) }))[3], 'not-yet', 'no agent in the window, nothing to count for');
  assert.equal(states(report({ build: [agent] }))[2], 'verified');
  assert.equal(states(report({ build: null }))[2], 'cannot-verify', 'the registry did not answer');
});

test('the headline counts each answer and never says done', () => {
  assert.equal(campaignHeadline(campaignSteps(report({ distinctAgents: 3, marketplacesStatus: 'met', build: [agent] }), true)), '2 of 4 verified · 1 Pokter can’t verify · 1 not yet met');
  assert.equal(
    campaignHeadline(campaignSteps(report({ distinctAgents: 3, marketplacesStatus: 'met', build: [agent], adoption: counts(3, 5, 3) }), true)),
    'Nothing left that Pokter can see: 2 of 4 verified, 2 Pokter can’t verify',
  );
});

test('every campaign surface draws the same three answers', () => {
  const panel = code('features/campaign/SetAndEarnPanel.tsx');
  assert.match(panel, /const steps = campaignSteps\(report, registered\);/);
  assert.match(panel, /\{campaignHeadline\(steps\)\}/);
  assert.match(panel, /Counted, not verified: Pokter does not check whether these actions fit the agent&rsquo;s category or whether the hirers are independent\. BNB Chain decides\./);
  assert.doesNotMatch(panel, /Everything Pokter can see is done/);
  const workspace = code('features/campaign/CampaignProgress.tsx');
  assert.match(workspace, /state: registered \? 'cannot-verify' : 'not-yet'/);
  const quest = code('app/(site)/quest/page.tsx');
  assert.match(quest, /state=\{summary\.marketplaces === 'met' \? 'verified' : summary\.marketplaces === 'likely' \? 'cannot-verify' : 'not-yet'\}/);
  assert.match(code('app/(site)/build/(section)/agents/[chainId]/[tokenId]/page.tsx'), /These are counts\. Pokter does not check whether the actions fit the agent&rsquo;s category or whether the hirers are independent; BNB Chain decides both\./);
  const mark = code('features/campaign/CheckMark.tsx');
  assert.match(mark, /state === 'verified' && 'bg-ok text-paper'/, 'the filled tick is for verified only');
});
