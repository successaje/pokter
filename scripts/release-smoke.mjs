#!/usr/bin/env node
/**
 * The deploy workflow's production checks, against any origin: run it on a
 * local production build before merging, and on https://pokter.xyz after.
 * Read-only: every request is a GET, or an MCP initialize / tools/list that
 * contacts no agent and records nothing.
 *
 *   node scripts/release-smoke.mjs [origin]      (default https://pokter.xyz)
 *
 * Against a local origin, two production facts are stood in for and said so:
 * the kit is asked with the forwarded headers Fly's proxy sends (its links
 * follow them), and health may read "degraded" only because local disk is not
 * a persistent volume.
 */
const origin = (process.argv[2] ?? 'https://pokter.xyz').replace(/\/$/, '');
const local = /^https?:\/\/(localhost|127\.0\.0\.1)(:|$)/.test(origin);
const failures = [];
const ok = (name, pass, detail = '') => {
  console.log(`${pass ? '✔' : '✖'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!pass) failures.push(name);
};
const get = async (path, init) => {
  const response = await fetch(`${origin}${path}`, { redirect: 'follow', signal: AbortSignal.timeout(90_000), ...init });
  return { status: response.status, text: await response.text() };
};
const mcp = (path, body) => get(path, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' }, body: JSON.stringify(body) });

const health = JSON.parse((await get('/api/health')).text);
const onlyDisk = health.status === 'degraded' && health.storage?.writable && health.storage?.persistent === false && Object.values(health.storage?.stores ?? {}).every((store) => store.ok) && !health.serving?.saturated;
ok('health answers ok or saturated', ['ok', 'saturated'].includes(health.status) || (local && onlyDisk), local && onlyDisk ? 'degraded only for non-persistent local disk' : health.status);
for (const path of ['/', '/discover', '/agents', '/build', '/account']) ok(`${path} is 200`, (await get(path)).status === 200);

const init = await mcp('/api/mcp', { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'release-smoke', version: '1' } } });
ok('MCP initializes as the pokter server', init.text.includes('"serverInfo":{"name":"pokter"'));
const tools = await mcp('/api/mcp', { jsonrpc: '2.0', id: 2, method: 'tools/list' });
for (const tool of ['search_agents', 'get_agent', 'get_quote', 'hire_link', 'prepare_brief', 'prepare_hire', 'job_status', 'check_delivery', 'integration_kit']) ok(`MCP lists ${tool}`, tools.text.includes(`"name":"${tool}"`));
ok('get_quote takes preferred_currency', tools.text.includes('preferred_currency'));
ok('hire_link takes preferred_token', tools.text.includes('preferred_token'));
ok('provider MCP refuses without a token', (await mcp('/api/mcp/provider', { jsonrpc: '2.0', id: 1, method: 'initialize' })).status === 401);

const activity = JSON.parse((await get('/api/v1/activity')).text);
ok('activity has buyers, team wallets and a testnet breakdown', Boolean(activity.buyers && activity.teamWallets && activity.byChain?.some((c) => c.chainId === 97)));
ok('activity has a mainnet breakdown', Boolean(activity.byChain?.some((c) => c.chainId === 56)));
ok('activity publishes value per token on every chain', activity.byChain?.every((c) => c.activity?.valueByToken && Array.isArray(c.activity.valueByToken.indexed)));
ok('testnet Pokter job 1424 reads back', (await get('/api/jobs/1424?chain=97')).status === 200);
ok('mainnet non-Pokter job 56975 is refused', (await get('/api/jobs/56975?chain=56')).status === 404);
const hire = (await get('/hire/56/374107')).text;
ok('mainnet agent offers both networks', hire.includes('aria-label="Network"') && /role="radio"[^>]*>BNB Chain</.test(hire) && /role="radio"[^>]*>Testnet</.test(hire));

const robots = (await get('/robots.txt')).text;
const sitemap = (await get('/sitemap.xml')).text;
const home = (await get('/')).text;
ok('robots names the sitemap', robots.includes('Sitemap: https://pokter.xyz/sitemap.xml'));
ok('sitemap lists the home page', sitemap.includes('<loc>https://pokter.xyz</loc>'));
ok('home has a canonical link and JSON-LD', /rel="canonical" href="https:\/\/pokter\.xyz\/?"/.test(home) && home.includes('application/ld+json'));
ok('no localhost in robots or sitemap', !`${robots}\n${sitemap}`.includes('localhost'));
const kit = (await get('/api/v1/integration', local ? { headers: { 'x-forwarded-host': 'pokter.xyz', 'x-forwarded-proto': 'https' } } : undefined)).text;
ok('integration kit has preflight and the import link, and no local hosts', kit.includes('"preflight"') && kit.includes('https://pokter.xyz/build/import') && !/0\.0\.0\.0|localhost|127\.0\.0\.1/.test(kit));
ok('integration kit lists each escrow’s tokens with decimals', /"tokens":\[\{"address"/.test(kit) && kit.includes('"decimals"'));

console.log(failures.length ? `\n${failures.length} check(s) failed: ${failures.join('; ')}` : `\nAll checks passed against ${origin}.`);
process.exit(failures.length ? 1 : 0);
