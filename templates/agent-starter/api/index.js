import { createHash, randomUUID } from 'node:crypto';
import { privateKeyToAccount } from 'viem/accounts';

/*
 * A minimal ERC-8004 agent that Pokter can measure, quote and hire.
 *
 * One file on purpose. Everything here exists because a published check
 * requires it, and nothing here is specific to Pokter — the same endpoint
 * works for any marketplace reading the same standards.
 *
 * Two routes on one URL:
 *   GET   → the A2A agent card, which is what a prober fetches
 *   POST  → JSON-RPC message/send, which is how a buyer asks for a price
 *
 * The one thing you must get right is AGENT_PRIVATE_KEY: it has to be the
 * wallet recorded in your ERC-8004 registration. A price signed by any other
 * key is discarded, because otherwise a price is just a number served by
 * whoever answers the socket.
 */

const PRICE_U = process.env.AGENT_PRICE_U ?? '0.10';
const CURRENCY =
  process.env.AGENT_PAYMENT_TOKEN ??
  '0xcE24439F2D9C6a2289F741120FE202248B666666'; // $U on BNB Chain
const NAME = process.env.AGENT_NAME ?? 'My BNB Agent';
const DESCRIPTION =
  process.env.AGENT_DESCRIPTION ??
  'Reports on a BNB Chain position. Read-only: it executes nothing and moves no funds.';

/** Raw 18-decimal units, which is what the quote must be denominated in. */
function priceRaw() {
  const [whole, fraction = ''] = String(PRICE_U).split('.');
  return (
    BigInt(whole || '0') * 10n ** 18n +
    BigInt((fraction + '0'.repeat(18)).slice(0, 18))
  ).toString();
}

function account() {
  const key = process.env.AGENT_PRIVATE_KEY;
  if (!key) throw new Error('AGENT_PRIVATE_KEY is not set.');
  return privateKeyToAccount(key.startsWith('0x') ? key : `0x${key}`);
}

function publicUrl(req) {
  if (process.env.AGENT_PUBLIC_URL) return process.env.AGENT_PUBLIC_URL;
  const host = req.headers['x-forwarded-host'] ?? req.headers.host;
  const proto = req.headers['x-forwarded-proto'] ?? 'https';
  return `${proto}://${host}`;
}

/*
 * The card. `name`, `url`, `protocolVersion` and `skills` are all required —
 * a probe that finds JSON without them records the endpoint as answering but
 * not as a valid A2A response, which reads worse than being offline.
 */
function card(req) {
  return {
    name: NAME,
    description: DESCRIPTION,
    url: publicUrl(req),
    version: '1.0.0',
    protocolVersion: '0.3.0',
    capabilities: { streaming: false, pushNotifications: false },
    defaultInputModes: ['application/json'],
    defaultOutputModes: ['application/json'],
    skills: [
      {
        id: 'negotiate',
        name: 'Negotiate an ERC-8183 job',
        description: 'Returns a wallet-signed price for the standard deliverable.',
        tags: ['erc8183', 'pricing'],
      },
      {
        id: 'report',
        name: 'Produce the deliverable',
        description: 'Returns the read-only assessment this agent sells.',
        tags: ['analysis'],
      },
    ],
  };
}

/*
 * The quote. The hash is over the terms being agreed, so the signature
 * commits to a specific price rather than to the idea of having one, and it
 * is signed as a plain message (EIP-191) over the 32 raw bytes.
 */
async function negotiate() {
  const signer = account();
  const terms = {
    price: priceRaw(),
    currency: CURRENCY,
    chain_id: 56,
  };
  const quoteExpiresAt = new Date(Date.now() + 10 * 60_000).toISOString();
  const hash =
    '0x' +
    createHash('sha256')
      .update(JSON.stringify({ ...terms, quote_expires_at: quoteExpiresAt }))
      .digest('hex');

  return {
    negotiation_hash: hash,
    provider_sig: await signer.signMessage({ message: { raw: hash } }),
    response: {
      terms,
      quote_expires_at: quoteExpiresAt,
      provider: signer.address,
    },
  };
}

/** Replace this with whatever your agent actually does. */
async function report() {
  return {
    response: {
      summary: 'Replace this with your agent\'s real output.',
      assumptions: ['This starter returns a fixed example.'],
      sources: [],
      generated_at: new Date().toISOString(),
    },
  };
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {};
}

export default async function handler(req, res) {
  res.setHeader('content-type', 'application/json');
  res.setHeader('cache-control', 'no-store');

  if (req.method === 'GET') {
    res.statusCode = 200;
    res.end(JSON.stringify(card(req)));
    return;
  }

  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.end(JSON.stringify({ error: 'Use GET for the card, POST for a task.' }));
    return;
  }

  let body;
  try {
    body = await readBody(req);
  } catch {
    res.statusCode = 400;
    res.end(JSON.stringify({ error: 'Expected a JSON body.' }));
    return;
  }

  const parts = body?.params?.message?.parts ?? [];
  const data = parts.map((part) => part?.data).find(Boolean) ?? {};
  const skill = data.skill ?? 'report';

  try {
    const result = skill === 'negotiate' ? await negotiate() : await report();
    res.statusCode = 200;
    /*
     * The envelope matters as much as the payload: a caller reads the first
     * `parts[].data` it finds under `result`, so burying the answer anywhere
     * else makes a working agent look like a broken one.
     */
    res.end(
      JSON.stringify({
        jsonrpc: '2.0',
        id: body.id ?? randomUUID(),
        result: {
          messageId: randomUUID(),
          role: 'agent',
          parts: [{ kind: 'data', data: result }],
        },
      }),
    );
  } catch (error) {
    res.statusCode = 500;
    res.end(JSON.stringify({ error: String(error?.message ?? error) }));
  }
}
