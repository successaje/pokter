import assert from 'node:assert/strict';
import test from 'node:test';

import { balanceScope, selectableChains, switchAllowed } from '../src/lib/wallet/balance-scope';

test('a wallet on another network is shown no balance at all', () => {
  /*
   * `externalBalances` defaults its chain to the configured network, and the
   * wallet state passed `undefined` whenever the connected chain was not an
   * escrow chain — so a wallet on Ethereum was shown a BNB Chain balance for
   * the same address, labelled as the wallet's. A buyer decides what they can
   * afford by reading that figure, so a wrong-chain number is worse than none.
   */
  assert.deepEqual(balanceScope({ connectedChainId: 1, connected: true }, [56, 97]), {
    readable: false, reason: 'off-escrow-chain',
  });
  assert.deepEqual(balanceScope({ connectedChainId: null, connected: false }, [56, 97]), {
    readable: false, reason: 'no-wallet',
  });
});

test('balances are read on the chain the wallet is actually on', () => {
  assert.deepEqual(balanceScope({ connectedChainId: 56, connected: true }, [56, 97]), { readable: true, chainId: 56 });
  assert.deepEqual(balanceScope({ connectedChainId: 97, connected: true }, [56, 97]), { readable: true, chainId: 97 });
});

test('a chain that is enabled on its own does not make the other readable', () => {
  // Testnet-only deployment: a wallet on mainnet gets no figure, not a testnet one.
  assert.deepEqual(balanceScope({ connectedChainId: 56, connected: true }, [97]), {
    readable: false, reason: 'off-escrow-chain',
  });
});

test('only a chain a hire can settle on may be offered or switched to', () => {
  // A chain offered here that escrow cannot pay would be a dead end after funding.
  assert.deepEqual(selectableChains([97, 56]), [56, 97], 'sorted, so the order is stable');
  assert.equal(switchAllowed(56, [56, 97]), true);
  assert.equal(switchAllowed(1, [56, 97]), false, 'never Ethereum');
  assert.equal(switchAllowed(56, [97]), false, 'not when mainnet escrow is off');
});
