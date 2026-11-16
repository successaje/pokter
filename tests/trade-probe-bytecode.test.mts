import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';

import { TRADE_PROBE_RUNTIME } from '../src/lib/house/agents/touchstone-probe';

/*
 * Touchstone runs TRADE_PROBE_RUNTIME inside an eth_call, and that constant
 * is compiled output pasted into the code. Compile the source the way it was
 * compiled (solc 0.8.26, optimizer on, 200 runs) and require the same bytes,
 * metadata included, so the constant can never drift from the contract a
 * reader can inspect.
 */

const solc = createRequire(import.meta.url)('solc') as { compile(input: string): string; version(): string };
const SOURCE = 'contracts/touchstone/TradeProbe.sol';

test('the pasted probe bytecode is exactly what its source compiles to', () => {
  assert.match(solc.version(), /^0\.8\.26\+/, 'the compiler the constant was built with');
  const input = {
    language: 'Solidity',
    sources: { [SOURCE]: { content: readFileSync(new URL(`../${SOURCE}`, import.meta.url), 'utf8') } },
    settings: { optimizer: { enabled: true, runs: 200 }, outputSelection: { '*': { '*': ['evm.deployedBytecode.object'] } } },
  };
  const output = JSON.parse(solc.compile(JSON.stringify(input))) as {
    errors?: Array<{ severity: string; formattedMessage: string }>;
    contracts: Record<string, Record<string, { evm: { deployedBytecode: { object: string } } }>>;
  };
  const errors = (output.errors ?? []).filter((e) => e.severity === 'error');
  assert.deepEqual(errors.map((e) => e.formattedMessage), []);
  assert.equal(`0x${output.contracts[SOURCE].TradeProbe.evm.deployedBytecode.object}`, TRADE_PROBE_RUNTIME);
});
