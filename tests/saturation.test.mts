import assert from 'node:assert/strict';
import { test } from 'node:test';

import { EPISODE_GRACE_MS, continuesEpisode, extendEpisode, openEpisode, type SaturationSighting } from '../src/lib/health/saturation';

const at = (clock: string) => `2026-10-20T${clock}Z`;
const seen = (clock: string, lag: number | null, timedOut = 0, reasons = ['event loop lagging']): SaturationSighting => ({
  at: at(clock),
  lagP99Ms: lag,
  timedOutRecently: timedOut,
  reasons,
});

test('consecutive checks are one episode, not a hundred', () => {
  /*
   * The stall on 20 October ran about twenty-seven minutes, which at Fly's
   * cadence is over a hundred checks. A hundred records saying "still bad"
   * answer nothing that start, end, peak and count do not.
   */
  let episode = openEpisode(seen('11:00:00', 7290));
  for (const s of [seen('11:00:15', 8800), seen('11:00:30', 7684)]) {
    assert.equal(continuesEpisode(episode, s), true);
    episode = extendEpisode(episode, s);
  }

  assert.equal(episode.startedAt, at('11:00:00'));
  assert.equal(episode.lastSeenAt, at('11:00:30'));
  assert.equal(episode.checks, 3);
});

test('a check 92 seconds late still continues the episode', () => {
  /*
   * Not a hypothetical: the detector reported "health check arrived 92s
   * after the last" during the stall, because the loop was too busy to
   * answer its own check. A grace window tighter than that would split one
   * stall into a dozen brief-looking ones, which is the opposite of what a
   * record is for.
   */
  const episode = openEpisode(seen('11:00:00', 7290));
  const late = seen('11:01:32', 22079, 24, ['event loop lagging', 'health check arrived 92s after the last']);

  assert.equal(continuesEpisode(episode, late), true, '92s is inside the window');
  assert.ok(92_000 < EPISODE_GRACE_MS, 'and the window is set with that in mind');

  const extended = extendEpisode(episode, late);
  assert.deepEqual(
    extended.reasons,
    ['event loop lagging', 'health check arrived 92s after the last'],
    'an episode that changes character keeps both readings',
  );
});

test('peaks climb and never fall back', () => {
  // A stall that eases before it ends must not erase how bad it got.
  const worst = extendEpisode(openEpisode(seen('11:00:00', 7290, 2)), seen('11:00:15', 22079, 24));
  const easing = extendEpisode(worst, seen('11:00:30', 150, 1));

  assert.equal(easing.peakLagP99Ms, 22079, 'the worst lag survives a milder reading');
  assert.equal(easing.peakTimedOut, 24, 'as does the worst deadline count');
  assert.equal(easing.checks, 3, 'while the count keeps counting');
});

test('a missing lag reading does not blank a peak already recorded', () => {
  /*
   * `readVitals` resets the lag histogram on every read, so a check arriving
   * before any samples accumulate reports null. Null means "not measured
   * this time", never "recovered" — and the two must not be confused by the
   * record that outlives them.
   */
  const episode = extendEpisode(openEpisode(seen('11:00:00', 9000)), seen('11:00:15', null, 1));
  assert.equal(episode.peakLagP99Ms, 9000);
  assert.equal(episode.checks, 2);
});

test('a gap past the window starts a new episode', () => {
  const episode = openEpisode(seen('11:00:00', 9000, 24));
  const later = seen('11:30:00', 300);

  assert.equal(continuesEpisode(episode, later), false, 'half an hour apart is two incidents');
  const fresh = openEpisode(later);
  assert.equal(fresh.checks, 1);
  assert.equal(fresh.peakTimedOut, 0, "and a new episode does not inherit the previous one's peaks");
});

test('nothing open means the sighting opens one', () => {
  assert.equal(continuesEpisode(null, seen('11:00:00', 100)), false);
});
