/**
 * Route smoke test for the rebuilt frontend.
 *
 *   BASE_URL=http://localhost:4313 npx tsx scripts/smoke-routes.mts
 *
 * Every public and app route must answer 200 (or the expected redirect),
 * and no page may render Next's error shell. It reads; it never submits.
 *
 * The redirects are read from next.config.ts rather than listed here. A
 * hand-kept copy went stale: it still expected Builder Studio at /studio
 * after the section moved to /build, /builder to land on /studio, and
 * /agents to redirect after it became a page of its own — six failures
 * against a production that was working exactly as configured.
 */
import type { NextConfig } from 'next';

import nextConfig from '../next.config.js';

const BASE = (process.env.BASE_URL ?? 'http://localhost:4313').replace(/\/$/, '');

type Check = { path: string; expect: number; contains?: string; location?: string };

const CHECKS: Check[] = [
  { path: '/', expect: 200, contains: 'These do' },
  { path: '/quest', expect: 200, contains: 'Your hires, across marketplaces' },
  { path: '/discover', expect: 200, contains: 'Discover agents' },
  { path: '/discover?q=monitor%20my%20lending%20risk', expect: 200, contains: 'Reading this as' },
  { path: '/discover?hireable=1&view=list&pages=2', expect: 200 },
  { path: '/compare?agents=97:2554,97:2555', expect: 200, contains: 'Compare agents' },
  { path: '/how-it-works', expect: 200 },
  { path: '/methodology', expect: 200, contains: 'The registry, counted' },
  { path: '/developers', expect: 200 },
  { path: '/about', expect: 200 },
  { path: '/support', expect: 200 },
  { path: '/build', expect: 200, contains: 'Building · Pokter' },
  { path: '/build/new', expect: 200 },
  { path: '/build/import', expect: 200 },
  { path: '/build/templates', expect: 200 },
  { path: '/build/integration', expect: 200, contains: 'Get your agent hired through Pokter' },
  { path: '/guides', expect: 200 },
  { path: '/guides/list-your-agent', expect: 200, contains: 'List your agent' },
  { path: '/guides/hire-an-agent', expect: 200, contains: 'Hire an agent' },
  { path: '/guides/find-jobs', expect: 200, contains: 'Find jobs for your agent' },
  { path: '/requests', expect: 200 },
  { path: '/jobs/56/57097', expect: 200, contains: 'Job evidence' },
  { path: '/jobs/56/1', expect: 404 },
  { path: '/agents', expect: 200, contains: 'All agents' },
  { path: '/pool-check', expect: 200 },
  { path: '/agent-advantage', expect: 200, contains: 'annualisation trap' },
  { path: '/set-and-earn', expect: 200 },
  { path: '/terms', expect: 200 },
  { path: '/privacy', expect: 200 },
  { path: '/risk', expect: 200 },
  { path: '/workspace', expect: 200 },
  { path: '/workspace/jobs', expect: 200 },
  { path: '/workspace/jobs/1352', expect: 200 },
  { path: '/workspace/agents', expect: 200 },
  { path: '/workspace/inbox', expect: 200 },
  { path: '/workspace/saved', expect: 200 },
  { path: '/workspace/wallet', expect: 200 },
  { path: '/account', expect: 200 },
  { path: '/no-such-page', expect: 404 },
  { path: '/api/v1', expect: 200 },
  { path: '/api/v1/requests', expect: 200 },
  { path: '/llms.txt', expect: 200, contains: '## Start here' },
  { path: '/api/health', expect: 200 },
  { path: '/sitemap.xml', expect: 200 },
  { path: '/manifest.webmanifest', expect: 200 },
];

/*
 * Every address the previous frontend published, as next.config.ts moves it:
 * a sample value for each parameter, and the destination it must land on.
 * `permanent: false` is a 307.
 */
const SAMPLE: Record<string, string> = { category: 'yield', id: 'example', path: 'new' };
const fill = (pattern: string) => pattern.replace(/:(\w+)\*?/g, (_, name: string) => SAMPLE[name] ?? 'example');
/* Under tsx the config arrives as CommonJS, one `default` deeper; unwrapped either way. */
const loaded = nextConfig as unknown as NextConfig & { default?: NextConfig };
const config: NextConfig = loaded.default ?? loaded;
const REDIRECTS: Check[] = ((await config.redirects?.()) ?? []).map((r) => ({
  path: fill(r.source),
  expect: 'permanent' in r && r.permanent ? 308 : 307,
  location: fill(r.destination),
}));
/* An empty list would pass by checking nothing, which is how a stale copy hides. */
if (REDIRECTS.length === 0) {
  console.log('FAIL no redirects were read from next.config.ts');
  process.exit(1);
}

// Agent pages probe live; one known testnet agent covers the profile and hire route.
const SLOW: Check[] = [
  { path: '/agents/97/2554', expect: 200, contains: 'What is known, and what is not' },
  { path: '/hire/97/2554', expect: 200 },
  // An agent that signs its price in mainnet $U. Whether it offers both ways
  // to hire depends on the deployment's escrow chains, which the deploy
  // workflow checks; here it only has to render.
  { path: '/hire/56/269223', expect: 200 },
];

let failed = 0;
for (const check of [...CHECKS, ...REDIRECTS, ...SLOW]) {
  const started = Date.now();
  try {
    const res = await fetch(BASE + check.path, { redirect: 'manual', signal: AbortSignal.timeout(90_000) });
    const body = res.status === 200 ? await res.text() : '';
    const problems: string[] = [];
    if (res.status !== check.expect) problems.push(`status ${res.status}, expected ${check.expect}`);
    if (check.contains && !body.replace(/<!-- -->/g, '').includes(check.contains)) problems.push(`missing "${check.contains}"`);
    if (check.location && !(res.headers.get('location') ?? '').endsWith(check.location)) problems.push(`redirects to ${res.headers.get('location')}`);
    if (/Application error|Internal Server Error/.test(body)) problems.push('error shell rendered');
    const ms = Date.now() - started;
    if (problems.length) {
      failed += 1;
      console.log(`FAIL ${check.path} (${ms} ms): ${problems.join('; ')}`);
    } else {
      console.log(`ok   ${check.path} (${ms} ms)`);
    }
  } catch (error) {
    failed += 1;
    console.log(`FAIL ${check.path}: ${(error as Error).message}`);
  }
}
console.log(failed ? `\n${failed} route(s) failed` : '\nall routes ok');
process.exit(failed ? 1 : 0);
