/**
 * The same moment in the reader's own timezone.
 *
 * The window's close was shown in UTC only, which is the right thing to
 * record and the wrong thing to read: a buyer deciding whether they have
 * time to look at a delivery should not have to convert. Shown beside the
 * UTC text rather than instead of it.
 *
 * Written with explicit fields. `dateStyle` and `timeStyle` cannot be
 * combined with `timeZoneName` (or any single field): Intl throws
 * "Invalid option : option", and on the job page that throw crashed the
 * whole render for every delivered job.
 */
export function localMoment(epochSeconds: number, locale?: string): string {
  return new Date(epochSeconds * 1000).toLocaleString(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  });
}
