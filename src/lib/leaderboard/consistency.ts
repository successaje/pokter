/**
 * Whether two visitors are served the same standings, and why.
 *
 * This is not a design property of the page, and saying so plainly is the
 * point. The standings are computed from two SQLite databases on one Fly
 * volume — `JOB_DB_PATH = '/data/jobs.db'` and `PROBE_DB_PATH =
 * '/data/probes.db'` in `fly.toml`'s `[env]` — and that volume is attached to
 * one machine. They are identical for every visitor because there is exactly
 * one machine answering, not because anything in the code makes them so.
 *
 * Verified rather than assumed, on 23 October 2026: `fly machines list`
 * returned one machine (`837ee3c7756628`, started, 1/1 checks) and
 * `fly volumes list` one volume (`pokter_data`, attached to that machine).
 * `fly.toml` holds `min_machines_running = 1`, `auto_stop_machines = 'off'`
 * and a single `[mounts]`, and the deploy workflow's concurrency group keeps
 * two rollouts off it.
 *
 * The limitation is therefore conditional and exact: scale past one machine
 * and each gets its own volume, each indexes the jobs its own visitors
 * funded — `indexFundedJob` writes from the browser that funded the hire —
 * and two visitors would see two different boards. POK-007 records the same
 * constraint for rate limiting and left it open for the same reason.
 *
 * There is no chain-only alternative that would remove the dependency. The
 * AgenticCommerce kernel does not carry the agent token id, so attributing a
 * settlement to an ERC-8004 identity needs Pokter's own job envelope and
 * index; a board derived from chain state alone could count settlements and
 * could not say whose they were.
 *
 * `tests/leaderboard-consistency.test.mts` pins each premise against
 * `fly.toml`, so scaling out fails the suite instead of quietly making this
 * paragraph untrue.
 */
export interface ServingTopology {
  /** `min_machines_running`, or null when the key is absent. */
  minMachinesRunning: number | null;
  /** `auto_stop_machines`, unquoted, or null when absent. */
  autoStopMachines: string | null;
  /** How many `[[mounts]]` / `[mounts]` blocks the config declares. */
  mounts: number;
}

/**
 * Read the three keys that decide whether one machine serves every request.
 *
 * Deliberately a parser over the file's text rather than a TOML dependency:
 * the premise is checked in a test, the file is small and stable, and adding
 * a parser to assert three keys would be the larger change.
 */
export function parseServingTopology(flyToml: string): ServingTopology {
  const min = /^\s*min_machines_running\s*=\s*(\d+)\s*$/m.exec(flyToml);
  const stop = /^\s*auto_stop_machines\s*=\s*'([^']*)'\s*$/m.exec(flyToml);
  return {
    minMachinesRunning: min ? Number(min[1]) : null,
    autoStopMachines: stop ? stop[1] : null,
    mounts: (flyToml.match(/^\s*\[\[?mounts\]\]?\s*$/gm) ?? []).length,
  };
}

/**
 * Whether the configuration describes a single serving instance.
 *
 * One mount is the binding constraint: Fly will not attach one volume to two
 * machines, so a second machine needs a second volume and a second index.
 * `min_machines_running = 1` with stopping off is what keeps that one machine
 * up rather than resumed on demand.
 */
export function servesFromOneInstance(topology: ServingTopology): boolean {
  return (
    topology.mounts === 1 &&
    topology.minMachinesRunning === 1 &&
    topology.autoStopMachines === 'off'
  );
}

/**
 * Whether this deployment serves every request from one instance.
 *
 * A constant checked by a test, not a file read at runtime. `fly.toml` is
 * not part of the standalone runtime image, so reading it on a render would
 * throw in production and fall back to the weaker claim — telling visitors
 * standings may diverge when they do not. Failing in the honest direction
 * here means pinning the premise where it can actually be checked:
 * `tests/leaderboard-consistency.test.mts` reads the real `fly.toml` and
 * fails if it stops agreeing with this value, so scaling out breaks the
 * suite rather than quietly making the page's wording untrue.
 */
export const SERVES_FROM_ONE_INSTANCE = true;

/**
 * What the page says about consistency, in both directions.
 *
 * Kept here so the page cannot drift from what the test checks, and so the
 * claim changes in one place if the deployment ever stops matching it.
 */
export const CONSISTENT_STANDINGS =
  'Every visitor is served the same standings. They are computed from the job index and probe history on one mounted volume, attached to the single machine that serves this site — verified against the running app, not assumed. This rests on the deployment running one machine, not on anything in the page: a second machine would carry its own index and could show different standings.';

export const DIVERGENT_STANDINGS =
  'Standings may differ between visitors. The job index and probe history are SQLite databases on a per-machine volume, and this deployment is no longer configured to run a single machine, so two visitors can be answered by two indexes.';
