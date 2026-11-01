/*
 * The one preload the test server is given. Next re-reads NODE_OPTIONS for
 * the server process it starts and keeps a single value per flag
 * (formatNodeOptions in next/dist/server/lib/utils.js), so two `--import`s
 * given separately left one of them out: with the network first, the moved
 * clock was dropped; with the clock first, every request reached the real
 * network. Loaded from here, both always run.
 *
 * The clock first, so the network preload can date what it records by the
 * real clock, which server-clock.mjs hands on.
 */
await import('./server-clock.mjs');
await import('./server-network.mjs');
