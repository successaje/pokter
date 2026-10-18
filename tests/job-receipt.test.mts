import assert from 'node:assert/strict';
import test from 'node:test';

import { jobReceipt as receipt, type ReceiptSource } from '../src/lib/jobs/receipt-link';

/* Stand-ins for the two deployments. The real addresses come from the SDK,
   which has no ESM entry point; what matters here is that the chain picks. */
const ESCROW: Record<number, string> = {
  56: '0x1111111111111111111111111111111111111111',
  97: '0x9999999999999999999999999999999999999999',
};
const escrowFor = (chainId: number) => ESCROW[chainId] ?? '0x0';
const jobReceipt = (job: ReceiptSource) => receipt(job, escrowFor);

/*
 * Every job on an agent's record claims to be checkable. These pin what the
 * link actually resolves to, because the two ways it can be wrong both look
 * fine on screen: a link to the wrong transaction, and a link to the wrong
 * chain's explorer.
 *
 * Both failures are live possibilities here. The store holds no settlement
 * hash for any job recorded so far — every one of them settled outside this
 * interface — so the fallback is not a rare branch, it is the common case.
 */

test('a settled job links its settlement, not the funding days earlier', () => {
  const r = jobReceipt({ chainId: 56, status: 'COMPLETED', hireTxHash: '0xfund', settleTxHash: '0xsettle' });
  assert.equal(r.hash, '0xsettle');
  assert.equal(r.href, 'https://bscscan.com/tx/0xsettle');
});

test('a dispute and a reclaim each link their own transaction', () => {
  assert.equal(jobReceipt({ chainId: 56, status: 'REJECTED', hireTxHash: '0xfund', disputeTxHash: '0xdisp' }).hash, '0xdisp');
  assert.equal(jobReceipt({ chainId: 56, status: 'EXPIRED', hireTxHash: '0xfund', reclaimTxHash: '0xrecl' }).hash, '0xrecl');
});

test('funding is the fallback within a row, not the first choice', () => {
  // A settled job whose settlement we never saw still has somewhere to go.
  const r = jobReceipt({ chainId: 56, status: 'COMPLETED', hireTxHash: '0xfund', settleTxHash: null });
  assert.equal(r.hash, '0xfund');
});

test('a job with no hash reads the escrow instead of claiming a receipt', () => {
  const r = jobReceipt({ chainId: 97, status: 'COMPLETED' });
  assert.equal(r.hash, null, 'null is what lets the interface stop calling this a receipt');
  assert.equal(r.href, `https://testnet.bscscan.com/address/${ESCROW[97]}#readContract`);
});

test('the explorer is the job’s own chain, never a site default', () => {
  // A testnet job pointed at mainnet BscScan is a dead link that looks live.
  assert.match(jobReceipt({ chainId: 97, status: 'FUNDED', hireTxHash: '0xa' }).href, /^https:\/\/testnet\.bscscan\.com\//);
  assert.match(jobReceipt({ chainId: 56, status: 'FUNDED', hireTxHash: '0xa' }).href, /^https:\/\/bscscan\.com\//);
  const t = jobReceipt({ chainId: 97, status: 'COMPLETED' }).href;
  const m = jobReceipt({ chainId: 56, status: 'COMPLETED' }).href;
  assert.notEqual(t, m, 'the contract fallback is per chain too, address and host both');
  assert.ok(t.includes(ESCROW[97]) && m.includes(ESCROW[56]), 'each chain reads its own escrow');
});
