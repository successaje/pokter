/** An agent is tested at most this often, so a busy hire page cannot become a flood of briefs to someone else's server. */
export const PROBE_RETRY_MS = 6 * 3_600_000;

/**
 * The relay test's brief: the category's own check brief where Pokter has
 * one, otherwise a plain question any working agent can answer. Any real
 * answer shows the relay can reach it; a price instead of work, or nothing,
 * shows it cannot.
 */
export const GENERIC_RELAY_BRIEF = {
  text: 'Pokter relay test, sent once so a buyer is never the first to find out. In one or two sentences: what do you deliver, and what must a buyer’s brief include? Read-only: execute no transaction.',
  data: { purpose: 'relay-test' },
};
