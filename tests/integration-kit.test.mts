import assert from 'node:assert/strict';
import test from 'node:test';

import { QUOTE_FAILURE_CODES } from '../src/lib/hire/failure';
import { buildIntegrationKit } from '../src/lib/integration/kit';

const ESCROW = { chainId: 56, network: 'BNB Chain', commerce: '0xEa4DAa3100A767e86FDed867729ae7446476EBA6', router: '0x51895229E12F9876011789B04f8698af06cCD6DA', policy: '0x9C01845705b3078Aa2e8cfF7520a6376FD766dE5', paymentToken: '0xcE24439F2D9C6a2289F741120FE202248B666666' };
const integrationKit = (origin: string) => buildIntegrationKit(origin, [ESCROW]);

test('the kit lists every refusal code Pokter can return, with its layer and status', () => {
  const kit = integrationKit('https://pokter.xyz');
  assert.deepEqual(kit.refusals.map((r) => r.code), [...QUOTE_FAILURE_CODES]);
  for (const r of kit.refusals) {
    assert.ok(r.status >= 400 && r.status < 600, r.code);
    assert.doesNotMatch(r.meaning, /undefined/, r.code);
  }
});

test('the kit names an escrow with all its contracts, and the required skills', () => {
  const kit = integrationKit('https://pokter.xyz');
  assert.ok(kit.escrows.length > 0);
  for (const e of kit.escrows) for (const k of ['commerce', 'router', 'policy', 'paymentToken'] as const) assert.match(e[k], /^0x[0-9a-fA-F]{40}$/);
  assert.deepEqual(kit.skills.filter((s) => s.required).map((s) => s.id), ['negotiate', 'notify_funded']);
  assert.ok(kit.preflight.every((p) => p.url.includes('https://pokter.xyz')));
});
