import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { checkDeliveredPlan } from '../src/lib/delivery/plan-checks';

const original = JSON.parse(readFileSync(new URL('./fixtures/deliverable-1585.json', import.meta.url), 'utf8')) as { response: { content: string } };

function run(change: (answer: Record<string, unknown>) => void) {
  const delivery = structuredClone(original);
  const content = JSON.parse(delivery.response.content) as { answer: Record<string, unknown> };
  change(content.answer);
  delivery.response.content = JSON.stringify(content);
  return Object.fromEntries(checkDeliveredPlan(JSON.stringify(delivery))!.checks.map((item) => [item.id, item.outcome]));
}

test('a research delivery fails missing claim evidence and a contradictory rate', () => {
  assert.equal(run((answer) => { delete (answer.price as Record<string, unknown>).source; })['research.sources'], 'failed');
  assert.equal(run((answer) => { delete (answer.calls as Record<string, unknown>).provenance; })['research.provenance'], 'failed');
  assert.equal(run((answer) => { (answer.uptime as Record<string, unknown>).value = 0.5; })['research.counts'], 'failed');
});

test('an arbitrary research answer without a structured evidence trail stays at basic checks', () => {
  const report = checkDeliveredPlan(JSON.stringify({ answer: 'This looks promising', sources: ['example.com'] }));
  assert.equal(report?.kind, null);
});

test('listed findings do not hide separate measured fields from the evidence check', () => {
  const report = checkDeliveredPlan(JSON.stringify({
    type: 'research',
    findings: [
      { claim: 'First', source: 'Source A', provenance: 'onchain' },
      { claim: 'Second', source: 'Source B', provenance: 'onchain' },
    ],
    metric: { value: 42, provenance: 'measured' },
    as_of: { time: '2026-11-02T10:00:00Z' },
  }));
  assert.equal(report?.kind, 'research');
  assert.equal(report?.checks.find((item) => item.id === 'research.sources')?.outcome, 'failed');
  assert.match(report?.checks.find((item) => item.id === 'research.sources')?.detail ?? '', /metric/);
});
