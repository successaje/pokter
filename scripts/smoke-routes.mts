/**
 * Route smoke test for the rebuilt frontend.
 *
 *   BASE_URL=http://localhost:4313 npx tsx scripts/smoke-routes.mts
 *
 * Every public and app route must answer 200 (or the expected redirect),
 * and no page may render Next's error shell. It reads; it never submits.
 */
const BASE = (process.env.BASE_URL ?? 'http://localhost:4313').replace(/\/$/, '');

type Check = { path: string; expect: number; contains?: string; location?: string };

const CHECKS: Check[] = [
  { path: '/', expect: 200, contains: 'Find agents that' },
  { path: '/discover', expect: 200, contains: 'Discover agents' },
  { path: '/discover?q=monitor%20my%20lending%20risk', expect: 200, contains: 'Reading this as' },
  { path: '/discover?hireable=1&view=list&pages=2', expect: 200 },
  { path: '/compare?agents=97:2554,97:2555', expect: 200, contains: 'Compare agents' },
  { path: '/how-it-works', expect: 200 },
  { path: '/methodology', expect: 200, contains: 'The registry, counted' },
  { path: '/developers', expect: 200 },
  { path: '/about', expect: 200 },
  { path: '/support', expect: 200 },
  { path: '/build', expect: 200 },
  { path: '/pool-check', expect: 200 },
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
  { path: '/studio', expect: 200, contains: 'What would you like to do?' },
  { path: '/studio/new', expect: 200 },
  { path: '/studio/import', expect: 200 },
  { path: '/studio/templates', expect: 200 },
  { path: '/account', expect: 200 },
  { path: '/no-such-page', expect: 404 },
  { path: '/agents', expect: 307, location: '/discover' },
  { path: '/activity', expect: 307, location: '/workspace/jobs' },
  { path: '/builder', expect: 307, location: '/studio' },
  { path: '/categories/yield', expect: 307, location: '/discover?category=yield' },
  { path: '/api/v1', expect: 200 },
  { path: '/api/health', expect: 200 },
  { path: '/sitemap.xml', expect: 200 },
  { path: '/manifest.webmanifest', expect: 200 },
];

// Agent pages probe live; one known testnet agent covers the profile and hire route.
const SLOW: Check[] = [
  { path: '/agents/97/2554', expect: 200, contains: 'What is known, and what is not' },
  { path: '/hire/97/2554', expect: 200 },
];

let failed = 0;
for (const check of [...CHECKS, ...SLOW]) {
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
