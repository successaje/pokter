import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { imageFromAgentUri, safeImageUrl } from '../src/lib/registry/image';

function dataUri(file: unknown): string {
  return `data:application/json;base64,${Buffer.from(JSON.stringify(file)).toString('base64')}`;
}

test('reads the image a publisher registered', () => {
  /* The real record for 97/2599, whose indexer media URL answers 404. */
  const uri = dataUri({ name: 'Pokter Evidence', image: 'https://pokter.xyz/agents/pokter-evidence.svg' });
  assert.equal(imageFromAgentUri(uri), 'https://pokter.xyz/agents/pokter-evidence.svg');
});

test('accepts a percent-encoded registration file', () => {
  const file = { image: 'https://example.com/a.png' };
  assert.equal(
    imageFromAgentUri(`data:application/json,${encodeURIComponent(JSON.stringify(file))}`),
    'https://example.com/a.png',
  );
});

test('an agent with no image is not an error', () => {
  assert.equal(imageFromAgentUri(dataUri({ name: 'No picture' })), null);
});

test('refuses anything that is not plain https', () => {
  for (const bad of [
    'http://example.com/a.png',
    'javascript:alert(1)',
    'data:image/svg+xml,<svg/>',
    'https://user:pass@example.com/a.png',
    'not a url',
    '',
  ]) {
    assert.equal(safeImageUrl(bad), null, bad);
  }
});

test('an external profile URL is not followed', () => {
  assert.equal(imageFromAgentUri('https://example.com/agent.json'), null);
});

test('malformed records fail closed', () => {
  assert.equal(imageFromAgentUri('data:application/json;base64,not-base64-json'), null);
  assert.equal(imageFromAgentUri('data:application/json;base64'), null);
  assert.equal(imageFromAgentUri(dataUri(['an', 'array'])), null);
  assert.equal(imageFromAgentUri(dataUri({ image: 42 })), null);
});
