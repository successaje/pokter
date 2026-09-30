import assert from 'node:assert/strict';
import test from 'node:test';
import { encodeAbiParameters, encodeEventTopics } from 'viem';

import { jobCreatedFromReceipt } from '../src/lib/wallet/external-receipt';

const event = {
  type: 'event',
  name: 'JobCreated',
  inputs: [
    { name: 'jobId', type: 'uint256', indexed: true },
    { name: 'client', type: 'address', indexed: true },
    { name: 'provider', type: 'address', indexed: true },
    { name: 'evaluator', type: 'address', indexed: false },
    { name: 'expiredAt', type: 'uint256', indexed: false },
    { name: 'hook', type: 'address', indexed: false },
  ],
} as const;

const commerce = '0xa206c0517B6371C6638CD9e4a42Cc9f02A33B0DE';
const client = '0x60eF148485C2a5119fa52CA13c52E9fd98F28e87';
const seller = '0xdA61DfA428Bb0B04AE6BfC6D3E5F65360592fD7E';
const router = '0xD7d36D66d2F1B608A0F943f722D27e3744f66F25';

function receipt(jobId = 1067n) {
  return {
    logs: [{
      address: commerce,
      topics: encodeEventTopics({ abi: [event], eventName: 'JobCreated', args: {
        jobId, client, provider: seller,
      } }),
      data: encodeAbiParameters(
        [{ type: 'address' }, { type: 'uint256' }, { type: 'address' }],
        [router, 1_788_873_002n, router],
      ),
    }],
  };
}

test('takes the EOA job id from the exact create receipt', () => {
  assert.equal(jobCreatedFromReceipt(receipt() as never, commerce, client, seller), 1067n);
});

test('rejects a receipt whose client is not the connected EOA', () => {
  assert.throws(
    () => jobCreatedFromReceipt(
      receipt() as never,
      commerce,
      '0x87FE8B31F5b5ec06BC6F0D2f4569c26550a673dC',
      seller,
    ),
    /JOB_IDENTITY_MISMATCH/,
  );
});

test('does not substitute the mutable global job counter for a missing event', () => {
  assert.throws(
    () => jobCreatedFromReceipt({ logs: [] }, commerce, client, seller),
    /JOB_CREATED_EVENT_MISSING/,
  );
});
