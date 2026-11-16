import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import type { PinnedEndpoint } from '../../src/lib/proof/prober';
import { readHostedProfile } from '../../src/lib/registry/hosted-profile';

/*
 * The catalogue reads each agent's hosted registration profile from a URL
 * its registrant chose. It must never be sent to a private address, directly
 * or through a redirect, and it must still follow the redirects real profile
 * hosts use.
 */

const TIMEOUT = { timeoutMs: 2_000 };

test('the real guard refuses local and non-HTTPS addresses before any request', async () => {
  for (const url of ['https://127.0.0.1/profile.json', 'https://localhost/profile.json', 'https://[::1]/profile.json', 'http://example.com/profile.json', 'https://user:pass@example.com/p.json']) {
    assert.equal(await readHostedProfile(url, TIMEOUT), null, url);
  }
});

/*
 * A stand-in for `withPublicEndpoint`: it refuses `.internal` hosts the way
 * the real guard refuses a private address, and records every URL it was
 * asked to open, so a hop that skipped it would show.
 */
function hosts(pages: Record<string, () => Response>) {
  const checked: string[] = [];
  const fetched: string[] = [];
  const endpoint = async <T,>(url: string, work: (handle: PinnedEndpoint) => Promise<T>): Promise<T> => {
    checked.push(url);
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || parsed.hostname.endsWith('.internal')) throw new Error('Endpoint resolves to a private or reserved network');
    const handle: PinnedEndpoint = {
      url: parsed,
      fetch: async (init) => {
        assert.equal(init?.redirect, 'manual', 'redirects are followed by hand, never by fetch');
        fetched.push(url);
        const page = pages[url];
        return page ? page() : new Response('missing', { status: 404 });
      },
      close: async () => {},
    };
    return work(handle);
  };
  return { endpoint: endpoint as never, checked, fetched };
}

const json = (body: unknown) => () => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
const redirect = (location: string, status = 302) => () => new Response(null, { status, headers: { location } });

test('a profile is read, and a redirect is followed with every hop checked', async () => {
  const direct = hosts({ 'https://a.example/p.json': json({ image: 'https://a.example/i.png' }) });
  assert.deepEqual(await readHostedProfile('https://a.example/p.json', { ...TIMEOUT, endpoint: direct.endpoint }), { image: 'https://a.example/i.png' });

  const moved = hosts({
    'https://a.example/p.json': redirect('https://cdn.example/p.json', 301),
    'https://cdn.example/p.json': redirect('/v2/p.json', 307),
    'https://cdn.example/v2/p.json': json({ image: 'https://cdn.example/i.png' }),
  });
  assert.deepEqual(await readHostedProfile('https://a.example/p.json', { ...TIMEOUT, endpoint: moved.endpoint }), { image: 'https://cdn.example/i.png' });
  assert.deepEqual(moved.checked, ['https://a.example/p.json', 'https://cdn.example/p.json', 'https://cdn.example/v2/p.json'], 'each hop, a relative one included, went through the guard');
});

test('a redirect to a private or plain-HTTP address is refused, and never requested', async () => {
  for (const target of ['https://metadata.internal/latest/', 'http://a.example/p.json']) {
    const site = hosts({ 'https://a.example/p.json': redirect(target), [target]: json({ image: 'https://leak.example/i.png' }) });
    assert.equal(await readHostedProfile('https://a.example/p.json', { ...TIMEOUT, endpoint: site.endpoint }), null, target);
    assert.deepEqual(site.fetched, ['https://a.example/p.json'], `${target} was checked and refused, not fetched`);
  }
});

test('too many redirects, a redirect without a location, an error, a large or a non-JSON body: no profile', async () => {
  const loop = hosts({
    'https://a.example/1': redirect('https://a.example/2'),
    'https://a.example/2': redirect('https://a.example/3'),
    'https://a.example/3': redirect('https://a.example/4'),
    'https://a.example/4': redirect('https://a.example/5'),
    'https://a.example/5': json({ image: 'https://a.example/i.png' }),
  });
  assert.equal(await readHostedProfile('https://a.example/1', { ...TIMEOUT, endpoint: loop.endpoint }), null);
  assert.equal(loop.fetched.length, 4, 'the first request and three redirects, no more');

  const cases: Record<string, () => Response> = {
    'https://a.example/nowhere': () => new Response(null, { status: 302 }),
    'https://a.example/gone': () => new Response('{}', { status: 410 }),
    'https://a.example/large': () => new Response(JSON.stringify({ image: 'x', pad: 'x'.repeat(250_000) })),
    'https://a.example/html': () => new Response('<html>not a profile</html>'),
  };
  const site = hosts(cases);
  for (const url of Object.keys(cases)) {
    assert.equal(await readHostedProfile(url, { ...TIMEOUT, endpoint: site.endpoint }), null, url);
  }
});

test('the time limit covers the guard’s address lookup, not only the request', async () => {
  /* A guard stuck resolving the host, as a slow or failing DNS server leaves it. */
  const stuck = (async () => new Promise(() => {})) as never;
  const started = Date.now();
  assert.equal(await readHostedProfile('https://slow.example/p.json', { timeoutMs: 150, endpoint: stuck }), null);
  assert.ok(Date.now() - started < 1_000, `gave up after ${Date.now() - started}ms`);
});

test('the catalogue reads hosted profiles only through this reader', () => {
  /* A security property, not wording: no request leaves the image module except through the guard. */
  const image = readFileSync(new URL('../../src/lib/registry/image.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(image, /\bfetch\(/);
  assert.match(image, /await import\('\.\/hosted-profile'\)/);
});
