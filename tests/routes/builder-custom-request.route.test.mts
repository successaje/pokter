import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const dir = mkdtempSync(join(tmpdir(), 'pokter-builder-request-'));
process.env.NOTIFICATION_DB_PATH = join(dir, 'notifications.db');

test('a custom request appears once in the addressed builder inbox', async () => {
  const { builderNotifications, notifyBuilderCustomRequest } = await import('../../src/lib/notifications/server');
  const owner = '0x00000000000000000000000000000000000000bb';
  const requestId = '11111111-1111-4111-8111-111111111111';
  const event = { owner, requestId, chainId: 97, title: 'Review my lending risk' };
  await notifyBuilderCustomRequest(event);
  await notifyBuilderCustomRequest(event);
  const inbox = builderNotifications(owner);
  assert.equal(inbox.length, 1);
  assert.equal(inbox[0].event, 'CUSTOM_REQUEST');
  assert.equal(inbox[0].jobId, requestId);
  assert.equal(builderNotifications('0x00000000000000000000000000000000000000cc').length, 0);
});
