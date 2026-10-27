import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const code = (path: string) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');

test('Developers starts from the three errands, and the changelog is the last section, not the second', () => {
  const page = code('app/(site)/developers/page.tsx');
  for (const title of ['Use the API', 'Connect an assistant', 'List an agent']) assert.match(page, new RegExp(`title: '${title}'`));
  assert.match(page, /<nav aria-label="Start here"/);
  const at = (id: string) => page.indexOf(`<DocSection id="${id}"`);
  for (const id of ['api', 'mcp', 'query', 'protocols', 'contracts', 'studio']) assert.ok(at(id) < at('api-changes'), `${id} comes before the changelog`);
  const toc = page.slice(page.indexOf('toc={['), page.indexOf(']}', page.indexOf('toc={[')));
  assert.ok(toc.trim().endsWith("{ id: 'api-changes', label: 'API changes' },"), 'and last in the contents');
});

test('the homepage scopes the passkey gas top-up the way the connect sheet does', () => {
  const home = code('app/(site)/page.tsx');
  assert.doesNotMatch(home, /Pokter covers the network fee where it can/);
  assert.match(home, /Passkey wallets need no extension and hire on testnet, where Pokter tops up their network fee if they run short\./);
});
