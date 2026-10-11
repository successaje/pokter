import assert from 'node:assert/strict';
import test from 'node:test';

import { jobChainParam, jobHref } from '../src/lib/jobs/href';

test('a job link names the escrow the job is on', () => {
  assert.equal(jobHref({ jobId: '56974', chainId: 56 }), '/workspace/jobs/56974?chain=56');
  assert.equal(jobHref({ jobId: '1424', chainId: 97 }), '/workspace/jobs/1424?chain=97');
});

test('only the chains Pokter funds on are read from a link', () => {
  assert.equal(jobChainParam('56'), 56);
  assert.equal(jobChainParam('97'), 97);
  assert.equal(jobChainParam(undefined), null);
  assert.equal(jobChainParam(''), null);
  assert.equal(jobChainParam('1'), null);
  assert.equal(jobChainParam('56abc'), null);
});
