import assert from 'node:assert/strict';
import { test } from 'node:test';
import { marketplaceBotReply } from '../src/lib/telegram/marketplace-bot';

test('private start offers Scout actions', () => {
  const reply = marketplaceBotReply('/start', true);
  assert.ok(reply);
  assert.ok('keyboard' in reply.reply_markup);
  const labels = reply.reply_markup.keyboard.flat().map((button) => button.text);
  assert.deepEqual(labels, ['Find an agent', 'Check an agent', 'Explore services', 'Open requests', 'Help', 'Discord']);
  assert.match(reply.text, /Never send a seed phrase or private key/);
});

test('group chatter and commands addressed to another bot are ignored', () => {
  process.env.POKTER_TELEGRAM_BOT_USERNAME = 'PokterMarketplaceBot';
  assert.equal(marketplaceBotReply('Hello', false), null);
  assert.equal(marketplaceBotReply('/help@AnotherBot', false), null);
  assert.ok(marketplaceBotReply('/help@PokterMarketplaceBot', false));
  delete process.env.POKTER_TELEGRAM_BOT_USERNAME;
});

test('unknown commands are left for Scout without echoing text', () => {
  assert.equal(marketplaceBotReply('/strange private key', true), null);
  assert.equal(marketplaceBotReply('/constructor', true), null);
  assert.equal(marketplaceBotReply('grid trading on BNB', true), null);
});
