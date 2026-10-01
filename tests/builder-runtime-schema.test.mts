import assert from 'node:assert/strict';
import test from 'node:test';

import { GET } from '../src/app/schemas/starter-config-v1/route';

test('publishes the schema referenced by downloaded starter configurations', async () => {
  const response = GET();
  const schema = await response.json() as {
    $id: string;
    required: string[];
    properties: { protocol: { enum: string[] } };
  };

  assert.equal(response.status, 200);
  assert.equal(schema.$id, 'https://pokter.xyz/schemas/starter-config-v1');
  assert.deepEqual(schema.properties.protocol.enum, ['a2a', 'mcp']);
  assert.ok(schema.required.includes('behavior'));
});
