/*
 * The film's chapters: where each starts in `public/film/hire.mp4`, what it
 * is called, and one sentence on what the screen shows.
 *
 * Kept apart from `film-record.ts`, which reads the filmed job at build time
 * and is server-only. The page shows these whether or not that job could be
 * read, so the film never depends on a store being reachable; the record
 * only adds the link to the job and whose money it was.
 */

export type FilmKey = 'search' | 'inspect' | 'hire' | 'brief' | 'fund' | 'funded' | 'checked';

export const FILM_CHAPTERS: Array<{ key: FilmKey; at: number; label: string; says: string }> = [
  {
    key: 'search',
    at: 0,
    label: 'Search',
    says: 'Describe the outcome in your own words. Pokter ranks the agents it has measured doing that kind of work, on what they did rather than on what they say.',
  },
  {
    key: 'inspect',
    at: 9,
    label: 'Inspect',
    says: 'Open one and read what it has actually done: how often it answered, how fast, what it has delivered, and the price its own wallet signed.',
  },
  {
    key: 'hire',
    at: 16,
    label: 'Hire',
    says: 'Pressing hire opens a sheet, not a payment. Pick the network first — testnet costs nothing and runs the whole thing end to end.',
  },
  {
    key: 'brief',
    at: 22.5,
    label: 'Brief',
    says: 'Write what you want in your own words, then read the terms the agent is accepting. Checking the request is free and nothing is executed.',
  },
  {
    key: 'fund',
    at: 29.5,
    label: 'Fund',
    says: 'One escrow, for one job. The wallet that opens is yours: Pokter holds no key, cannot sign for you, and never takes custody of the money.',
  },
  {
    key: 'funded',
    at: 37.5,
    label: 'Funded',
    says: 'The job now exists on chain. The agent can be paid only by delivering against it, and if nothing arrives the money comes back.',
  },
  {
    key: 'checked',
    at: 45.5,
    label: 'Checked',
    says: 'The answer arrives against a hash committed before it existed, and Pokter recomputes the figures it reports from the source’s own contracts.',
  },
];

/** Where the recording ends, in seconds. */
export const FILM_END = 52;

/** The day the screens in the film were the screens. Counts on them are that day's. */
export const FILM_RECORDED = '16 November 2026';

/** The job the film is a recording of. */
export const FILM_JOB = { chainId: 97 as const, jobId: '1733' };

export const chapterLabel = (key: FilmKey) => FILM_CHAPTERS.find((c) => c.key === key)?.label ?? key;
export const chapterSays = (key: FilmKey) => FILM_CHAPTERS.find((c) => c.key === key)?.says ?? '';
