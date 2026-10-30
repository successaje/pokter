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
  assert.match(card, /\{row\.paid\.outsideCompleted\} outside<\/span>/);
});

test('a passed answer check is shown only where there is one, linked to its comparison, and nothing says "No proof yet"', () => {
  assert.match(card, /\{checked && \(\n\s*<Link href=\{`\$\{agentHref\(row\)\}#answer-check`\}/);
  assert.match(card, />\n\s*Passed answer check\n/);
  assert.doesNotMatch(card, /None on record|<dt className="t-label">Answer check<\/dt>/);
  assert.doesNotMatch(card, /'No proof yet'|>No proof yet<|<dt className="t-label">Proof<\/dt>|>Paid result</);
});

test('the settled count shows on a phone, not only from the small breakpoint up', () => {
  assert.match(card, /<dl className="mt-5 grid grid-cols-2 gap-3 text-\[13px\] sm:grid-cols-3">/);
  const paid = card.slice(card.indexOf('<dt className="t-label">Paid jobs</dt>') - 120, card.indexOf('<dt className="t-label">Paid jobs</dt>'));
  assert.doesNotMatch(paid, /hidden/);
});
