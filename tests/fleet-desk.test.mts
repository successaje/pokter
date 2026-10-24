import assert from 'node:assert/strict';
import test from 'node:test';

import { buildFleetDesk, type DeskInput } from '../src/lib/builder/diagnostics/desk';

type Diagnostics = Extract<DeskInput['result'], { ok: true }>['diagnostics'];

function agent(
  tokenId: string,
  id: 'blocked-before-any-buyer' | 'buyers-stopped' | 'no-buyer-yet' | 'nothing-failing',
  counts: { opens?: number | null; asks?: number; quoted?: number; stopped?: number; funded?: number } = {},
): DeskInput {
  const diagnostics = {
    headline: {
      id,
      title: `${id} title`,
      body: '',
      remediation: id === 'nothing-failing' || id === 'no-buyer-yet' ? null : { code: 'no-quote', reason: 'r', fix: { label: 'Fix the quote', href: '/build/integration#quote' }, transient: false },
    },
    demand: {
      measurable: true,
      noBuyerYet: id === 'no-buyer-yet',
      hireFlowOpens: counts.opens === undefined ? 0 : counts.opens,
      attempts: counts.asks ?? 0,
      quoted: counts.quoted ?? 0,
      stopped: counts.stopped ?? 0,
      stoppedByCode: [],
    },
    funding: { fundedInWindow: counts.funded ?? 0 },
  } as unknown as Diagnostics;
  return { chainId: 56, tokenId, name: `Agent ${tokenId}`, result: { ok: true, diagnostics } };
}

test('what needs the builder soonest comes first, then the most stopped', () => {
  const desk = buildFleetDesk(
    [
      agent('1', 'nothing-failing', { asks: 9, quoted: 9 }),
      agent('2', 'buyers-stopped', { asks: 4, stopped: 1 }),
      agent('3', 'blocked-before-any-buyer'),
      agent('4', 'buyers-stopped', { asks: 6, stopped: 3 }),
      agent('5', 'no-buyer-yet'),
    ],
    30,
  );
  assert.deepEqual(desk.rows.map((row) => row.tokenId), ['3', '4', '2', '5', '1']);
  assert.equal(desk.rows[0].fix?.href, '/build/integration#quote');
  assert.equal(desk.rows[0].href, '/build/agents/56/3#diagnostics', 'opens the agent’s own report');
});

test('totals add counted agents only, and an unreadable count stays unknown', () => {
  const desk = buildFleetDesk(
    [
      agent('1', 'buyers-stopped', { opens: 5, asks: 4, quoted: 3, stopped: 1, funded: 1 }),
      agent('2', 'nothing-failing', { opens: null, asks: 2, quoted: 2 }),
      { chainId: 97, tokenId: '9', name: 'Sold', result: { ok: false, message: 'The connected wallet does not own this agent.' } },
    ],
    30,
    3,
  );
  assert.deepEqual(desk.totals, { opens: 5, asks: 6, quoted: 5, stopped: 1, funded: 1, counted: 2, notCounted: 1 });
  const sold = desk.rows.find((row) => row.tokenId === '9')!;
  assert.equal(sold.counted, false);
  assert.equal(sold.title, 'The connected wallet does not own this agent.');
  assert.equal(desk.omitted, 3);

  const unknown = buildFleetDesk([agent('1', 'no-buyer-yet', { opens: null })], 30);
  assert.equal(unknown.totals.opens, null, 'never a zero for a count that was not read');
});
