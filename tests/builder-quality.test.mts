import assert from 'node:assert/strict';
import test from 'node:test';

import { summarizeQuality } from '../src/lib/builder/quality';
import type { DiagnosticCheck } from '../src/lib/diagnostic/checks';

const check = (status: DiagnosticCheck['status']): DiagnosticCheck => ({
  id: status,
  label: status,
  status,
  detail: status,
});

test('quality summary keeps unknown observations separate from failures', () => {
  assert.deepEqual(summarizeQuality([check('pass'), check('unknown')]), {
    readiness: 'incomplete',
    passed: 1,
    failed: 0,
    unknown: 1,
    score: 50,
  });
});

test('a failure takes precedence over incomplete observations', () => {
  assert.equal(
    summarizeQuality([check('pass'), check('fail'), check('unknown')]).readiness,
    'attention',
  );
});

test('empty checks never produce a misleading perfect score', () => {
  assert.equal(summarizeQuality([]).score, 0);
});
