import assert from 'node:assert/strict';
import test from 'node:test';
import { Script } from 'node:vm';

import { EVALUATOR_STARTER_FILENAME, EVALUATOR_STARTER_SOURCE } from '../src/lib/evaluators/starter';
import { evaluatorStarterResponse } from '../src/lib/evaluators/starter-response';
import { isScorableAttestationBody, normaliseValue } from '../src/lib/proof/attestation';

function executableStarter() {
  return EVALUATOR_STARTER_SOURCE
    .replace(/^#![^\n]*\n/, '')
    .replace("import { writeFile } from 'node:fs/promises';", '');
}

test('the evaluator starter is valid JavaScript with no install step', () => {
  assert.doesNotThrow(() => new Script(`(async () => { ${executableStarter()} })()`));
  assert.equal(EVALUATOR_STARTER_SOURCE.includes("from 'viem'"), false);
  assert.equal(EVALUATOR_STARTER_SOURCE.includes('privateKey'), false);
  assert.match(EVALUATOR_STARTER_SOURCE, /--agent 372022 \\\\\n    --endpoint/);
});

test('the generated starter produces a schema-valid 100% receipt from valid A2A handshakes', async () => {
  let written = '';
  const execution = new Script(`(async () => { ${executableStarter()} })()`);
  await execution.runInNewContext({
    AbortSignal,
    Buffer,
    Date,
    Number,
    Response,
    TextDecoder,
    URL,
    fetch: async () => new Response(JSON.stringify({ name: 'Measured agent', url: 'https://agent.example/a2a', protocolVersion: '0.3.0', skills: [] }), {
      headers: { 'content-type': 'application/json' },
    }),
    process: {
      argv: ['node', 'starter.mjs', '--chain', '56', '--agent', '372022', '--endpoint', 'https://agent.example/card', '--protocol', 'a2a', '--samples', '2', '--vantage', 'Test runner'],
      exit: () => { throw new Error('Unexpected exit'); },
    },
    setTimeout,
    console: { log: () => {} },
    writeFile: async (_path: string, value: string) => { written = value; },
  });

  const output = JSON.parse(written) as { attestation: Parameters<typeof isScorableAttestationBody>[0]; publication: { args: unknown[] } };
  assert.equal(isScorableAttestationBody(output.attestation), true);
  assert.equal(normaliseValue(output.attestation?.value, output.attestation?.valueDecimals), 1);
  assert.equal(output.publication.args.length, 8);
});

test('the starter prepares the exact feedback call but cannot broadcast it', () => {
  assert.match(EVALUATOR_STARTER_SOURCE, /giveFeedback\(uint256,int128,uint8,string,string,string,string,bytes32\)/);
  assert.match(EVALUATOR_STARTER_SOURCE, /No transaction was signed or broadcast/);
  assert.equal(EVALUATOR_STARTER_SOURCE.includes('sendTransaction'), false);
  assert.equal(EVALUATOR_STARTER_SOURCE.includes('eth_send'), false);
});

test('the starter measures protocol validity and publishes its limitations', () => {
  assert.match(EVALUATOR_STARTER_SOURCE, /protocolVersion/);
  assert.match(EVALUATOR_STARTER_SOURCE, /tools\/list/);
  assert.match(EVALUATOR_STARTER_SOURCE, /text\/event-stream/);
  assert.match(EVALUATOR_STARTER_SOURCE, /Response is larger than 256 KiB/);
  assert.match(EVALUATOR_STARTER_SOURCE, /not task correctness/);
  assert.match(EVALUATOR_STARTER_SOURCE, /--samples', 2, 1000/);
});

test('the download route returns a named JavaScript attachment', async () => {
  const response = evaluatorStarterResponse();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-disposition'), `attachment; filename="${EVALUATOR_STARTER_FILENAME}"`);
  assert.match(response.headers.get('content-type') ?? '', /^text\/javascript/);
  assert.equal(await response.text(), EVALUATOR_STARTER_SOURCE);
});
