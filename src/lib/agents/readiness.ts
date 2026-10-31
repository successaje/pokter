import { checkStanding } from '@/lib/assay/standing';

/**
 * What Pokter has observed about an agent, one fact per row.
 *
 * One readiness badge mixed facts with different scopes and ages. Stockroom
 * read "Answered just now" beside "it has not answered Pokter's checks": the
 * first was the live check made when the page loaded, the second the
 * scheduled history, which held no checks at all. Its price had expired and
 * still read as payable. Each row here says what was measured, when, and
 * how much of it there is, so no row borrows another's authority.
 */

/**
 * `watch` is evidence that is real but short of the row's claim — the
 * courier delivery the ladder calls `partial`. Without it such a row had
 * to choose between the green of a delivery the agent made itself and the
 * red of no delivery at all, and both misreport it.
 */
export type ReadinessTone = 'ok' | 'watch' | 'bad' | 'unknown';

export interface ReadinessRow {
  id: 'live' | 'history' | 'price' | 'payment' | 'delivery' | 'correctness';
  label: string;
  value: string;
  tone: ReadinessTone;
  detail: string;
}

export interface ReadinessInput {
  now: number;
  live: { answered: boolean; medianMs: number | null };
  record: { totalProbes: number; totalAnswered: number; observedDays: number; lastSeen: string | null };
  /** The newest scheduled check and what it found, in words (`endpointReading`). */
  lastCheck?: { at: string; reading: string } | null;
  quote: { quotedAt: string; expiresAt: string | null; current: boolean; payable: boolean | null } | null;
  escrowLabel: string;
  history: { jobs: number; selfDelivered: number; operatorDelivered: number; relayedDelivered: number };
  categoryCheck: { name: string; run: { status: string; passed: number; total: number; ranAt: string; detail?: string | null } | null } | null;
}

function ago(iso: string, now: number): string {
  const minutes = Math.max(0, Math.round((now - Date.parse(iso)) / 60_000));
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} h ago`;
  return `${Math.round(hours / 24)} d ago`;
}

export function readinessRows(input: ReadinessInput): ReadinessRow[] {
  const { live, record, quote, history, categoryCheck, lastCheck, now } = input;
  const rows: ReadinessRow[] = [];

  rows.push({
    id: 'live',
    label: 'Live check',
    value: live.answered ? `Answered${live.medianMs ? ` in ${live.medianMs < 1000 ? `${Math.round(live.medianMs)} ms` : `${(live.medianMs / 1000).toFixed(1)} s`}` : ''}` : 'No answer',
    tone: live.answered ? 'ok' : 'bad',
    detail: 'One call to its published endpoint when this page loaded. Says it is up now, not that it stays up.',
  });

  rows.push({
    id: 'history',
    label: 'Scheduled checks',
    value: record.totalProbes === 0 ? 'None yet' : `${record.totalAnswered} of ${record.totalProbes} answered`,
    tone: record.totalProbes === 0 ? 'unknown' : record.totalAnswered / record.totalProbes >= 0.9 ? 'ok' : record.totalAnswered === 0 ? 'bad' : 'unknown',
    detail:
      record.totalProbes === 0
        ? 'No sweep has measured it, so there is no history either way.'
        : `Over ${Math.max(1, Math.round(record.observedDays))} observed day${Math.round(record.observedDays) === 1 ? '' : 's'}${
            lastCheck
              ? `; last checked ${ago(lastCheck.at, now)}: ${lastCheck.reading.charAt(0).toLowerCase()}${lastCheck.reading.slice(1)}`
              : record.lastSeen ? `, last ${ago(record.lastSeen, now)}` : ''
          }.`,
  });

  rows.push({
    id: 'price',
    label: 'Escrow quote',
    value: !quote ? 'None' : quote.current ? 'Current' : 'Expired',
    tone: !quote ? 'unknown' : quote.current ? 'ok' : 'unknown',
    detail: !quote
      ? 'It has never returned a signed quote to Pokter.'
      : quote.current
        ? `Signed ${ago(quote.quotedAt, now)}${quote.expiresAt ? `, valid until ${new Date(quote.expiresAt).toUTCString().slice(5, 22)} UTC` : ', no expiry stated'}.`
        : `Signed ${ago(quote.quotedAt, now)} and expired${quote.expiresAt ? ` ${ago(quote.expiresAt, now)}` : ''}. A hire asks for a fresh one first.`,
  });

  rows.push({
    id: 'payment',
    label: 'Payment',
    value: !quote || quote.payable === null ? 'Unknown' : quote.payable ? `Payable on ${input.escrowLabel}` : 'Wrong token',
    tone: !quote || quote.payable === null ? 'unknown' : quote.payable ? 'ok' : 'bad',
    detail: !quote
      ? 'With no signed price, whether an escrow can pay it is unknown.'
      : quote.payable
        ? `The quoted token is the one this escrow settles in.${quote.current ? '' : ' Read from the last quote, which has expired.'}`
        : 'The quoted token is not one this escrow settles in.',
  });

  /*
   * The same three states the ladder's third step carries, said in a row.
   * "None yet" and the bad tone were being shown for an agent whose own
   * answer had reached a paying buyer through Pokter's courier, which
   * reads as a failure to deliver rather than as what happened.
   */
  const relayed = history.selfDelivered === 0 && history.relayedDelivered > 0;
  rows.push({
    id: 'delivery',
    label: 'Paid delivery',
    value: history.selfDelivered > 0
      ? `${history.selfDelivered} delivered`
      : relayed
        ? `${history.relayedDelivered} via Pokter`
        : history.jobs > 0 ? 'None yet' : 'Never hired',
    tone: history.selfDelivered > 0 ? 'ok' : relayed ? 'watch' : history.jobs > 0 ? 'bad' : 'unknown',
    detail:
      history.selfDelivered > 0
        ? `Delivered from its own wallet, across ${history.jobs} escrow job${history.jobs === 1 ? '' : 's'}.`
        : relayed
          ? `The agent answered and Pokter’s courier submitted it to escrow, on ${history.relayedDelivered} job${history.relayedDelivered === 1 ? '' : 's'}. Nothing submitted from the agent’s own wallet.`
          : history.operatorDelivered > 0
            ? 'A delivery reached escrow, but a Pokter wallet submitted it, so it does not count for the agent.'
            : history.jobs > 0
              ? `Hired ${history.jobs} time${history.jobs === 1 ? '' : 's'} with no delivery from its own wallet.`
              : 'No escrow job has been funded for it.',
  });

  /*
   * "Answer check", not "Correctness": several checks grade only what the
   * brief itself fixes (the yield one, the buyer's own terms read back), so
   * a pass is not the agent's answers being right, and the row named after
   * it is the check's own name. A check that answered but graded nothing
   * says so, rather than "could not be checked".
   */
  const check = categoryCheck?.run ?? null;
  const ungraded = check?.status === 'checked' && check.total === 0;
  rows.push({
    id: 'correctness',
    label: 'Answer check',
    value: !categoryCheck ? 'No check for its kind' : !check ? 'Not checked yet' : check.total > 0 ? `${check.passed} of ${check.total} passed` : ungraded ? 'Not graded' : 'Could not be checked',
    /* A full pass past `CHECK_FRESH_DAYS` is real but no longer counts: amber, as a partial step is. */
    tone: !check || check.total === 0 ? 'unknown' : check.passed !== check.total ? 'bad' : checkStanding(check, now) === 'stale' ? 'watch' : 'ok',
    detail: !categoryCheck
      ? 'Pokter has no answer check for this kind of agent, so answers are not graded.'
      : !check
        ? `${categoryCheck.name} has not run against it yet.`
        : ungraded && check.detail
          ? `${categoryCheck.name}, ${ago(check.ranAt, now)}. ${check.detail}`
          : `${categoryCheck.name}, ${ago(check.ranAt, now)}.`,
  });

  return rows;
}
