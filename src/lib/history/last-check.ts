import 'server-only';

import { getProbeStore } from './store';

/**
 * When Pokter last called an agent: the newest probe or sweep on record,
 * whichever is later. Null when there is none, or the store cannot be read,
 * and the page then says nothing rather than an age it does not know.
 */
export function lastCheckAt(): string | null {
  try {
    const store = getProbeStore();
    const times = [store.recent(1)[0]?.probedAt ?? null, store.lastSweep()?.finishedAt ?? null].filter((t): t is string => Boolean(t));
    return times.length ? times.sort().at(-1)! : null;
  } catch {
    return null;
  }
}
