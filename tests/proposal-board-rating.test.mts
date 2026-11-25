import assert from 'node:assert/strict';
import test from 'node:test';

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { BoardRatingLine } from '../src/features/briefs/BoardRatingLine';
import { API_CHANGES } from '../src/lib/api/changes';
import { cardRating, type CardRating } from '../src/lib/board/card-rating';
import { BOARD_RATING_MIN_REVIEWERS } from '../src/lib/board/contract';
import { HIRE_SKILL_MD } from '../src/lib/builders/hire-skill';

/*
 * A proposal card says what the people holding an Agent ID who paid the
 * agent said of it on PokterBoard, so a poster weighs that before they
 * choose. On a card read against others, an average of one or two ratings
 * would decide the comparison on one person's word, so the average waits
 * for as many people as the score does; the agent's own page shows the
 * totals from the first rating, with the count beside them.
 */

const line = (board: CardRating) =>
  renderToStaticMarkup(createElement(BoardRatingLine, { board }))
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

test('a card shows the board’s average only once as many people have rated as the score asks for', () => {
  assert.equal(BOARD_RATING_MIN_REVIEWERS, 3);
  assert.deepEqual(cardRating(null), { kind: 'none' });
  assert.deepEqual(cardRating({ reviewers: 0, stars: 0 }), { kind: 'none' });
  assert.deepEqual(cardRating({ reviewers: 1, stars: 5 }), { kind: 'few', reviewers: 1 }, 'one person’s 5 is not an average to compare');
  assert.deepEqual(cardRating({ reviewers: 2, stars: 7 }), { kind: 'few', reviewers: 2 });
  assert.deepEqual(cardRating({ reviewers: 3, stars: 13 }), { kind: 'average', average: 4.3, reviewers: 3 }, 'rounded to one place, as the stars print it');
  assert.deepEqual(cardRating({ reviewers: 6, stars: 29 }), { kind: 'average', average: 4.8, reviewers: 6 });
});

test('the card’s line says the average and who gave it, how many have rated so far, or that nobody has', () => {
  assert.equal(line(cardRating({ reviewers: 3, stars: 13 })), '4.3/5 from 3 Agent ID holders on PokterBoard');
  assert.match(renderToStaticMarkup(createElement(BoardRatingLine, { board: cardRating({ reviewers: 3, stars: 13 }) })), /aria-label="4\.3 out of 5"/);
  assert.equal(line(cardRating({ reviewers: 1, stars: 5 })), 'Rated by 1 Agent ID holder on PokterBoard; the average shows from 3', 'no average from one rating');
  assert.equal(line(cardRating({ reviewers: 2, stars: 7 })), 'Rated by 2 Agent ID holders on PokterBoard; the average shows from 3');
  assert.equal(line(cardRating(null)), 'No PokterBoard ratings yet');
});

test('an assistant is told to show each agent’s board rating before its user chooses', () => {
  assert.match(HIRE_SKILL_MD, /`get_agent` gives each agent's record: the checks it answered, the paid\njobs it completed, and `boardRating`/);
  assert.match(HIRE_SKILL_MD, /Show the user the proposals with\nthose records and let them choose; never choose for them\./);
  const change = API_CHANGES.find((c) => c.summary === 'An agent’s record carries its rating on PokterBoard.');
  assert.ok(change, 'the API change is announced');
  assert.equal(change.date, null, 'unreleased until a deploy carries it');
  assert.deepEqual(change.surfaces, ['GET /api/v1/agents/{chainId}/{tokenId}', 'MCP get_agent']);
});
