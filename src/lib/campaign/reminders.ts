/**
 * When a Set and Earn reminder is due. Pure, so the schedule is tested
 * without a mail provider or a clock.
 */

const DAY = 86_400_000;

/** The deadline reminders, earliest first. Ids are what a subscription records as sent. */
export const DEADLINE_REMINDERS = [
  { id: '7d', beforeMs: 7 * DAY, label: 'One week left' },
  { id: '2d', beforeMs: 2 * DAY, label: 'Two days left' },
  { id: '1d', beforeMs: 1 * DAY, label: 'Last day' },
] as const;

export type DeadlineReminder = (typeof DEADLINE_REMINDERS)[number];

/**
 * The one deadline reminder to send now, if any.
 *
 * Only the latest one that has come due is sent, so a subscription made
 * with three days left gets "two days left" when that comes, not "one week
 * left" straight away. Reminders that came due before the person subscribed
 * are skipped, and nothing is sent once the campaign has closed.
 */
export function dueDeadlineReminder(input: { nowMs: number; endsAtMs: number; subscribedAtMs: number; sent: readonly string[] }): DeadlineReminder | null {
  if (input.nowMs >= input.endsAtMs) return null;
  const due = DEADLINE_REMINDERS.filter((r) => {
    const at = input.endsAtMs - r.beforeMs;
    return at <= input.nowMs && at >= input.subscribedAtMs;
  });
  const latest = due.at(-1);
  return latest && !input.sent.includes(latest.id) ? latest : null;
}

/** Reminders that came due at or before `reminder`: recorded as sent with it, so an earlier one is never sent late. */
export function settledWith(reminder: DeadlineReminder): string[] {
  const index = DEADLINE_REMINDERS.findIndex((r) => r.id === reminder.id);
  return DEADLINE_REMINDERS.slice(0, index + 1).map((r) => r.id);
}

/**
 * Whether a change in hires is worth an email: more distinct agents than
 * last time. The first reading is a silent baseline, and a lower count
 * (an index catching up, a job reclassified) is not news.
 */
export function hireProgressNews(previous: number | null, current: number): boolean {
  return previous !== null && current > previous;
}
