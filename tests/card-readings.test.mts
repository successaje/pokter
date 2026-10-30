import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

/*
 * An agent card's evidence readings each name what they count. "Paid
 * result" counted every settled job and "Proof" only outside buyers and
 * passed checks, so a card read "2/2 settled" beside "No proof yet".
 */

const card = readFileSync(new URL('../src/features/agents/AgentCard.tsx', import.meta.url), 'utf8');

test('settled jobs carry how many were for outside buyers, on the same reading', () => {
  assert.match(card, /<dt className="t-label">Paid jobs<\/dt>/);
  assert.match(card, /`\$\{row\.paid\.completed\}\/\$\{terminalJobs\} settled`/);
  assert.match(card, /\{row\.paid\.outsideCompleted\} for outside buyers<\/span>/);
});

test('a passed answer check is shown only where there is one, linked to its comparison, and nothing says "No proof yet"', () => {
  assert.match(card, /\{checked && \(\n\s*<Link href=\{`\$\{agentHref\(row\)\}#answer-check`\}/);
  assert.match(card, />\n\s*Passed check\n/);
  assert.doesNotMatch(card, /None on record|<dt className="t-label">Answer check<\/dt>/);
  assert.doesNotMatch(card, /'No proof yet'|>No proof yet<|<dt className="t-label">Proof<\/dt>|>Paid result</);
});

test('the settled count shows on a phone, not only from the small breakpoint up', () => {
  assert.match(card, /<dl className="mt-4 grid grid-cols-3 gap-3 text-\[13px\]">/);
  const paid = card.slice(card.indexOf('<dt className="t-label">Paid jobs</dt>') - 120, card.indexOf('<dt className="t-label">Paid jobs</dt>'));
  assert.doesNotMatch(paid, /hidden/);
});

test('replies are a reading beside paid jobs and delivery, and the ID sits beside the name', () => {
  const dl = card.slice(card.indexOf('<dl className="mt-4 grid grid-cols-3'), card.indexOf('</dl>', card.indexOf('<dl className="mt-4 grid grid-cols-3')));
  assert.ok(dl.indexOf('>Replies<') < dl.indexOf('>Paid jobs<') && dl.indexOf('>Paid jobs<') < dl.indexOf('>Delivers<'), 'three readings, in order');
  assert.match(card, /<h3 className="flex min-w-0 items-baseline gap-2[^"]*">[\s\S]{0,400}#\{row\.tokenId\}<\/span>\n\s*<\/h3>/);
  assert.match(card, /\{row\.priceU !== null && <span className="-ml-1 text-\[12\.5px\] text-ink-3">per job<\/span>\}/);
});
