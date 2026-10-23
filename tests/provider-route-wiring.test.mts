import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

import { PROVIDER_SKILL_MD as SKILL_MD } from '../src/lib/builders/provider-skill';

/*
 * `import 'server-only'` reaches these routes through their own imports, so
 * nothing in `tests/` can load them. The decisions they make live in pure
 * modules with their own tests; what is left is the wiring, and the wiring
 * is asserted as a source fact — the pattern
 * `tests/passkey-signature-verify.test.mts` uses, for the same reason.
 *
 * Comments are stripped before matching, so a claim cannot be satisfied by
 * a comment that mentions the thing the code was supposed to do. Several of
 * the comments below deliberately quote the wrong behaviour so nobody
 * reinstates it, which would otherwise make these tests pass on prose.
 */
const route = (path: string) =>
  readFileSync(new URL(`../src/app/api/${path}/route.ts`, import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

const PROVIDER = route('mcp/provider');
const IDENTITY = readFileSync(new URL('../src/lib/builders/provider-identity.ts', import.meta.url), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');
const AUTOMATION = route('builders/automation');
const SKILLS = route('skills/[name]');
const BUYING = route('mcp');
const PAGE = readFileSync(new URL('../src/app/(site)/build/(section)/automation/page.tsx', import.meta.url), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

test('the provider MCP endpoint authenticates by bearer token and nothing else', () => {
  assert.match(PROVIDER, /automationTokenFromHeader\(request\.headers\.get\('authorization'\)\)/);
  assert.match(PROVIDER, /hashAutomationToken\(secret\)/);
  assert.match(PROVIDER, /automationTokenFor\(tokenHash\)/);
});

/*
 * The failure this whole credential exists to avoid. A headless assistant
 * cannot hold `pokter_builder_session`, and the workaround — read the
 * cookie out of a browser and paste it into a chat — must not be made to
 * work by this endpoint accepting one.
 */
test('the provider MCP endpoint does not accept the browser session cookie', () => {
  assert.doesNotMatch(PROVIDER, /BUILDER_SESSION_COOKIE/);
  assert.doesNotMatch(PROVIDER, /builderSessionOwner/);
  assert.doesNotMatch(PROVIDER, /request\.cookies/);
  assert.doesNotMatch(PROVIDER, /\bcookies\(\)/);
});

test('an unrecognised token is refused with a 401 and a way forward', () => {
  assert.match(PROVIDER, /status: 401/);
  assert.match(PROVIDER, /www-authenticate/);
  assert.match(PROVIDER, /revoked, it has expired, or it is not a token Pokter issued/);
  assert.match(PROVIDER, /\/build\/automation/);
});

/*
 * Revocation has to be verifiable, which means it cannot be cached. The
 * token row is read on every request and the lifetime checks are in that
 * query's own SQL (`automation-store.ts`), so there is nothing between a
 * revocation and the next refusal.
 */
test('the token is read on every call rather than cached per process', () => {
  assert.doesNotMatch(PROVIDER, /new Map\(|cache\(|unstable_cache|globalThis\.__/);
  assert.match(PROVIDER, /export const dynamic = 'force-dynamic'/);
  assert.match(PROVIDER, /'cache-control': 'no-store'/);
});

/*
 * Observed over real JSON-RPC: the listing was filtered by scope as well,
 * and `answerMcp` answers a tool it was not given with `-32602 Unknown
 * tool` — so a token without `proposals:write` was told prepare_proposal
 * does not exist. A false claim about what Pokter offers, and it sends the
 * user hunting for a tool instead of for a scope.
 *
 * The gate itself is no longer a statement in this file. It was, with
 * `return body(args)` after it, and moving it to run after `await
 * body(args)` left all 1,875 assertions passing — because a source regex
 * cannot see ordering. It is now `scopeGuarded`, which holds the body and
 * decides whether to call it, and `tests/provider-gate.test.mts` drives it
 * with a spy that records whether the work ran. What is left here is the
 * wiring: that the gate is reached, for every tool, with the spec's own
 * scope.
 */
test('scope is enforced at call time, and the listing is not filtered by it', () => {
  assert.match(PROVIDER, /run: scopeGuarded\(scope, token, body\)/);
  assert.match(PROVIDER, /import \{ scopeGuarded, withConfirmedAgent \} from '@\/lib\/assistant\/provider-gate'/);
  // Through `run`, which every tool in the returned array is built by, so
  // no tool can be added that skips it.
  assert.match(PROVIDER, /const run = \(name: string, body:/);
  assert.doesNotMatch(
    PROVIDER,
    /\.filter\(\(tool\) =>[\s\S]{0,200}token\.scopes\.includes/,
    'a filtered listing turns "you need a scope" into "no such tool"',
  );
  // The refusal names the scope and hands back what the token does carry.
  const gate = readFileSync(new URL('../src/lib/assistant/provider-gate.ts', import.meta.url), 'utf8');
  assert.match(gate, /grantedScopes: token\.scopes/);
  assert.match(gate, /scopeRefusal\(token\.scopes, scope\)/);
});

/*
 * `provider_status` carries no scope, deliberately — it is the honest first
 * call for any live token. It was also returning outstanding job ids with
 * the hashes staged against them, quoted proposal prices and a count of
 * indexed jobs, to a token holding none of the scopes that govern those.
 * `automation-token.ts` told the user a `requests:read` token "cannot read
 * their jobs"; it could.
 */
test('provider_status gates each block it reports on that block’s own scope', () => {
  assert.match(PROVIDER, /proposalsToSign: scoped\('proposals:write'/);
  assert.match(PROVIDER, /deliveriesToSubmit: scoped\('deliverables:prepare'/);
  assert.match(PROVIDER, /jobsIndexed: scoped\('jobs:read'/);
  // Withheld is said, not omitted: an absent count reads as zero and an
  // absent list reads as "nothing is waiting".
  assert.match(PROVIDER, /\{ notShown: refusal \}/);
  // And the three surfaces that describe this say the same thing.
  const spec = readFileSync(new URL('../src/lib/assistant/provider-tools.ts', import.meta.url), 'utf8');
  for (const scope of [/proposals:write/, /deliverables:prepare/, /jobs:read/]) {
    assert.match(spec, scope, 'the tool description names the scope each block needs');
  }
  assert.match(spec, /rather than coming back empty as though nothing were waiting/);
  assert.match(SKILL_MD, /unsigned proposals need `proposals:write`/);
  assert.match(SKILL_MD, /never as "nothing is waiting"/);
});

/*
 * The wallet stays with the human, structurally. If any of these appeared
 * here, the server would be holding or using a key.
 */
test('the provider endpoint has no path to a key, a signature or a transaction', () => {
  for (const forbidden of [
    /privateKeyToAccount/,
    /mnemonicToAccount/,
    /PRIVATE_KEY/,
    /createWalletClient/,
    /writeContract/,
    /sendTransaction/,
    /signMessage\(/,
    /signTypedData/,
    /\.sign\(/,
  ]) {
    assert.doesNotMatch(PROVIDER, forbidden, `the provider endpoint must not reach ${forbidden}`);
  }
});

/*
 * A proposal's checks — the signature against the registry owner, the
 * ten-minute window, the budget ceiling — exist once, in the public bids
 * route. Reimplementing them here is how two paths come to disagree about
 * who may offer an agent.
 */
test('submitting a proposal goes through the audited bids route', () => {
  assert.match(PROVIDER, /import \{ POST as placeBid \} from '@\/app\/api\/briefs\/\[id\]\/bids\/route'/);
  assert.match(PROVIDER, /await placeBid\(/);
  // The signature check belongs to the bids route. Two routes checking it
  // is two routes that can come to disagree about who may offer an agent.
  for (const forbidden of [/signedByWallet\(/, /walletCanBeChecked\(/, /verifyMessage\(/, /recoverMessageAddress\(/, /recoverAddress\(/]) {
    assert.doesNotMatch(PROVIDER, forbidden, `the provider endpoint must not verify a signature itself (${forbidden})`);
  }
  // It builds the message for a human to sign, which is a different thing,
  // and the terms it builds from are the stored row rather than the call's.
  assert.match(PROVIDER, /bidMessage\(\{/);
  assert.match(PROVIDER, /agentChainId: row\.agentChainId/, 'the forwarded proposal is the staged one, not whatever the caller re-sent');
  assert.match(PROVIDER, /priceU: row\.priceU/);
  assert.match(PROVIDER, /note: row\.note/);
});

/*
 * Ownership is read from the registry again, per request, exactly as
 * `/api/builders/deliveries` does it: an agent transferred away stops
 * being actionable at once, and a stale catalogue row must not hand it to
 * the previous owner.
 */
test('acting for an agent re-checks ownership against the registry', () => {
  assert.match(PROVIDER, /confirmAgentOwner\(/);
  const confirm = IDENTITY;
  assert.match(confirm, /registryOwner\(/);
  assert.doesNotMatch(
    confirm.replace(/\/\*[\s\S]*?\*\//g, ''),
    /listAgents[\s\S]{0,400}return \{ ok: true/,
    'the catalogue must never be what grants control',
  );
  // "Could not check" is reported as that, never as "not yours".
  assert.match(confirm, /unavailable: true/);
  assert.match(confirm, /did not answer/);
});

/*
 * Staging a deliverable is INSIDE the ownership gate rather than after it.
 *
 * It used to be a check with the staging beside it, and deleting
 * `confirmAgentOwner(...)` and its refusal from `prepare_deliverable` left
 * all 1,875 assertions passing — the regex above was satisfied by the
 * surviving call inside `ownedAgent`. `withConfirmedAgent` holds the work
 * as a callback, so the ordering is a property of
 * `tests/provider-gate.test.mts` and what is asserted here is only that
 * the route still routes through it, with the job's own agent.
 */
test('staging a deliverable happens inside the ownership gate, not after it', () => {
  assert.match(PROVIDER, /return withConfirmedAgent\(\s*\{ chainId: job\.agentChainId \?\? 56, tokenId: job\.agentTokenId \}/);
  assert.match(PROVIDER, /\(agentChainId, agentTokenId\) => confirmAgentOwner\(owner, agentChainId, agentTokenId\)/);
  // The write is reached only through the callback the gate is given.
  assert.match(PROVIDER, /async \(\) => \{[\s\S]*?recordStagedDelivery\(/);
  assert.doesNotMatch(
    PROVIDER,
    /const confirmed = await confirmAgentOwner\(owner, job\./,
    'a check with the staging beside it is the arrangement a regex could not police',
  );
  const gate = readFileSync(new URL('../src/lib/assistant/provider-gate.ts', import.meta.url), 'utf8');
  assert.match(gate, /if \(!confirmed\.ok\) return \{ data: \{ error: confirmed\.reason \}, isError: true \};/);
  assert.match(gate, /return body\(\);/);
});

/*
 * The release-blocking half of the same defect. `confirmAgentOwner` was
 * reached only from `prepare_proposal` and `prepare_deliverable`; the four
 * read tools took `providerFleet` — the union of the catalogue and the
 * verified-publishers table — and `jobsForAgents` matched jobs on the agent
 * identity alone. A former owner's ninety-day token kept reading a new
 * owner's funded briefs, budgets, deliverable URLs and earnings.
 *
 * The confirmation now lives in `providerFleet` itself rather than in the
 * tools that remembered to ask, so there is no unconfirmed fleet for a
 * caller to get hold of.
 */
test('every provider read is filtered by current registry ownership', () => {
  assert.match(IDENTITY, /confirmOwnedAgents\(candidates, \(chainId, tokenId\) =>\s*confirmAgentOwner\(owner, chainId, tokenId\),\s*\)/);
  // The fleet that leaves this module is the confirmed one, and the
  // unconfirmed candidates are not exported for anyone to reach.
  assert.match(IDENTITY, /agents: confirmed\.agents/);
  assert.doesNotMatch(IDENTITY, /export (async )?function (providerCandidates|unconfirmedFleet)/);
  // Withheld agents are named, because a withheld job shown as no job is
  // "you have nothing outstanding".
  assert.match(IDENTITY, /ownershipUnavailable: confirmed\.ownershipUnavailable/);
  assert.match(IDENTITY, /notOwned: confirmed\.notOwned/);
  const view = readFileSync(new URL('../src/lib/builders/provider-work-view.ts', import.meta.url), 'utf8');
  assert.match(view, /jobsForAgents\(fleet\.agents\)/);
  // And every tool that reports jobs or money says what it could not check.
  assert.match(PROVIDER, /const ownershipNotes = \(fleet/);
  for (const tool of ['provider_status', 'find_requests', 'list_work', 'report_earnings']) {
    const body = PROVIDER.slice(PROVIDER.indexOf(`run('${tool}'`), PROVIDER.indexOf(`run('${tool}'`) + 4_000);
    assert.match(body, /\.\.\.ownershipNotes\(fleet\)/, `${tool} must say which agents it could not confirm`);
  }
});

/*
 * The page reads the same fleet, so a registry outage leaves its figures
 * short. Said rather than swallowed, for the reason the catalogue warning
 * is said: four defects have shipped on this page where the code was right
 * and its claim was wrong.
 */
test('the page says when a figure is missing an agent it could not confirm', () => {
  assert.match(PAGE, /fleet\.ownershipUnavailable\.length > 0/);
  assert.match(PAGE, /could not confirm ownership of/);
  assert.match(PAGE, /fleet\.notOwned\.length > 0/);
});

test('the provider endpoint does not advertise cross-origin access', () => {
  // An authenticated endpoint with an open CORS policy invites a credential
  // into a page that has no business holding one. The buying surface is
  // open because every tool there is a public read.
  assert.doesNotMatch(PROVIDER, /access-control-allow-origin/);
  assert.match(BUYING, /access-control-allow-origin/, 'the public buying surface is still open');
});

test('the provider endpoint announces itself rather than the buying server', () => {
  assert.match(PROVIDER, /answerMcp\(body, tools\(request, token\), \[\], PROVIDER_SERVER_IDENTITY\)/);
});

test('calls are rate limited per token, not per address', () => {
  // A provider's assistant runs behind one address and may be its only
  // caller, so an address limit would either be useless or throttle one
  // legitimate assistant.
  assert.match(PROVIDER, /consumeRateLimit\(`mcp-provider:\$\{tokenHash\}`/);
});

/*
 * Found over real JSON-RPC: `action` was the SQL statement's outcome, which
 * is `restaged` for every call after the first because the UPDATE always
 * runs, while the message beside it said nothing had been written. The
 * field a caller reads has to be the decision.
 */
test('a staging call reports the decision, not the statement’s outcome', () => {
  assert.match(PROVIDER, /action: retry\.action/);
  assert.doesNotMatch(PROVIDER, /action: result,/, 'the store’s write outcome is not what happened to the work');
  assert.doesNotMatch(PROVIDER, /action: recorded,/);
});

test('untrusted text is wrapped and cleaned before it reaches an assistant', () => {
  assert.match(PROVIDER, /cleanUntrusted\(/);
  assert.match(PROVIDER, /untrusted\(\{/);
  // Both tools that return a stranger's words do it.
  assert.match(PROVIDER, /\.\.\.untrusted\(\{\s*title:/);
  assert.match(PROVIDER, /\.\.\.untrusted\(\{ task:/);
});

test('minting a token needs the browser session, and a token cannot mint another', () => {
  assert.match(AUTOMATION, /builderSessionOwner\(request\.cookies\.get\(BUILDER_SESSION_COOKIE\)\?\.value\)/);
  assert.match(AUTOMATION, /status: 401/);
  // Nothing here reads an Authorization header: a leaked token that could
  // mint its own replacement would be permanent.
  assert.doesNotMatch(AUTOMATION, /authorization/i);
  assert.doesNotMatch(AUTOMATION, /automationTokenFromHeader/);
});

test('the secret is returned once, uncached, and never stored in the clear', () => {
  assert.match(AUTOMATION, /'cache-control': 'no-store'/);
  assert.match(AUTOMATION, /tokenHash: minted\.tokenHash/);
  assert.doesNotMatch(AUTOMATION, /token: minted\.token,\s*\n\s*ownerAddress/, 'the secret must not be written to the row');
  // And the listing the page renders carries no secret column.
  assert.doesNotMatch(AUTOMATION, /tokenHash: token\.|token: token\./);
});

test('revocation is scoped to the session’s own wallet', () => {
  assert.match(AUTOMATION, /revokeAutomationTokenFor\(owner, id\)/);
});

test('the skill is served from the module the file on disk is generated from', () => {
  assert.match(SKILLS, /PROVIDER_SKILL_MD/);
  assert.match(SKILLS, /text\/markdown/);
  // Not read off the filesystem at request time: `.claude/` is not part of
  // a Next build's traced output, so that would work locally and 404 in
  // production — the exact shape of defect this repository keeps shipping.
  assert.doesNotMatch(SKILLS, /readFileSync|readFile|node:fs/);
});

/*
 * Found by reading the rendered page, which is the only way these are ever
 * found: four defects have shipped on this repository where the code was
 * right and the page's claim was wrong. These pin the two the page had.
 */
test('the page counts work it is actually possible to deliver', () => {
  // A job sits at FUNDED however far past its expiry it is — the escrow
  // only moves to EXPIRED when the buyer reclaims — so "Funded, to deliver"
  // counted a job the escrow would refuse a submission for.
  assert.match(PAGE, /deliveryBlocked\(job\) === null/);
  assert.match(PAGE, /past its deadline, unpayable/);
  assert.doesNotMatch(PAGE, /value: funded\.length/, 'FUNDED is not the same as deliverable');
});

test('the page does not re-add formatted money figures', () => {
  assert.match(PAGE, /value: line\.didNotPayU/);
  assert.doesNotMatch(PAGE, /Number\(line\.\w+U\) \+ Number\(/, 'adding decimal strings back is how a money figure grows a tail of nines');
});

test('the page says both limits before the setup that assumes them', () => {
  assert.ok(PAGE.indexOf('It cannot sign.') < PAGE.indexOf('Set up Claude Code'));
  assert.match(PAGE, /It does not host your agent/);
  assert.match(PAGE, /always-on endpoint; this is not a substitute for one/);
  assert.match(PAGE, /written for Claude Code and no other assistant/);
});

test('the page reports a last call, never an online status', () => {
  assert.match(PAGE, /lastSeen\(mostRecentCall\)/);
  assert.doesNotMatch(PAGE, /'Online'|"Online"|Offline/, 'Pokter cannot see whether somebody’s assistant is running');
});

/*
 * The comment above this component said the export line is shown with a
 * placeholder "because a command with a live credential in it goes into
 * shell history" — and the line below it interpolated `minted.token`,
 * giving the user a copy button straight into `~/.zsh_history`. Meanwhile
 * `tokenEnvLine()`, written for exactly this, had no call sites at all.
 */
test('the minted token is not rendered into a copyable shell command', () => {
  const tokens = readFileSync(new URL('../src/features/studio/Automation.tsx', import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
  assert.match(tokens, /\{tokenEnvLine\(\)\}/, 'the shell line is the placeholder the helper writes');
  assert.doesNotMatch(tokens, /export \$\{TOKEN_ENV_NAME\}=\$\{minted\.token\}/);
  assert.doesNotMatch(tokens, /export[^\n]*\$\{minted\.token\}/, 'a live credential must not be interpolated into a command');
  // The secret still appears, once, in a block of its own.
  assert.match(tokens, /<CodeBlock wrap label="Copy token">\{minted\.token\}<\/CodeBlock>/);
  const prompt = readFileSync(new URL('../src/lib/builders/automation-prompt.ts', import.meta.url), 'utf8');
  assert.match(prompt, /export function tokenEnvLine/, 'and the helper that was dead code now has a caller');
});

test('the staged deliverable reaches the delivery composer, as a draft', () => {
  const jobs = readFileSync(new URL('../src/app/(site)/build/(section)/jobs/page.tsx', import.meta.url), 'utf8');
  assert.match(jobs, /reconcileStagedWork\(owner\)/);
  assert.match(jobs, /awaiting-wallet-signature/, 'a delivery already on chain must not be offered back as a draft');
  assert.match(jobs, /staged=\{staged\}/);
  const inbox = readFileSync(new URL('../src/features/studio/DeliveryInbox.tsx', import.meta.url), 'utf8');
  // The seller's own unsaved words win over text an assistant staged.
  assert.match(inbox, /sessionStorage\.getItem\(draftKey\) \|\| staged \|\| ''/);
  assert.match(inbox, /Nothing has been delivered yet/);
});

/*
 * The address brake must come before any caller-supplied value is a key.
 *
 * The per-token bucket is keyed on a hash of the Authorization header,
 * which the caller chooses. Rotating it produced a fresh bucket per
 * request: 135 unauthenticated POSTs with 135 different fake tokens drew
 * 135 answers and no 429, while 135 with one token stopped at 120. Each
 * distinct key also INSERTs a row into the rate-limit database on the one
 * mounted volume that carries the job index and the brief store, and
 * pruning only drops rows over an hour old while SQLite never shrinks the
 * file without VACUUM — so an unauthenticated flood grew a file every
 * other store depends on.
 *
 * Position, not presence: the defect was ordering, and a test that only
 * looked for `requestClientKey` somewhere in the file would have passed
 * while the limiter still ran after the token was parsed.
 */
test('the provider endpoint brakes on the address before it keys anything on the caller', () => {
  const addressLimit = PROVIDER.indexOf('mcp-provider-ip:');
  const headerRead = PROVIDER.indexOf('automationTokenFromHeader(');
  const tokenLimit = PROVIDER.indexOf('mcp-provider:');

  assert.ok(addressLimit > 0, 'there is no address-keyed limit on this route');
  assert.match(PROVIDER, /consumeRateLimit\(`mcp-provider-ip:\$\{requestClientKey\(request\)\}`/);
  assert.ok(
    addressLimit < headerRead,
    'the address limit runs after the Authorization header is read, so a rotated header still reaches it',
  );
  assert.ok(
    addressLimit < tokenLimit,
    'the caller-keyed bucket runs first, which is the unbounded key space itself',
  );
});

/*
 * Every skill lookup resolves to a skill this route was given.
 *
 * `SKILLS` was a plain object literal and the lookup was unguarded, so
 * `/api/skills/constructor` returned 200 text/markdown holding
 * "function Object() { [native code] }" and `/api/skills/__proto__`
 * returned "[object Object]", both cacheable for 300 seconds, while the
 * route's own contract promises a 404 for an unknown name.
 */
test('the skills route cannot resolve an inherited Object key', () => {
  const skills = route('skills/[name]');
  assert.match(
    skills,
    /Object\.create\(null\)/,
    'SKILLS inherits from Object.prototype, so constructor and __proto__ resolve as skills',
  );

  /* The shape the route now builds, exercised rather than described. */
  const table: Record<string, string> = Object.assign(Object.create(null) as Record<string, string>, {
    'pokter-provider': '# skill',
  });
  for (const key of ['constructor', '__proto__', 'toString', 'valueOf', 'hasOwnProperty']) {
    assert.equal(table[key], undefined, `${key} resolved to something a request could be served`);
  }
  assert.equal(table['pokter-provider'], '# skill', 'the real skill must still resolve');
});
