import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { buyerDeliveryChecks } from '../src/lib/jobs/answer-checks';

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');

test('a buyer sees failed delivery checks only for a record matching its chain hash', () => {
  const manifest = fixture('deliverable-1585.json');
  const checked = buyerDeliveryChecks(manifest, 'exact', 'outside', 'Private buyer brief');
  assert.equal(checked?.checks.find((row) => row.id === 'answer.dated')?.outcome, 'failed');
  assert.equal(buyerDeliveryChecks(manifest, null, 'outside', 'Private buyer brief'), null);
});

test('the public answer API does not feed an outside buyer’s private brief into check details', () => {
  const manifest = fixture('deliveries/gridloom-97-1490.json');
  const brief = JSON.parse(fixture('deliveries/briefs.json'))['gridloom-97-1490'] as string;
  const publicCheck = buyerDeliveryChecks(manifest, 'exact', 'team', brief);
  const privateCheck = buyerDeliveryChecks(manifest, 'exact', 'outside', brief);
  assert.equal(publicCheck?.checks.find((row) => row.id === 'grid.terms')?.outcome, 'passed');
  assert.equal(privateCheck?.checks.find((row) => row.id === 'grid.terms')?.outcome, 'not-verified');
  assert.equal(JSON.stringify(privateCheck).includes(brief), false);
});
