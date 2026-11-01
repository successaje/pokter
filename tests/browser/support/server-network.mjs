/*
 * The test server's network: every request it makes to another host is
 * answered from committed fixtures, so a browser test never depends on the
 * registry indexer, a BNB Chain node or an agent being up, and never
 * reaches them. Loaded with `node --import` into every test server process
 * (playwright.config.ts); nothing in the app reads these variables.
 *
 * Two modes, from POKTER_TEST_NETWORK:
 * - replay (the default): answered from tests/browser/fixtures/network only.
 *   Anything without a fixture fails as an unreachable host would, and is
 *   logged as `[test-network] refused <method> <url>`.
 * - record: a request with a fixture is still answered from it, so a run
 *   sees one consistent world (a block number read once stays the block
 *   number). A request without one goes to the real host and is saved, but
 *   only to the indexer and BNB Chain nodes, read-only. Everything else is
 *   refused exactly as in replay, so recording can never reach an outside
 *   agent, send a transaction or post anything. To refresh a fixture,
 *   delete it and record again.
 *
 * What is intercepted: global fetch (Next wraps it after this runs, so its
 * cache sits in front of this), the undici global dispatcher, node:http and
 * node:https, and DNS lookups (dns.lookup, dns.promises.lookup), all for
 * any host that is not this machine. The last three are sent through a
 * local socket to the same fixtures. Not intercepted: raw net or tls
 * sockets, and dns.resolve*; nothing in the app uses them.
 *
 * A fixture holds the method, the URL with its secrets removed, a hash of
 * the request body, and the response's status, content type and body.
 * Never a request header: the indexer's API key travels in one. JSON-RPC is
 * kept per call, without its id, so a batch made differently on another
 * run is still answered.
 *
 * Two answers are not fixtures:
 * - Pokter's house agents (https://pokter.xyz/house/..., /api/house/...)
 *   are this app's own routes, so they are answered by the test server
 *   itself, which signs with the test key it was handed.
 * - TEST_AGENT (support/test-agent.mjs): the registry and the indexer name
 *   the test key's address as Brinkwatch's testnet agent wallet, so a quote
 *   the test key signs passes the real quote route.
 */
import { createHash } from 'node:crypto';
import dns from 'node:dns';
import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import { createRequire, syncBuiltinESMExports } from 'node:module';
import { isIP } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';

import { encodeAbiParameters, toFunctionSelector } from 'viem';

import { TEST_AGENT } from './test-agent.mjs';

const require = createRequire(import.meta.url);
/* Captured before support/server-clock.mjs can move it: fixtures record when they were really made. */
const RealDate = globalThis.Date;
const undici = require('undici');

const MODE = process.env.POKTER_TEST_NETWORK === 'record' ? 'record' : 'replay';
const FIXTURES = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../fixtures/network');
const SERVER_PORT = Number(process.env.POKTER_TEST_PORT ?? 0);
const VERBOSE = process.env.POKTER_TEST_NETWORK_LOG === 'verbose';

/* ── Which hosts are which ─────────────────────────────────────────── */

const LOCAL = new Set(['localhost', '127.0.0.1', '::1', '[::1]', '0.0.0.0']);
const isLocal = (hostname) => LOCAL.has(hostname) || hostname.endsWith('.localhost');

/* Pokter itself: its house agents are this app's own routes. */
const POKTER = /^(www\.)?pokter\.xyz$/;
const HOUSE_PATH = /^\/(api\/)?house\//;

/* Recording may reach these, and only these. */
const INDEXER = /(^|\.)8004scan\.io$/;
const CHAIN_NODES = /(^|\.)(publicnode\.com|bnbchain\.org|binance\.org|defibit\.io|ninicoin\.io|nodereal\.io)$/;
const READ_METHODS = new Set([
  'eth_chainId', 'net_version', 'eth_blockNumber', 'eth_call', 'eth_estimateGas', 'eth_gasPrice', 'eth_maxPriorityFeePerGas', 'eth_feeHistory',
  'eth_getBalance', 'eth_getCode', 'eth_getStorageAt', 'eth_getTransactionCount', 'eth_getBlockByNumber', 'eth_getBlockByHash',
  'eth_getLogs', 'eth_getTransactionByHash', 'eth_getTransactionReceipt',
]);

function mayRecord(url, method, calls) {
  if (MODE !== 'record') return false;
  if (INDEXER.test(url.hostname)) return method === 'GET' || method === 'HEAD';
  if (CHAIN_NODES.test(url.hostname)) return method === 'POST' && calls !== null && calls.every((call) => READ_METHODS.has(call.method));
  return false;
}
/* DNS for the hosts recording may reach, and for Pokter, whose house agents are checked as public endpoints before they are called. */
const mayResolve = (hostname) => MODE === 'record' && (INDEXER.test(hostname) || CHAIN_NODES.test(hostname) || POKTER.test(hostname));

/* ── Secrets never reach a fixture ─────────────────────────────────── */

/* Query parameters that carry a credential: api_key, apiKey, access_token, secret, password, auth, signature, sig, session... */
const SECRET_PARAM = /(key|token|secret|password|passwd|auth|authorization|signature|credentials?)$|^(sig|session|code)$/i;
const SECRET_VALUES = Object.entries(process.env)
  .filter(([name, value]) => /KEY|TOKEN|SECRET|PASSW|PRIVATE/i.test(name) && typeof value === 'string' && value.trim().length >= 8)
  .map(([, value]) => value.trim());

function scrub(text) {
  let out = text;
  for (const value of SECRET_VALUES) out = out.split(value).join('REDACTED');
  return out;
}

/** The URL as it may be written down: no credentials, no key-like parameters, no key in a node provider's path. */
function redact(url) {
  const u = new URL(url.href);
  u.username = '';
  u.password = '';
  for (const name of [...u.searchParams.keys()]) if (SECRET_PARAM.test(name)) u.searchParams.set(name, 'REDACTED');
  if (/(^|\.)nodereal\.io$/.test(u.hostname)) u.pathname = u.pathname.replace(/^\/v1\/[^/]+/, '/v1/REDACTED');
  if (/(^|\.)infura\.io$/.test(u.hostname)) u.pathname = u.pathname.replace(/^\/v3\/[^/]+/, '/v3/REDACTED');
  if (/(^|\.)alchemy(api)?\.io$/.test(u.hostname)) u.pathname = u.pathname.replace(/^\/v2\/[^/]+/, '/v2/REDACTED');
  return scrub(u.href);
}

/* ── Fixtures on disk ──────────────────────────────────────────────── */

const sha256 = (data) => createHash('sha256').update(data).digest('hex');

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
  return JSON.stringify(value) ?? 'null';
}

function parseJson(buffer) {
  if (!buffer || buffer.length === 0) return undefined;
  try {
    return JSON.parse(buffer.toString('utf8'));
  } catch {
    return undefined;
  }
}

/** A request body as a hash: JSON by its content, so key order does not matter; anything else by its bytes. */
function bodyHash(buffer) {
  if (!buffer || buffer.length === 0) return null;
  const json = parseJson(buffer);
  return sha256(json === undefined ? buffer : canonical(json));
}

const hostDir = (url) => path.join(FIXTURES, url.host.replace(/[^a-z0-9.-]/gi, '_'));
const fixturePath = (url, prefix, key) => path.join(hostDir(url), `${prefix}-${sha256(key).slice(0, 16)}.json`);

const loaded = new Map();
function load(file) {
  if (loaded.has(file)) return loaded.get(file);
  let fixture = null;
  try {
    fixture = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    fixture = null;
  }
  if (fixture) loaded.set(file, fixture);
  return fixture;
}

function save(file, fixture) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${scrub(JSON.stringify(fixture, null, 2))}\n`);
  fs.renameSync(temporary, file);
  loaded.set(file, fixture);
}

/* Bodies over this are stored gzipped. */
const COMPRESS_OVER = 4 * 1024;
const TEXTUAL = /json|text|xml|javascript|svg|event-stream|x-www-form-urlencoded/i;

function storeBody(buffer, contentType) {
  if (buffer.length === 0) return { text: '' };
  if (buffer.length > COMPRESS_OVER) return { gzip: zlib.gzipSync(buffer, { level: 9 }).toString('base64') };
  return TEXTUAL.test(contentType ?? '') ? { text: buffer.toString('utf8') } : { base64: buffer.toString('base64') };
}

/* A JSON value kept as it is, or gzipped under `<name>Gzip` when large (a multicall's calls and answers). */
function pack(name, value) {
  const json = JSON.stringify(value);
  return json.length > COMPRESS_OVER ? { [`${name}Gzip`]: zlib.gzipSync(json, { level: 9 }).toString('base64') } : { [name]: value };
}

function unpack(fixture, name) {
  const packed = fixture[`${name}Gzip`];
  return typeof packed === 'string' ? JSON.parse(zlib.gunzipSync(Buffer.from(packed, 'base64')).toString('utf8')) : fixture[name];
}

function readBody(body) {
  if ('gzip' in body) return zlib.gunzipSync(Buffer.from(body.gzip, 'base64'));
  if ('base64' in body) return Buffer.from(body.base64, 'base64');
  return Buffer.from(body.text, 'utf8');
}

/* ── Logging ───────────────────────────────────────────────────────── */

const said = new Set();
function say(line) {
  if (said.has(line)) return;
  said.add(line);
  process.stderr.write(`[test-network] ${line}\n`);
}

function refusal(method, where) {
  say(`refused ${method} ${where}`);
  const cause = Object.assign(new Error(`connect ECONNREFUSED (the test network has no answer for ${method} ${where})`), { code: 'ECONNREFUSED', syscall: 'connect' });
  return new TypeError('fetch failed', { cause });
}

/* ── The real network, for recording and for this server's own routes ─ */

const realFetch = globalThis.fetch;
const direct = new undici.Agent();

/* ── The test agent ────────────────────────────────────────────────── */

const GET_AGENT_WALLET = `${toFunctionSelector('function getAgentWallet(uint256)')}${BigInt(TEST_AGENT.tokenId).toString(16).padStart(64, '0')}`.toLowerCase();

/** A registry read the fixtures must not answer: the test agent's wallet is the test key's. */
function syntheticRpc(call) {
  if (call.method !== 'eth_call') return null;
  const [tx] = Array.isArray(call.params) ? call.params : [];
  const data = String(tx?.data ?? tx?.input ?? '').toLowerCase();
  if (String(tx?.to ?? '').toLowerCase() !== TEST_AGENT.registry.toLowerCase() || data !== GET_AGENT_WALLET) return null;
  return { result: encodeAbiParameters([{ type: 'address' }], [TEST_AGENT.address]) };
}

/** The indexer's copy says the same: wherever it describes the test agent, its agent wallet is the test key's. */
function withTestAgent(value) {
  if (Array.isArray(value)) return value.map(withTestAgent);
  if (!value || typeof value !== 'object') return value;
  const out = {};
  for (const [k, v] of Object.entries(value)) out[k] = withTestAgent(v);
  if (Number(out.chain_id) === TEST_AGENT.chainId && String(out.token_id) === TEST_AGENT.tokenId && 'agent_wallet' in out) out.agent_wallet = TEST_AGENT.address;
  return out;
}

/* ── One exchange, whichever layer it arrived through ──────────────── */

/**
 * @typedef {{ method: string, url: URL, headers: Headers, body: Buffer, signal?: AbortSignal, redirect?: RequestRedirect, dispatcher?: unknown }} Outbound
 * @typedef {{ status: number, statusText: string, headers: Record<string, string>, body: Buffer, url: string }} Answer
 */

/** @param {Outbound} request @returns {Promise<Answer>} */
async function exchange(request) {
  const { method, url } = request;
  if (request.signal?.aborted) throw request.signal.reason;

  if (POKTER.test(url.hostname) && HOUSE_PATH.test(url.pathname)) return houseAgent(request);

  const json = parseJson(request.body);
  const calls = method === 'POST' && isRpc(json) ? (Array.isArray(json) ? json : [json]) : null;
  if (calls) return rpc(request, json, calls);
  return plain(request);
}

function isRpc(json) {
  const one = (c) => c && typeof c === 'object' && c.jsonrpc === '2.0' && typeof c.method === 'string';
  return Array.isArray(json) ? json.length > 0 && json.every(one) : one(json);
}

/** A house agent is one of this app's routes: asked of the test server itself. */
async function houseAgent(request) {
  if (!SERVER_PORT) throw refusal(request.method, redact(request.url));
  const local = new URL(`${request.url.pathname}${request.url.search}`, `http://localhost:${SERVER_PORT}`);
  const headers = new Headers(request.headers);
  headers.delete('host');
  const response = await realFetch(local, {
    method: request.method,
    headers,
    body: request.body.length > 0 ? request.body : undefined,
    redirect: 'manual',
    signal: request.signal,
  });
  if (VERBOSE) say(`house agent ${request.method} ${request.url.href} -> ${local.href} ${response.status}`);
  return {
    status: response.status,
    statusText: response.statusText,
    headers: pick(response.headers),
    body: Buffer.from(await response.arrayBuffer()),
    url: request.url.href,
  };
}

/* The response headers a fixture keeps. Never a cookie, never a request header. */
function pick(headers) {
  const out = {};
  for (const name of ['content-type', 'location']) {
    const value = headers.get(name);
    if (value) out[name] = scrub(value);
  }
  return out;
}

/* Errors a node gives for its load, not for the call: never kept. */
const TRANSIENT_RPC = /rate|limit|too many|timeout|timed out|temporar|busy|capacity|unavailable/i;

async function rpc(request, json, calls) {
  const where = redact(request.url);
  const replies = new Array(calls.length);
  const missing = [];
  calls.forEach((call, i) => {
    const synthetic = syntheticRpc(call);
    if (synthetic) {
      replies[i] = synthetic;
      return;
    }
    const fixture = load(fixturePath(request.url, `rpc-${call.method}`, `${where}\n${call.method}\n${canonical(call.params ?? [])}`));
    if (fixture) replies[i] = unpack(fixture, 'reply');
    else missing.push(i);
  });

  if (missing.length > 0) {
    const asked = missing.map((i) => calls[i]);
    if (!mayRecord(request.url, request.method, asked)) {
      for (const call of asked) say(`refused POST ${where} (${call.method})`);
      throw refusal('POST', where);
    }
    const upstream = await realFetch(request.url, {
      method: 'POST',
      headers: request.headers,
      body: JSON.stringify(Array.isArray(json) ? asked : asked[0]),
      signal: request.signal,
      dispatcher: request.dispatcher ?? direct,
    });
    const text = await upstream.text();
    const parsed = upstream.ok ? parseJson(Buffer.from(text)) : undefined;
    if (parsed === undefined) {
      /* A node that refused the request as a whole: passed on, and not kept, so the next run asks again. */
      return { status: upstream.status, statusText: upstream.statusText, headers: pick(upstream.headers), body: Buffer.from(text), url: request.url.href };
    }
    const byId = new Map((Array.isArray(parsed) ? parsed : [parsed]).map((reply) => [JSON.stringify(reply?.id ?? null), reply]));
    for (const i of missing) {
      const call = calls[i];
      const reply = byId.get(JSON.stringify(call.id ?? null));
      if (!reply) throw refusal('POST', `${where} (${call.method}: no reply)`);
      const kept = reply.error ? { error: reply.error } : { result: reply.result };
      replies[i] = kept;
      if (reply.error && TRANSIENT_RPC.test(String(reply.error.message ?? ''))) continue;
      const key = `${where}\n${call.method}\n${canonical(call.params ?? [])}`;
      save(fixturePath(request.url, `rpc-${call.method}`, key), { kind: 'rpc', url: where, method: call.method, ...pack('params', call.params ?? []), ...pack('reply', kept), recordedAt: new RealDate().toISOString() });
      say(`recorded POST ${where} (${call.method})`);
    }
  } else if (VERBOSE) {
    say(`replayed POST ${where} (${calls.map((c) => c.method).join(', ')})`);
  }

  const out = calls.map((call, i) => ({ jsonrpc: '2.0', id: call.id ?? null, ...replies[i] }));
  return {
    status: 200,
    statusText: 'OK',
    headers: { 'content-type': 'application/json' },
    body: Buffer.from(JSON.stringify(Array.isArray(json) ? out : out[0])),
    url: request.url.href,
  };
}

async function plain(request) {
  const { method, url } = request;
  const where = redact(url);
  const hash = bodyHash(request.body);
  const key = `${method} ${where} ${hash ?? '-'}`;
  const file = fixturePath(url, method.toLowerCase(), key);
  let fixture = load(file);

  if (!fixture) {
    if (!mayRecord(url, method, null)) throw refusal(method, where);
    const response = await realFetch(url, {
      method,
      headers: request.headers,
      body: request.body.length > 0 ? request.body : undefined,
      redirect: request.redirect ?? 'follow',
      signal: request.signal,
      dispatcher: request.dispatcher ?? direct,
    });
    const body = Buffer.from(await response.arrayBuffer());
    const kept = { status: response.status, statusText: response.statusText, headers: pick(response.headers) };
    /* A failure of the moment is passed on and not kept, so the next run asks again. */
    if (response.status >= 500 || response.status === 429) return { ...kept, body, url: url.href };
    fixture = {
      kind: 'http',
      method,
      url: where,
      ...(response.url && response.url !== url.href ? { finalUrl: redact(new URL(response.url)) } : {}),
      requestBodySha256: hash,
      response: { ...kept, body: storeBody(body, kept.headers['content-type']) },
      recordedAt: new RealDate().toISOString(),
    };
    save(file, fixture);
    say(`recorded ${method} ${where}`);
  } else if (VERBOSE) {
    say(`replayed ${method} ${where}`);
  }

  let body = readBody(fixture.response.body);
  if (INDEXER.test(url.hostname) && /json/i.test(fixture.response.headers['content-type'] ?? '')) {
    const parsed = parseJson(body);
    if (parsed !== undefined) body = Buffer.from(JSON.stringify(withTestAgent(parsed)));
  }
  return { status: fixture.response.status, statusText: fixture.response.statusText, headers: fixture.response.headers, body, url: url.href };
}

/* ── Layer 1: fetch ────────────────────────────────────────────────── */

const NULL_BODY = new Set([101, 103, 204, 205, 304]);

function toResponse(answer, method) {
  const response = new Response(NULL_BODY.has(answer.status) || method === 'HEAD' ? null : answer.body, {
    status: answer.status,
    statusText: answer.statusText,
    headers: answer.headers,
  });
  Object.defineProperty(response, 'url', { value: answer.url });
  return response;
}

globalThis.fetch = async function fetch(input, init) {
  const href = typeof input === 'string' ? input : input instanceof URL ? input.href : input?.url;
  let url;
  try {
    url = new URL(href);
  } catch {
    return realFetch(input, init);
  }
  if ((url.protocol !== 'http:' && url.protocol !== 'https:') || isLocal(url.hostname)) return realFetch(input, init);
  const streamed = init?.body && typeof init.body.getReader === 'function';
  const request = new Request(input, init ? { ...init, ...(streamed ? { duplex: 'half' } : {}) } : undefined);
  const body = request.method === 'GET' || request.method === 'HEAD' ? Buffer.alloc(0) : Buffer.from(await request.arrayBuffer());
  const answer = await exchange({ method: request.method, url, headers: request.headers, body, signal: request.signal, redirect: request.redirect, dispatcher: init?.dispatcher });
  return toResponse(answer, request.method);
};

/* ── Layers 2 and 3: undici's dispatcher and node:http(s), through a local socket ── */

const TARGET = 'x-pokter-test-network-target';
const SOCKET = path.join(os.tmpdir(), `pokter-test-network-${process.pid}.sock`);

fs.rmSync(SOCKET, { force: true });
const loopback = http.createServer(async (req, res) => {
  try {
    const target = new URL(String(req.headers[TARGET]));
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const headers = new Headers();
    for (const [name, value] of Object.entries(req.headers)) {
      if (name === TARGET || name === 'host' || name === 'connection' || name === 'content-length' || name === 'transfer-encoding') continue;
      headers.set(name, Array.isArray(value) ? value.join(', ') : String(value));
    }
    const answer = await exchange({ method: req.method ?? 'GET', url: target, headers, body: Buffer.concat(chunks) });
    res.statusCode = answer.status;
    if (answer.statusText) res.statusMessage = answer.statusText;
    for (const [name, value] of Object.entries(answer.headers)) res.setHeader(name, value);
    res.end(answer.body);
  } catch {
    /* As a host that hung up: the caller sees a network failure. */
    req.socket.destroy();
  }
});
loopback.listen(SOCKET);
loopback.unref();
process.on('exit', () => fs.rmSync(SOCKET, { force: true }));

const viaLoopback = new undici.Agent({ connect: { socketPath: SOCKET } });

function withHeader(headers, name, value) {
  if (Array.isArray(headers)) return Array.isArray(headers[0]) ? [...headers, [name, value]] : [...headers, name, value];
  if (headers && typeof headers === 'object' && typeof headers[Symbol.iterator] === 'function') return [...headers, [name, value]];
  return { ...(headers ?? {}), [name]: value };
}

class TestNetworkDispatcher extends undici.Dispatcher {
  dispatch(options, handler) {
    const origin = new URL(String(options.origin));
    if (isLocal(origin.hostname)) return direct.dispatch(options, handler);
    const target = new URL(options.path, origin).href;
    return viaLoopback.dispatch({ ...options, origin: 'http://localhost', headers: withHeader(options.headers, TARGET, target) }, handler);
  }

  close(...args) {
    return direct.close(...args);
  }

  destroy(...args) {
    return direct.destroy(...args);
  }
}
undici.setGlobalDispatcher(new TestNetworkDispatcher());

const httpRequest = http.request;

/** Where an http(s).request call is going, or null when it stays on this machine. */
function outboundOf(args, protocol) {
  let i = 0;
  let url = null;
  if (typeof args[0] === 'string' || args[0] instanceof URL) {
    url = new URL(args[0]);
    i = 1;
  }
  const options = args[i] && typeof args[i] === 'object' ? args[i] : {};
  if (options === args[i]) i += 1;
  const callback = typeof args[i] === 'function' ? args[i] : undefined;
  if (options.socketPath) return null;
  const hostname = String(options.hostname ?? options.host ?? url?.hostname ?? 'localhost').replace(/:\d+$/, '');
  if (isLocal(hostname) || hostname === '') return null;
  const scheme = options.protocol ?? url?.protocol ?? protocol;
  const port = options.port ?? url?.port;
  const target = new URL(`${scheme}//${hostname}${port ? `:${port}` : ''}${options.path ?? (url ? `${url.pathname}${url.search}` : '/')}`);
  return { target, options, callback };
}

function plainHeaders(headers) {
  if (!headers) return {};
  if (Array.isArray(headers)) {
    const out = {};
    for (let j = 0; j + 1 < headers.length; j += 2) out[String(headers[j])] = headers[j + 1];
    return out;
  }
  return { ...headers };
}

for (const [module, protocol] of [[http, 'http:'], [https, 'https:']]) {
  const original = module.request;
  module.request = function request(...args) {
    const outbound = outboundOf(args, protocol);
    if (!outbound) return original.apply(this, args);
    const { target, options, callback } = outbound;
    return httpRequest(
      {
        socketPath: SOCKET,
        method: options.method ?? 'GET',
        path: `${target.pathname}${target.search}`,
        headers: { ...plainHeaders(options.headers), [TARGET]: target.href },
        timeout: options.timeout,
        signal: options.signal,
        agent: false,
      },
      callback,
    );
  };
  module.get = function get(...args) {
    const req = module.request(...args);
    req.end();
    return req;
  };
}

/* ── DNS ───────────────────────────────────────────────────────────── */

const realLookup = dns.lookup;
const realPromisesLookup = dns.promises.lookup;

/** Every address a host resolved to when it was recorded; refused like an unknown name when there is none. */
async function addressesOf(hostname) {
  const url = new URL(`https://${hostname}`);
  const file = path.join(hostDir(url), 'dns.json');
  const fixture = load(file);
  if (fixture) return fixture.addresses;
  if (!mayResolve(hostname)) {
    say(`refused DNS ${hostname}`);
    throw Object.assign(new Error(`getaddrinfo ENOTFOUND ${hostname} (the test network has no answer for it)`), { code: 'ENOTFOUND', syscall: 'getaddrinfo', hostname });
  }
  const addresses = await realPromisesLookup.call(dns.promises, hostname, { all: true, verbatim: true });
  save(file, { kind: 'dns', hostname, addresses, recordedAt: new RealDate().toISOString() });
  say(`recorded DNS ${hostname}`);
  return addresses;
}

function lookupOptions(options) {
  if (typeof options === 'number') return { family: options };
  return options ?? {};
}

function chosen(addresses, options) {
  const family = options.family === 'IPv4' ? 4 : options.family === 'IPv6' ? 6 : Number(options.family ?? 0);
  const matching = family ? addresses.filter((a) => a.family === family) : addresses;
  if (matching.length === 0) throw Object.assign(new Error('getaddrinfo ENOTFOUND'), { code: 'ENOTFOUND', syscall: 'getaddrinfo' });
  return matching;
}

dns.lookup = function lookup(hostname, options, callback) {
  const done = typeof options === 'function' ? options : callback;
  const opts = typeof options === 'function' ? {} : lookupOptions(options);
  if (typeof hostname !== 'string' || isLocal(hostname) || isIP(hostname)) return realLookup.call(this, hostname, options, callback);
  addressesOf(hostname)
    .then((addresses) => {
      const matching = chosen(addresses, opts);
      if (opts.all) done(null, matching);
      else done(null, matching[0].address, matching[0].family);
    })
    .catch((error) => done(error));
  return {};
};

dns.promises.lookup = async function lookup(hostname, options) {
  const opts = lookupOptions(options);
  if (typeof hostname !== 'string' || isLocal(hostname) || isIP(hostname)) return realPromisesLookup.call(this, hostname, options);
  const matching = chosen(await addressesOf(hostname), opts);
  return opts.all ? matching : matching[0];
};

syncBuiltinESMExports();

if (VERBOSE) say(`${MODE} mode, fixtures in ${FIXTURES}`);
