import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { withHandovers } from '../src/features/hire/handover';

/*
 * Choosing Testnet on an agent with its own testnet registration hands over
 * to that registration's page. That page offered testnet alone, so the
 * switch vanished and there was no way back to BNB Chain; and the hand-over,
 * which loads another page, gave no sign of it for seconds.
 */

const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const testnetOnly: Array<{ chainId: number; label: string; handoff?: { chainId: number; tokenId: string } }> = [{ chainId: 97, label: 'testnet registration' }];

test('a testnet registration offers BNB Chain when the agent has a mainnet registration, first', () => {
  const networks = withHandovers(testnetOnly, [{ on: 56, twin: { chainId: 56, tokenId: '374107' } }]);
  assert.deepEqual(networks.map((n) => n.chainId), [56, 97]);
  assert.deepEqual(networks[0].handoff, { chainId: 56, tokenId: '374107' }, 'a switch that hands over, never a form');
  assert.equal(networks[1].handoff, undefined);
});

test('no twin, or a network already offered, changes nothing', () => {
  assert.deepEqual(withHandovers(testnetOnly, [{ on: 56, twin: null }]).map((n) => n.chainId), [97]);
  const both = [{ chainId: 56 }, { chainId: 97, handoff: { chainId: 97, tokenId: '2618' } }];
  assert.deepEqual(withHandovers(both, [{ on: 97, twin: { chainId: 97, tokenId: '9999' } }]), both, 'an offered network keeps its own hand-over');
  assert.deepEqual(withHandovers([], [{ on: 56, twin: { chainId: 56, tokenId: '1' } }]), []);
});

test('the hire page builds its networks with the way back, and a hand-over shows that it is switching', () => {
  assert.match(source('src/features/hire/HireContents.tsx'), /const allNetworks = withHandovers\(withHandoffs, twins\);[\s\S]*networks=\{allNetworks\}/);
  const networks = source('src/features/hire/HireNetworks.tsx');
  assert.match(networks, /const \[switching, startSwitch\] = useTransition\(\);/);
  assert.match(networks, /if \(switching \|\| next === current\.chainId/, 'nothing else is chosen while switching');
  assert.match(networks, /startSwitch\(\(\) => router\.replace\(/);
  assert.match(networks, /switchingTo: switching \? target : null,/);
  const flow = source('src/features/hire/HireFlow.tsx');
  assert.match(flow, /disabled=\{network\.switchingTo != null\}/);
  assert.match(flow, /Switching…/);
  assert.match(flow, /aria-busy=\{network\.switchingTo != null\}/);
});
