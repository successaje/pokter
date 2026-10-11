import assert from 'node:assert/strict';
import test from 'node:test';

import { answerFromManifest, previewOf } from '../src/lib/notifications/answer';

const manifest = (content: string) => JSON.stringify({ version: 1, job_id: 1, response: { content, content_type: 'application/json' } });

test('a carried answer is taken from the agent’s own answer field', () => {
  const content = JSON.stringify({ title: 'Venus Yield Keeper: answer to your brief', answer: 'Net yield on vBNB is 2.1% after fees.', answered_by: { token_id: '2554' } });
  assert.equal(answerFromManifest(manifest(content)), 'Net yield on vBNB is 2.1% after fees.');
});

test('structured answers are shown as indented JSON, prose as it came', () => {
  assert.equal(answerFromManifest(manifest(JSON.stringify({ answer: { health_factor: 1.3 } }))), '{\n  "health_factor": 1.3\n}');
  assert.equal(answerFromManifest(manifest('Plain prose answer.')), 'Plain prose answer.');
  assert.equal(answerFromManifest(manifest('')), null);
});

test('a preview is one line and cut on a word', () => {
  assert.equal(previewOf('a  b\n\nc'), 'a b c');
  const long = 'word '.repeat(200);
  const p = previewOf(long, 30);
  assert.ok(p.endsWith('…') && p.length <= 31);
});
