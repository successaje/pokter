import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

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
 */
test('scope is enforced at call time, and the listing is not filtered by it', () => {
  assert.match(PROVIDER, /scopeRefusal\(token\.scopes, scope\)/);
  assert.match(PROVIDER, /if \(refusal\) return/);
  assert.doesNotMatch(
    PROVIDER,
    /\.filter\(\(tool\) =>[\s\S]{0,200}token\.scopes\.includes/,
    'a filtered listing turns "you need a scope" into "no such tool"',
  );
  // The refusal names the scope and hands back what the token does carry.
  assert.match(PROVIDER, /grantedScopes: token\.scopes/);
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
  const confirm = readFileSync(new URL('../src/lib/builders/provider-identity.ts', import.meta.url), 'utf8');
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
