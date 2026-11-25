import { BOARD_RATING_MIN_REVIEWERS } from './contract';

/**
 * What a card that is compared with others says about an agent's rating
 * on PokterBoard.
 *
 * The agent's own page shows the board's totals from the first rating,
 * with the number of people beside them. A card is read against the cards
 * next to it, and there an average of one or two ratings is compared as if
 * it had been measured: one person's 5 beating six people's 4.6. So a card
 * shows the average only once as many distinct holders have rated the
 * agent as it takes to move its score (`BOARD_RATING_MIN_REVIEWERS`), and
 * before that says how many have.
 */
export type CardRating =
  | { kind: 'average'; average: number; reviewers: number }
  | { kind: 'few'; reviewers: number }
  | { kind: 'none' };

/** From the board's totals for the agent's wallet, or null when no one outside Pokter has rated it. */
export function cardRating(rating: { reviewers: number; stars: number } | null): CardRating {
  if (!rating || rating.reviewers <= 0) return { kind: 'none' };
  if (rating.reviewers < BOARD_RATING_MIN_REVIEWERS) return { kind: 'few', reviewers: rating.reviewers };
  return { kind: 'average', average: Math.round((rating.stars / rating.reviewers) * 10) / 10, reviewers: rating.reviewers };
}
