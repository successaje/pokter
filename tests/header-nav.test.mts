import assert from 'node:assert/strict';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import { activeGroup, drawerGroups, NAV_GROUPS } from '../src/shell/nav';

/*
 * The header is how a newcomer finds the marketplace's pages. Requests have
 * their own menu, since buyers post there and builders find work there, and
 * every link leads to a page that exists.
 */

const site = new URL('../src/app/(site)', import.meta.url).pathname;

/* A route's folder: (group) segments are not part of the URL. */
function pageExists(dir: string, segments: string[]): boolean {
  const folders = readdirSync(dir).filter((name) => statSync(join(dir, name)).isDirectory());
  const groups = folders.filter((name) => /^\(.+\)$/.test(name));
  if (groups.some((group) => pageExists(join(dir, group), segments))) return true;
  if (segments.length === 0) return existsSync(join(dir, 'page.tsx'));
  const [head, ...rest] = segments;
  if (folders.includes(head) && pageExists(join(dir, head), rest)) return true;
  /* A [param] folder answers any one segment. */
  return folders.some((name) => /^\[[^.].*\]$/.test(name) && pageExists(join(dir, name), rest));
}

test('requests have their own menu: every request, posting one, and your own', () => {
  const requests = NAV_GROUPS.find((group) => group.label === 'Requests');
  assert.ok(requests, 'a Requests label in the bar');
  assert.equal(requests.href, '/requests');
  assert.deepEqual(requests.links.map((link) => link.href), ['/requests', '/requests/new', '/workspace/requests']);
});

test('services are reachable both to hire and to publish', () => {
  const hrefs = (label: string) => NAV_GROUPS.find((group) => group.label === label)?.links.map((link) => link.href) ?? [];
  assert.ok(hrefs('Discover').includes('/services'));
  assert.ok(hrefs('Build').includes('/build/services'));
});

test('a request page lights Requests, not Build', () => {
  assert.equal(activeGroup('/requests'), 'Requests');
  assert.equal(activeGroup('/requests/42'), 'Requests');
  assert.equal(activeGroup('/requests/new'), 'Requests');
  assert.equal(activeGroup('/workspace/requests'), 'Requests');
  assert.equal(activeGroup('/workspace/jobs'), 'Hire');
  assert.equal(activeGroup('/build/services'), 'Build');
});

test('every link in the header leads to a page', () => {
  const missing = NAV_GROUPS.flatMap((group) => [group.href, ...group.links.map((link) => link.href), ...(group.feature ? [group.feature.href] : [])])
    .filter((href) => !pageExists(site, href.split('/').filter(Boolean)));
  assert.deepEqual(missing, []);
});

test('every link says where it goes', () => {
  for (const group of NAV_GROUPS) {
    for (const link of group.links) assert.ok(link.description.length > 0 && link.description.length <= 60, `${group.label} › ${link.label}: ${link.description.length} characters`);
  }
});

test('the phone menu lists every group at once, so a shared link appears once', () => {
  const groups = drawerGroups();
  const seen = groups.flatMap((group) => group.links.map((link) => `${link.href} ${link.label}`));
  assert.equal(new Set(seen).size, seen.length, 'no link listed twice');
  const labels = (label: string) => groups.find((group) => group.label === label)?.links.map((link) => link.label) ?? [];
  assert.ok(labels('Requests').includes('Post a request'));
  assert.ok(!labels('Hire').includes('Post a request'), 'already listed under Requests, just above');
  assert.ok(labels('Build').includes('Find paid work'), 'the same page as All requests, for a different reader');
  assert.ok(!seen.some((link) => link.startsWith('/workspace ')), 'Your space below leads to the workspace');
  assert.ok(labels('Discover').includes('PokterBoard'), 'a feature card is a link on a phone');
});
