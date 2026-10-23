import type { BoardView } from './href';
import { RESPONSIVENESS_WINDOW_DAYS } from './responsiveness';

/**
 * What period each board covers, stated rather than chosen.
 *
 * Both boards already use the word "period" — the empty-result sentence ends
 * "for this network and period", and the closing card says "in this period" —
 * without ever saying what it is. A reader is left to supply one, and the
 * one they supply is whatever the rest of the page suggests.
 *
 * ## Why the outcomes board has no period control
 *
 * A design study for this page put a "Last 30 days" selector above Customer
 * outcomes. There is no such window and there cannot be one: the board is
 * built from `JobStore.all()` filtered to the escrow chain and nothing else
 * (`buildOutcomeBoard`), so it is every job Pokter's index holds, with the
 * last chain re-read as its only edge. The index has no earlier horizon to
 * honestly claim either — it starts when Pokter started recording hires, not
 * at some agreed date — so "last 30 days" would not be a narrower truth, it
 * would be a filter the page does not apply described as one it does.
 *
 * That is precisely the defect this page has shipped five times: a rendered
 * label outliving, or never matching, the rule the code applies. A period
 * control would be the sixth, and the worst kind, because a reader who
 * believes the board is windowed reads every count as recent.
 *
 * So the period is printed as a fact with no control beside it. Printed, and
 * not left blank, because the alternative to a wrong period is a stated one,
 * not an absent one.
 *
 * ## Why responsiveness is different
 *
 * There the window is real: `RESPONSIVENESS_WINDOW_DAYS` bounds the bucket
 * the rate is taken from and the catalogue read that feeds it. A control
 * over 24h / 7d / 30d would be legitimate in a way the outcomes one is not —
 * `TrackRecord` publishes all three. It is still not offered here, for a
 * reason that is about this board rather than about honesty:
 * `MIN_RESPONSIVENESS_CHECKS` is 50, and the comment on it derives that
 * figure from the 30-day distribution. At roughly 11.8 checks a day a 24-hour
 * bucket holds about twelve for the busiest agent on either chain, so every
 * row would fall below the minimum and the control's first two settings
 * would publish an empty board. Offering a period whose only effect is to
 * empty the page is a worse control than none.
 */
export interface BoardPeriod {
  /** The label beside the figure. Short, because it sits in a control bar. */
  label: string;
  /** The period itself, as the page prints it. */
  value: string;
  /** Why it is this and not something a reader might assume. */
  note: string;
}

export const OUTCOMES_PERIOD: BoardPeriod = {
  label: 'Period',
  value: 'Every indexed job, up to the last refresh',
  note:
    'This board has no rolling window. It counts every job Pokter’s index holds for this escrow, however old, and the index itself only reaches back to the first hire Pokter recorded. Nothing here is filtered to a recent period, so nothing here should be read as recent.',
};

export const RESPONSIVENESS_PERIOD: BoardPeriod = {
  label: 'Period',
  value: `Last ${RESPONSIVENESS_WINDOW_DAYS} days`,
  note:
    `Checks older than ${RESPONSIVENESS_WINDOW_DAYS} days are outside every figure on this board. How much of those ` +
    `${RESPONSIVENESS_WINDOW_DAYS} days each row actually covers is stated on the row, because the rows do not all cover the same part of it.`,
};

export function periodOf(view: BoardView): BoardPeriod {
  return view === 'responsiveness' ? RESPONSIVENESS_PERIOD : OUTCOMES_PERIOD;
}
