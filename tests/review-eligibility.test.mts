import assert from 'node:assert/strict';
import test from 'node:test';

import { reviewableJob } from '../src/lib/reviews/model';

/*
 * A job can be reviewed once it has ended with a delivery: the same rule as
 * PokterBoard's `review`, so every review Pokter accepts can be recorded there.
 */

test('a settled, rejected or refunded job the agent delivered can be reviewed', () => {
  for (const status of ['COMPLETED', 'REJECTED', 'EXPIRED']) {
    assert.equal(reviewableJob(status, 1_792_844_269n), true, status);
    assert.equal(reviewableJob(status, 1_792_844_269), true, `${status}, as a number`);
  }
});

test('a job with nothing delivered cannot be reviewed, however it ended', () => {
  // A client can fund a job naming any agent without its agreement and reclaim it after the deadline.
  for (const status of ['COMPLETED', 'REJECTED', 'EXPIRED']) {
    assert.equal(reviewableJob(status, 0n), false, status);
  }
});

test('a job still open, funded or awaiting settlement cannot be reviewed yet', () => {
  for (const status of ['OPEN', 'FUNDED', 'SUBMITTED', 'UNKNOWN']) {
    assert.equal(reviewableJob(status, 1_792_844_269n), false, status);
  }
});
