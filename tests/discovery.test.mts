import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import { apiEndpoints } from '../src/lib/api/endpoints';
import { GUIDES } from '../src/lib/guides/catalogue';

/*
 * What a crawler or a model finds first — the sitemap, llms.txt, the
 * developer page — names pages and endpoints that exist, and lists the
 * guides and tools from the modules that define them. A review found
 * /requests, /build/integration and /developers missing from them, and
 * the developer page's hand-kept endpoint list missing the receipts.
 */

const root = new URL('../src/app/', import.meta.url).pathname;
const source = (path: string) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');

/* Every URL the app serves, as patterns: route groups dropped, [param] matching one segment. */
function routes(dir = root, prefix: string[] = []): RegExp[] {
  const found: RegExp[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name.startsWith('@')) continue;
      const segment = /^\(.*\)$/.test(name) ? [] : [name.startsWith('[') ? '[^/]+' : name.replace(/\./g, '\\.')];
      found.push(...routes(full, [...prefix, ...segment]));
    } else if (/^(page|route)\.tsx?$/.test(name) || name === 'sitemap.ts') {
      found.push(new RegExp(`^/${prefix.join('/')}$`.replace('^//', '^/')));
    }
  }
  return found;
}
const served = routes();
const exists = (path: string) => served.some((r) => r.test(path.replace(/\{[^}]+\}/g, 'x').replace(/\/$/, '') || '/'));

test('every page the sitemap lists exists', () => {
  const text = source('app/sitemap.ts');
  const paths = [...text.matchAll(/\{ path: '([^']*)'/g)].map((m) => m[1] || '/');
  assert.ok(paths.length > 20);
  assert.ok(!exists('/not-a-page') && !exists('/api/v1/nothing'), 'the check can fail');
  for (const path of paths) assert.ok(exists(path), `${path} is served`);
  for (const path of ['/guides', '/requests', '/build/integration', '/developers', '/mcp', '/connect']) assert.ok(paths.includes(path), `${path} is listed`);
  assert.match(text, /\.\.\.GUIDES\.map\(\(g\) => \(\{ path: g\.href, priority: 0\.9 \}\)\)/, 'every guide, from the one list');
  assert.match(text, /url: `\$\{base\}\/requests\/\$\{brief\.id\}`/, 'and each request still taking proposals');
});

test('every link in llms.txt is a page or endpoint that exists, and the guides and tools come from their modules', () => {
  const text = source('app/llms.txt/route.ts');
  /* Literal links; the guides' own line is a template over GUIDES, checked below. */
  const links = [...text.matchAll(/\]\(\$\{(base|api)\}([^)]*)\)/g)].filter((m) => !m[2].includes('${')).map((m) => (m[1] === 'api' ? `/api/v1${m[2]}` : m[2]) || '/');
  assert.ok(links.length > 10);
  for (const path of links) assert.ok(exists(path), `${path} is served`);
  for (const path of ['/requests', '/developers', '/api/v1/requests']) assert.ok(links.includes(path), `${path} is linked`);
  assert.match(text, /\$\{GUIDES\.map\(\(g\) => `- \[\$\{g\.title\}\]\(\$\{base\}\$\{g\.href\}\): \$\{g\.summary\}`\)/);
  assert.match(text, /\$\{MCP_TOOL_SUMMARIES\.map\(/);
  for (const g of GUIDES) assert.ok(exists(g.href), `${g.href} is served`);
});

test('every endpoint the API index and the developer page describe has a route, and both read one list', () => {
  for (const endpoint of apiEndpoints('v1')) assert.ok(exists(endpoint.path), `${endpoint.path} is served`);
  assert.ok(apiEndpoints('v1').some((e) => e.path === '/api/v1/receipts'), 'the receipts endpoint the page had dropped');
  /* And the other way round: every v1 route is described, so a new one cannot ship undocumented. */
  const documented = new Set(['/api/v1', ...apiEndpoints('v1').map((e) => e.path.replace(/\{[^}]+\}/g, '[x]'))]);
  const v1 = new URL('../src/app/api/v1/', import.meta.url).pathname;
  const walk = (dir: string, at: string): string[] =>
    readdirSync(dir).flatMap((name) => (statSync(join(dir, name)).isDirectory() ? walk(join(dir, name), `${at}/${name.startsWith('[') ? '[x]' : name}`) : name === 'route.ts' ? [at] : []));
  for (const route of walk(v1, '/api/v1')) assert.ok(documented.has(route), `${route} is described in apiEndpoints`);
  assert.match(source('app/api/v1/route.ts'), /endpoints: apiEndpoints\(API_VERSION\),/);
  const developers = source('app/(site)/developers/page.tsx');
  assert.match(developers, /\.\.\.apiEndpoints\(API_VERSION\)\.map\(/);
  assert.match(developers, /GUIDES\.map\(/, 'and it points newcomers at the guides');
});

test('crawlers may read every page, and the API stays out of the crawl', () => {
  const robots = source('app/robots.ts');
  assert.match(robots, /allow: '\/'/);
  assert.match(robots, /disallow: \['\/api\/'/, 'the API is for callers, not for indexing');
});
