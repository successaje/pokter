import { BOARD_RATING_MIN_REVIEWERS } from '@/lib/board/contract';
import type { CardRating } from '@/lib/board/card-rating';
import { Rating } from '@/ui/Rating';

const holders = (n: number) => (n === 1 ? 'Agent ID holder' : 'Agent ID holders');

/**
 * One line of a proposal card's record: what the people holding an Agent
 * ID who paid the agent said of it on PokterBoard. An average only once
 * enough of them have rated it that one cannot decide the comparison
 * (`cardRating`); before that, how many have.
 */
export function BoardRatingLine({ board }: { board: CardRating }) {
  if (board.kind === 'average')
    return (
      <li className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
        <Rating value={board.average} />
        <span>
          from {board.reviewers} {holders(board.reviewers)} on PokterBoard
        </span>
      </li>
    );
  if (board.kind === 'few')
    return (
      <li>
        Rated by <span className="font-medium text-ink">{board.reviewers}</span> {holders(board.reviewers)} on PokterBoard; the average shows from {BOARD_RATING_MIN_REVIEWERS}
      </li>
    );
  return <li>No PokterBoard ratings yet</li>;
}
