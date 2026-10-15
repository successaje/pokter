import assert from 'node:assert/strict';
import test from 'node:test';

import { planMcpRevisionCorrections, type CorrectableProbe } from '../src/lib/history/corrections';

let id = 0;
const row = (tokenId: string, probedAt: string, ok: boolean, status: number | null = ok ? 200 : 400, protocol = 'mcp'): CorrectableProbe => ({
  id: ++id, chainId: 56, tokenId, protocol, ok, status, probedAt, corrected: false,
});

const rows = [
  // HeyAnon's Venus agent: 400s under the old header, answers since the fix.
  row('43129', '2026-10-10T13:54:59Z', false),
  row('43129', '2026-10-13T06:39:07Z', false),
  row('43129', '2026-10-15T10:10:00Z', false), // between the commit and the deploy
  row('43129', '2026-10-15T12:00:00Z', true),
  row('43129', '2026-10-16T12:00:00Z', false), // after it answered: its own
  // Declares no revision: unattributable.
  row('50000', '2026-10-10T00:00:00Z', false),
  row('50000', '2026-10-16T00:00:00Z', true),
  // Declares an earlier revision but has not answered since: unknown stays unknown.
  row('50001', '2026-10-10T00:00:00Z', false),
  // A timeout is never a header refusal.
  row('43129', '2026-10-11T00:00:00Z', false, null),
  // A2A rows are out of scope.
  row('43129', '2026-10-11T00:00:00Z', false, 400, 'a2a'),
];
const declared = new Map([['56:43129', '2025-06-18'], ['56:50000', null], ['56:50001', '2025-06-18']]);

test('400s before the agent’s first answer to the fixed probe are corrected, and nothing else', () => {
  const plans = planMcpRevisionCorrections(rows, declared);
  const venus = plans.find((p) => p.tokenId === '43129')!;
  assert.equal(venus.corrections.length, 3);
  assert.deepEqual(venus.before, { probes: 6, answered: 1 });
  assert.deepEqual(venus.after, { probes: 3, answered: 1 });
  assert.equal(venus.corrections[0].rule, 'mcp-revision-2026-10-15');
});

test('an agent that declares nothing, or has not answered since, keeps its record and says why', () => {
  const plans = planMcpRevisionCorrections(rows, declared);
  assert.match(plans.find((p) => p.tokenId === '50000')!.skipped ?? '', /declares no MCP revision/);
  assert.match(plans.find((p) => p.tokenId === '50001')!.skipped ?? '', /has not answered the corrected probe/);
  assert.equal(plans.find((p) => p.tokenId === '50001')!.corrections.length, 0);
});

test('rows already corrected are not counted twice', () => {
  const again = planMcpRevisionCorrections(rows.map((r) => ({ ...r, corrected: r.tokenId === '43129' && !r.ok && r.status === 400 && r.probedAt < '2026-10-15T12:00:00Z' && r.protocol === 'mcp' })), declared);
  assert.equal(again.find((p) => p.tokenId === '43129')?.corrections.length ?? 0, 0);
});
