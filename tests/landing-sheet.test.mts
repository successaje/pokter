import assert from 'node:assert/strict';
import test from 'node:test';

import { FILM_CHAPTERS, FILM_END, chapterLabel, chapterSays } from '../src/lib/landing/film-chapters';
import { FIELD_ANSWERED, FIELD_COLS, FIELD_ROWS, FIELD_SIZE, heroFieldCells, inTextZone } from '../src/lib/landing/hero-field';
import { oneLine } from '../src/lib/landing/one-line';

/*
 * The home page set as one ruled sheet: the parts of it that are logic
 * rather than layout. A board cell's one line, the film's chapters, and the
 * hero's field of cells.
 */

test('a cell gets one line of what the agent does, not its registration restated', () => {
  assert.equal(
    oneLine('Yield agent (category: yield) on BNB Smart Chain testnet. Compares USDT supply rates on Venus and Aave.'),
    'Compares USDT supply rates on Venus and Aave.',
  );
  // A description that is all classification is kept rather than emptied.
  assert.equal(oneLine('Health factor agent on BNB Chain.'), 'Health factor agent on BNB Chain.');
});

test('a long line is cut at a clause or a word, never on a word left dangling', () => {
  const cut = oneLine(
    'Keeps BNB supplied to the Venus vBNB lending market according to a published rule: target a health factor of two and repay through the escrow',
  );
  assert.ok(cut.endsWith('…'), cut);
  assert.ok(cut.length <= 91, cut);
  assert.doesNotMatch(cut, /\s(?:a|an|the|of|to|through|and|according)…$/, cut);
  assert.doesNotMatch(oneLine(`${'word '.repeat(10)}repays the account’s health factor before liquidation, every block`), /['’]s…$/);
});

test('the film’s chapters run in order, each inside the recording, each once', () => {
  const starts = FILM_CHAPTERS.map((c) => c.at);
  assert.deepEqual(starts, [...starts].sort((a, b) => a - b));
  assert.equal(starts[0], 0);
  assert.ok(starts.at(-1)! < FILM_END);
  assert.equal(new Set(FILM_CHAPTERS.map((c) => c.key)).size, FILM_CHAPTERS.length);
  for (const chapter of FILM_CHAPTERS) {
    assert.equal(chapterLabel(chapter.key), chapter.label);
    assert.ok(chapterSays(chapter.key).length > 40, `${chapter.key} says what the screen shows`);
  }
});

test('the hero’s field keeps off the words, stays on the paper, and lights only a few cells for long', () => {
  const cells = heroFieldCells();
  assert.equal(cells.length, FIELD_SIZE);
  for (const cell of cells) {
    assert.ok(!inTextZone(cell.col, cell.row), `${cell.col}:${cell.row} is behind the headline`);
    assert.ok(cell.col >= 0 && cell.col < FIELD_COLS && cell.row >= 0 && cell.row < FIELD_ROWS);
    assert.ok(cell.offset <= 0, 'already mid-cycle when the page opens');
  }
  assert.equal(new Set(cells.map((c) => `${c.col}:${c.row}`)).size, cells.length, 'no two in one square');
  const held = cells.filter((c) => c.answered).length;
  assert.ok(held > 0 && held <= FIELD_ANSWERED, `${held} held`);
});

test('the field is the same on the server and on every visit', () => {
  assert.deepEqual(heroFieldCells(), heroFieldCells());
  assert.notDeepEqual(heroFieldCells(1), heroFieldCells(2));
});

test('the footer’s edge thins out from the yellow toward the paper, and is the same edge every time', async () => {
  const { EDGE_COLS, EDGE_ROWS, pixelEdge } = await import('../src/lib/ui/pixel-edge');
  const squares = pixelEdge();
  const filled = (row: number) => squares.filter((s) => s.row === row && s.kind !== 'ghost').length;
  for (let row = 1; row < EDGE_ROWS; row++) assert.ok(filled(row) < filled(row - 1), `row ${row} is thinner than the one under it`);
  assert.ok(filled(0) > EDGE_COLS * 0.75, 'the row touching the yellow is nearly solid');
  assert.equal(squares.filter((s) => s.row === 0 && s.kind === 'ghost').length, 0, 'no squares flash into the bottom row');
  assert.equal(new Set(squares.map((s) => `${s.col}:${s.row}`)).size, squares.length, 'one square per cell');
  assert.deepEqual(pixelEdge(), pixelEdge());
});
