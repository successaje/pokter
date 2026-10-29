import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

/*
 * The wallet menu's balances: one line by default, the rest beneath it.
 * Asserted from source because the menu is a client component behind a
 * connected wallet.
 */
const menu = readFileSync(new URL('../src/shell/wallet/AccountButton.tsx', import.meta.url), 'utf8');

test('the balances fold to one line, and opening them is a real disclosure that is remembered', () => {
  assert.match(menu, /aria-expanded=\{details\}\s+aria-controls="wallet-balances"/);
  assert.match(menu, /\{details && \(\s*<div id="wallet-balances"/);
  assert.match(menu, /\+\{extraTokens\.length\} more/, 'folded, other tokens are counted, not hidden');
  assert.match(menu, /\{lowGas && <span className="text-watch">Low \{native\} for fees<\/span>\}/, 'folded, a low fee balance is still said');
  assert.match(menu, /window\.localStorage\.setItem\(DETAILS_KEY/);
  assert.match(menu, /\} catch \{\s*return false;/, 'storage that throws leaves it folded');
});

test('the fee token is the one of the chain the balances were read on', () => {
  assert.match(menu, /const native = w\.balances\.chainId === 56 \? 'BNB' : w\.balances\.chainId === 97 \? 'tBNB' : NATIVE_SYMBOL;/);
  assert.match(menu, /\{amount\(w\.balances\.native, 4\)\} <span className="text-ink-3">\{native\}<\/span>/);
  assert.match(menu, /\{testChain && FAUCETS &&/, 'test faucets only for balances read on the test network');
});

test('a failed network switch is said even with the balances folded', () => {
  assert.match(menu, /\{w\.switchError && <p /);
  assert.ok(menu.indexOf('{w.switchError && <p') > menu.indexOf('{details && ('), 'outside the folded part');
});
