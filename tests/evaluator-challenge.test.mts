import assert from 'node:assert/strict';
import test from 'node:test';

import { challengeScheduleText, evaluatorStarterCommand, selectEvaluationQueue, type EvaluationQueueFacts } from '../src/lib/evaluators/challenge';

function candidate(over: Partial<EvaluationQueueFacts> = {}): EvaluationQueueFacts {
  return {
    key: '56:1',
    chainId: 56,
    tokenId: '1',
    owner: '0x0000000000000000000000000000000000000001',
    promotable: true,
    hasProtocol: true,
    requiresAuth: false,
    quotePayable: true,
    probes: 40,
    answered: 40,
    delivered: 0,
    outsideTeamCompleted: 0,
    outsideTeamBuyers: 0,
    ...over,
  };
}

test('the challenge is mainnet, reachable and public by construction', () => {
  const selected = selectEvaluationQueue([
    candidate(),
    candidate({ key: '97:2', tokenId: '2', chainId: 97, owner: '0x0000000000000000000000000000000000000002' }),
    candidate({ key: '56:3', tokenId: '3', answered: 0, owner: '0x0000000000000000000000000000000000000003' }),
    candidate({ key: '56:4', tokenId: '4', requiresAuth: true, owner: '0x0000000000000000000000000000000000000004' }),
  ], (owner) => owner);
  assert.deepEqual(selected.map((entry) => entry.key), ['56:1']);
});

test('one observable operator gets one place', () => {
  const selected = selectEvaluationQueue([
    candidate({ key: '56:1' }),
    candidate({ key: '56:2', tokenId: '2', owner: '0x0000000000000000000000000000000000000002' }),
  ], () => 'same-operator');
  assert.equal(selected.length, 1);
});

test('market outcomes lead readiness without becoming a performance rank', () => {
  const selected = selectEvaluationQueue([
    candidate({ key: '56:1', delivered: 10 }),
    candidate({ key: '56:2', tokenId: '2', owner: '0x0000000000000000000000000000000000000002', outsideTeamCompleted: 1, outsideTeamBuyers: 1 }),
  ], (owner) => owner);
  assert.equal(selected[0].key, '56:2');
});

test('the prefilled command requests the proven evidence volume and quotes the endpoint', () => {
  const command = evaluatorStarterCommand({
    chainId: 56,
    tokenId: '372022',
    endpoint: "https://agent.example/card?note=it's-ready",
    protocol: 'a2a',
  });
  assert.match(command, /--samples 40/);
  assert.match(command, /--interval-ms 2160000/);
  assert.match(command, /--agent 372022/);
  assert.equal(command.includes("it'\\''s-ready"), true);
});

test('the schedule sentence is derived from the command it describes', () => {
  assert.equal(challengeScheduleText(40, 2_160_000), '40 samples 36 minutes apart, over about 23 hours');
});
