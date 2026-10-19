import assert from 'node:assert/strict';
import test from 'node:test';

import { asksToTransact } from '../src/lib/hire/transact-brief';

test('the trading brief Nagi was hired with twice is a request to transact', () => {
  assert.equal(
    asksToTransact("Run one grid session on BNB testnet (WBNB/BUSD) and report every trade with its tx hash and decision receipt. Trade only from Nagi's own wallet."),
    true,
  );
});

test('a read-only analysis that mentions trading is not', () => {
  assert.equal(
    asksToTransact('Analyse the proposed BNB trading range. Report range boundaries, grid spacing, fee assumptions and break-even conditions. State every assumption and data source. Do not execute transactions.'),
    false,
  );
});

test('Pokter’s own default brief is not', () => {
  assert.equal(asksToTransact('Produce a read-only assessment. State every assumption and data source; execute no transaction.'), false);
});

test('direct instructions to move funds are', () => {
  for (const brief of ['Swap 1 BNB to USDT on PancakeSwap.', 'Rebalance my portfolio to 60/40 BNB/USDT', 'Execute two trades on the WBNB pool.', 'Please deposit all my USDT into Venus.']) {
    assert.equal(asksToTransact(brief), true, brief);
  }
});

test('questions and advice are not', () => {
  for (const brief of ['Should I swap my BNB for USDT?', 'What would it cost to rebalance my portfolio', 'Is it safe to borrow against my BNB on Venus?', 'Simulate a swap of 1 BNB and report the slippage.']) {
    assert.equal(asksToTransact(brief), false, brief);
  }
});
