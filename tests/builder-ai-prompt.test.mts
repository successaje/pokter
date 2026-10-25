import assert from 'node:assert/strict';
import test from 'node:test';

import { createAgentBuildPrompt } from '../src/lib/builder/ai-prompt';
import { FAUCETS } from '../src/lib/network/presentation';
import { CATEGORIES, NO_CATEGORY } from '../src/lib/agents/categories';
import { KIT_VERSION } from '../src/lib/integration/guide';
import { PROPOSAL_DELIVER_DAYS } from '../src/lib/erc8183/deadline';

test('creates a category-aware A2A build prompt with safety constraints', () => {
  const prompt = createAgentBuildPrompt({
    name: 'Treasury Sentinel',
    description: 'Returns a sourced treasury risk report.',
    category: 'yield',
    protocol: 'a2a',
    target: 'Stablecoins',
    policy: 'Capital preservation',
    output: 'Risk report',
  });

  assert.match(prompt, /Treasury Sentinel/);
  assert.match(prompt, /GET \/\.well-known\/agent-card\.json/);
  assert.match(prompt, /Never request, print, store, or hard-code a seed phrase or private key/);
  assert.match(prompt, /public HTTPS URL/);
  assert.match(prompt, /three meaningfully different agent concepts and original names/);
});

const BASE = {
  name: '',
  description: '',
  category: '',
  protocol: 'a2a',
} as const;

/*
 * These are the parts an agent cannot be sold without, and all of them were
 * missing. A service built to the old prompt passed four of Pokter's six
 * checks — identity, endpoint, answering, capabilities — and failed the
 * fifth, so it listed, probed well, and could never be hired. The prompt is
 * the only place that fault can be prevented, because it is decided while
 * the agent is being written.
 */
test('the prompt asks for the two skills a sale needs', () => {
  const prompt = createAgentBuildPrompt({ ...BASE });
  assert.match(prompt, /`negotiate`/);
  assert.match(prompt, /`notify_funded`/);
  assert.match(prompt, /refuses any quote that does not come back to that registered wallet/);
});

test('it says delivery is an on-chain submit, not an HTTP response', () => {
  const prompt = createAgentBuildPrompt({ ...BASE });
  assert.match(prompt, /on-chain submit/);
  assert.match(prompt, /Returning JSON over an HTTP response is not delivery/);
});

/*
 * The failure this exists to stop: ten of the thirteen agents that have
 * ever returned a signed price quote in a token the escrow cannot pay.
 */
test('it names the escrow chain and forbids quoting in the wrong currency', () => {
  const prompt = createAgentBuildPrompt({ ...BASE });
  assert.match(prompt, /chain 97/);
  assert.match(prompt, /quote in the payment token of chain 97/);
  assert.match(prompt, /signed for chain 56, verifies correctly and still cannot be paid/);
  assert.match(prompt, /do not guess it/);
});

test('it explains that both chains are listed and where the money settles', () => {
  const prompt = createAgentBuildPrompt({ ...BASE });
  assert.match(prompt, /BNB Chain mainnet \(56\) or BNB Smart Chain Testnet \(97\)/);
  assert.match(prompt, /Pokter lists both/);
  assert.match(prompt, /test token with no real value/);
});

test('it warns that probing proves reachability, not correctness', () => {
  const prompt = createAgentBuildPrompt({ ...BASE });
  assert.match(prompt, /every two hours/);
  assert.match(prompt, /proves reachability only — never correctness/);
});

test('it ends with a listing block in the order the form asks for it', () => {
  const prompt = createAgentBuildPrompt({ ...BASE });
  assert.match(prompt, /Pokter listing/);
  for (const field of [
    'Agent name:',
    'Description:',
    'Category:',
    'Service protocol:',
    'Endpoint:',
    'Source repository:',
    'Identity chain:',
  ]) {
    assert.ok(prompt.includes(field), `listing block is missing "${field}"`);
  }
});

/*
 * The listing block hand-kept "rebalancing, grid-trading, yield,
 * health-factor" while `CATEGORIES` had five and the form also offered
 * "none of these fits". So the prompt told every builder to pick one of
 * four, and a token-safety agent — a real category, and the subject of the
 * kit's own worked example — had to claim a category describing something
 * it does not do, which is the exact fault `NO_CATEGORY` exists to stop.
 *
 * Pinned against the config rather than a literal, so the list cannot drift
 * again: adding a category to `CATEGORIES` now fails this test until the
 * prompt carries it.
 */
test('the listing block offers every category the form does, and no others', () => {
  const prompt = createAgentBuildPrompt({ ...BASE });
  const line = prompt.match(/- Category: \(exactly one of ([^)]+)\)/);
  assert.ok(line, 'the listing block must offer a category choice');

  const offered = line![1].split(',').map((s) => s.trim());
  assert.deepEqual(offered, [...CATEGORIES.map((c) => c.id as string), NO_CATEGORY]);

  // And each one is explained, so the choice is informed rather than guessed.
  for (const category of CATEGORIES) {
    assert.ok(prompt.includes(`  - ${category.id}: ${category.blurb}`), `missing guidance for ${category.id}`);
  }
});

/*
 * The authority question. The prompt sent the assistant to a third party's
 * agent card on a host its own comment admitted sleeps, and never mentioned
 * the first-party kit at all — so a stranger's deployment was the reference
 * for Pokter's protocol.
 */
test('the first-party kit is the authority, fetched before scaffolding', () => {
  const prompt = createAgentBuildPrompt({ ...BASE });
  assert.match(prompt, /https:\/\/pokter\.xyz\/api\/v1\/integration/);
  assert.match(prompt, /https:\/\/pokter\.xyz\/build\/integration/);
  assert.match(prompt, /Fetch this first, before any scaffolding/);
  assert.match(prompt, /if this prompt and the kit disagree, the kit is right/);
});

test('the record says which kit version the code was built against', () => {
  const prompt = createAgentBuildPrompt({ ...BASE });
  assert.match(prompt, /Read its `version` field and tell me which version you built against/);
  assert.ok(prompt.includes('Integration kit version built against:'), 'the listing summary must carry the version');
  // The bundled fallback is stamped, so an offline build still names a schema.
  assert.ok(prompt.includes(`generated against kit schema ${KIT_VERSION}`), 'the fallback must carry its version');
});

/*
 * The prompt hardcoded `weigh-ladder-agent.onrender.com`, which returns an
 * immediate 503 — the service is gone, not asleep. That was the one artefact
 * a builder was told to read, so the public flow was broken. No third-party
 * host may be named: the pointer has to be first-party and self-healing.
 */
test('no third-party host is named as the place to read the contract', () => {
  for (const protocol of ['a2a', 'mcp'] as const) {
    const prompt = createAgentBuildPrompt({ ...BASE, protocol });
    assert.doesNotMatch(prompt, /onrender\.com/, 'the dead reference host must not return');

    // Every URL in the prompt must be one Pokter controls.
    for (const url of prompt.match(/https?:\/\/[^\s)"`]+/g) ?? []) {
      // Illustrative placeholders in the bundled wire format, e.g. "https://…".
      if (/[…]/.test(url)) continue;
      const host = new URL(url).host;
      const firstParty = host === 'pokter.xyz' || host.endsWith('.pokter.xyz');
      const knownFaucet = host === 'www.bnbchain.org' || host === 't.me' || host === 'united-coin-u.github.io';
      assert.ok(firstParty || knownFaucet, `prompt names a host that is neither Pokter's nor a documented faucet: ${host}`);
    }
  }
});

test('a live card is offered as an example, reached through Pokter’s own catalogue', () => {
  const prompt = createAgentBuildPrompt({ ...BASE });
  assert.match(prompt, /https:\/\/pokter\.xyz\/agents lists agents on Pokter/);
  assert.match(prompt, /read one as an example only/);
  assert.match(prompt, /Take nothing normative from a third party's card/);
  assert.match(prompt, /never copy its schema in place of the kit's/);
});

/*
 * The reasoning for fetching rather than transcribing was right in the old
 * prompt and is kept; only the artefact it pointed at was wrong.
 */
test('it keeps the reason for reading the contract instead of being told it', () => {
  const prompt = createAgentBuildPrompt({ ...BASE });
  assert.match(prompt, /a wire format described in prose is the kind of thing a model reproduces confidently and slightly wrong/);
  assert.match(prompt, /the kit states how the hash is canonicalised/);
  assert.match(prompt, /no agent card can tell you/);
});

test('it says what to do when the kit cannot be fetched, without inventing a shape', () => {
  const prompt = createAgentBuildPrompt({ ...BASE });
  assert.match(prompt, /IF YOU CANNOT REACH THE KIT/);
  assert.match(prompt, /proceed on the bundled summary below/);
  // The old fallback sent the assistant back to the user, who does not know.
  assert.match(prompt, /Do not ask me for the wire format/);
  assert.match(prompt, /never fill the gap by guessing/);
  // And the fallback is a real contract, not a gesture at one.
  assert.match(prompt, /negotiation_hash` = keccak256 of the canonical JSON/);
  assert.match(prompt, /Object keys sorted by code point, at every depth/);
});

/*
 * Each of these was absent or thin, counted by grep against the old prompt:
 * duplicate submission 0, restart/recovery 1, the 24-hour assumption 0.
 */
test('it closes the protocol gaps a paid job actually runs through', () => {
  const prompt = createAgentBuildPrompt({ ...BASE });

  // Validating the funded job before working.
  assert.match(prompt, /Before doing the work, read the job from the commerce contract on chain/);
  assert.match(prompt, /`provider` is your own registered wallet/);
  assert.match(prompt, /made to work for free by anyone who can post a job id at it/);

  // Durability, repeated notifications, restart recovery, duplicate submission.
  assert.match(prompt, /state that survives a restart/);
  assert.match(prompt, /resume anything unfinished on boot/);
  assert.match(prompt, /Expect repeated notifications/);
  assert.match(prompt, /must be idempotent/);
  assert.match(prompt, /Prevent duplicate submissions/);

  // The deliverable's bytes.
  assert.match(prompt, /Serve those bytes at that public URL, unchanged/);
  assert.match(prompt, /Write the bytes once, store them, and serve the stored copy/);

  // Price units and the signing domain.
  assert.match(prompt, /integer string in the payment token's smallest unit \(18 decimals\)/);
  assert.match(prompt, /refused as payment-incompatible/);
  assert.match(prompt, /refuse your own expired quotes/);

  // Settlement, and payment actually arriving.
  assert.match(prompt, /Delivering is not being paid/);
  assert.match(prompt, /call `settle` on your own approved jobs/);
  assert.match(prompt, /do not report a delivery as revenue/);
});

/*
 * `success_criteria` is inside the signed hash and had never been
 * documented anywhere a third party could read, which is why no
 * `signed-terms` binding has ever been observed.
 */
test('it tells the agent how to bind itself to the acceptance criteria', () => {
  const prompt = createAgentBuildPrompt({ ...BASE });
  assert.match(prompt, /terms\.success_criteria/);
  assert.match(prompt, /echo the array back unchanged inside the terms you sign/);
  // And that declining to is allowed, so it does not read as a new requirement.
  assert.match(prompt, /Omitting it is allowed and refuses nothing/);
});

/*
 * The hardcoded 24 hours. A job funded from a request proposal runs 1–30
 * days, so an agent that computed `funded + 24h` abandoned a seven-day job
 * six days early — work done, payment lost, and the failure reads as the
 * agent being broken.
 */
test('deadlines come from the job, not from a hardcoded window', () => {
  const prompt = createAgentBuildPrompt({ ...BASE });
  assert.match(prompt, /Deadlines, read and not assumed/);
  assert.match(prompt, /getJob\(job_id\)\.expiredAt/);
  assert.match(prompt, /disputeWindow\(\)/);
  assert.match(prompt, new RegExp(`${PROPOSAL_DELIVER_DAYS.min} to ${PROPOSAL_DELIVER_DAYS.max} days`));
  assert.match(prompt, /Never hardcode either, and never start a timer from when you were notified/);

  // 24 hours may be named as the default; it may not be stated as the rule.
  assert.match(prompt, /24 hours is the default delivery window for a direct hire/);
  assert.doesNotMatch(prompt, /submit within 24 hours/);
  assert.doesNotMatch(prompt, /[Dd]eliver within 24 hours of funding/);
});

/*
 * A2A is the paid path. Picking MCP in the form used to produce a prompt
 * describing an MCP server and nothing else, so the assistant built
 * something Pokter could probe, list and never hire.
 */
test('A2A is required for direct hire even when MCP is the choice', () => {
  const mcp = createAgentBuildPrompt({ ...BASE, protocol: 'mcp' });
  assert.match(mcp, /MCP Streamable HTTP JSON-RPC/);
  assert.match(mcp, /initialize` and `tools\/list/);
  // The point: MCP alone is not enough, and the A2A surface is still required.
  assert.match(mcp, /MCP alone cannot be priced or hired on Pokter today/);
  assert.match(mcp, /an MCP-only agent is unsellable here/);
  assert.match(mcp, /Direct hire runs over A2A, and only over A2A/);
  assert.match(mcp, /GET \/\.well-known\/agent-card\.json/);

  const a2a = createAgentBuildPrompt({ ...BASE, protocol: 'a2a' });
  assert.match(a2a, /Direct hire runs over A2A, and only over A2A/);
  assert.match(a2a, /it is additional and never a substitute/);
  assert.doesNotMatch(a2a, /I picked MCP/);
});

test('the declared interface must carry task-specific inputs and examples', () => {
  const prompt = createAgentBuildPrompt({ ...BASE });
  assert.match(prompt, /task-specific inputs and concrete, complete example briefs/);
  assert.match(prompt, /Name the priced skill after the work/);
  assert.match(prompt, /open to anonymous calls/);
});

/* Produce work, not advice. */
test('it asks for implementation and separates suggestions from what was built', () => {
  const prompt = createAgentBuildPrompt({ ...BASE });
  assert.match(prompt, /Recommend a narrow first version/);
  assert.match(prompt, /"Implemented" and "Suggested, not implemented"/);
  assert.match(prompt, /State your assumptions as you make them/);
  assert.match(prompt, /Do not stop at a plan, and do not describe a plan as though it were a build/);
  assert.match(prompt, /say exactly what you could not do and give me the smallest next step/);
});

test('it warns that a sleeping host fails the probe', () => {
  const prompt = createAgentBuildPrompt({ ...BASE });
  assert.match(prompt, /waits ten seconds/);
  assert.match(prompt, /host that sleeps when idle/);
  assert.match(prompt, /recorded as a failure the agent never saw/);
});

test('it says the record is continuous, public and uneditable', () => {
  const prompt = createAgentBuildPrompt({ ...BASE });
  assert.match(prompt, /record is continuous and public/);
  assert.match(prompt, /no private rehearsal/i);
  assert.match(prompt, /Nothing about the record can be edited/);
});

/* Seven now, including the one that catches an unpayable quote. */
test('it defers the verdict to Pokter’s own checks, all seven', () => {
  const prompt = createAgentBuildPrompt({ ...BASE });
  assert.match(prompt, /seven checks of its own/);
  assert.match(prompt, /the quote can actually be paid from the escrow/);
  assert.match(prompt, /do not describe it to me as working on the strength of your own tests alone/i);
});

/*
 * The build prompt has to tell somebody how to fund the wallet, because
 * registering the identity and submitting a delivery are both transactions
 * and an empty wallet fails at the step the assistant has just called done.
 *
 * Pinned against the faucet constants rather than against literal strings:
 * the point is that the prompt hands over the exact wording the bot expects,
 * and that it is the same wording the wallet panel shows. A copy that drifts
 * is worse than no instructions, because it fails quietly.
 */
test('the build prompt says how to get gas and the payment token', () => {
  const prompt = createAgentBuildPrompt({
    name: '', description: '', category: '', protocol: 'a2a',
  });

  if (!FAUCETS) {
    // Mainnet has no faucet and no business advertising one.
    assert.ok(!/Telegram/i.test(prompt));
    return;
  }

  const bot = FAUCETS.paymentTokenBot;
  assert.ok(bot, 'the testnet config is expected to carry a bot');
  assert.ok(prompt.includes(bot!.handle));
  assert.ok(prompt.includes(bot!.url));

  /*
   * One message, because the bot takes both. Two separate asks would have
   * somebody message it twice for a wallet that is short of each, which is
   * every wallet made for this.
   */
  assert.ok(prompt.includes(bot!.bothAsk.replace('ADDRESS', '0xMY_WALLET')));
  assert.ok(!prompt.includes('ADDRESS'), 'the placeholder must not survive into the prompt');

  // And it must say when to check, not merely where to go.
  assert.match(prompt, /funded before you tell me to register/);
});

/*
 * The kit claimed "the escrow will not let it hire itself", which is false —
 * Pokter's own record has self-hires that COMPLETED. The true cost is that
 * such a job proves nothing, and the practical consequence is that testing
 * the loop needs a second wallet, which nothing used to say.
 */
test('it plans for a second wallet to test a hire from', () => {
  const prompt = createAgentBuildPrompt({ ...BASE });
  if (!FAUCETS) return;
  assert.match(prompt, /second, separate wallet to hire from/);
  assert.match(prompt, /Plan for two wallets and tell me which is which/);
  // It must not revive the claim that the escrow blocks it.
  assert.doesNotMatch(prompt, /will not let it hire itself/);
  assert.match(prompt, /Nothing stops the agent being hired by its own wallet/);
});

test('with mainnet hires open, it offers both chains with their exact tokens', () => {
  const prompt = createAgentBuildPrompt({ ...BASE }, { mainnetEscrow: true });
  assert.match(prompt, /register the identity on chain 56, quote in mainnet \$U \(0xcE24439F2D9C6a2289F741120FE202248B666666\)/);
  assert.match(prompt, /quote in testnet \$U \(0xc70B8741B8B07A6d61E54fd4B20f22Fa648E5565\)/);
  assert.match(prompt, /must all name the same chain/);
  assert.match(prompt, /needs real BNB for gas on chain 56/);
  assert.doesNotMatch(prompt, /every escrow settles on/);
});

test('with mainnet hires closed, it keeps every escrow on testnet', () => {
  const prompt = createAgentBuildPrompt({ ...BASE }, { mainnetEscrow: false });
  assert.match(prompt, /every escrow settles on BNB Smart Chain Testnet/);
  assert.doesNotMatch(prompt, /needs real BNB for gas/);
});

test('an agent built from the prompt names Pokter Studio as its maker, exactly', () => {
  const prompt = createAgentBuildPrompt({
    name: 'Treasury Sentinel',
    description: 'Returns a sourced treasury risk report.',
    category: 'yield',
    protocol: 'a2a',
    target: 'Stablecoins',
    policy: 'Capital preservation',
    output: 'Risk report',
  });
  // The same field other builders' agents use, with Pokter's own value.
  assert.ok(prompt.includes('"built_with": "Pokter Studio · https://pokter.xyz/studio"'));
  assert.match(prompt, /agent card's `metadata` object and in the `metadata` of every delivery manifest/);
  // Renumbered, not dropped: the verification checklist still closes the build.
  assert.match(prompt, /10\. End with a verification checklist/);
});

/*
 * Claims discipline. The block used to say "Public repository" and assert
 * these were the form's fields "in its order"; the form's field is "Source
 * repository" and it is optional. A prompt that misreports the form it is
 * feeding is the same defect class as a row claiming an agreement that
 * never happened.
 */
test('the listing block does not overclaim what the form asks for', () => {
  const prompt = createAgentBuildPrompt({ ...BASE });
  assert.doesNotMatch(prompt, /Public repository/);
  assert.match(prompt, /- Source repository: \(public, and optional/);
  // The kit version is in the block but is not a form field, and says so.
  assert.match(prompt, /The kit version is not asked for by the form/);
});

/*
 * Nothing in the prompt may promise an outcome. The generator describes a
 * protocol; it cannot know whether anybody will pay, and a pasted prompt
 * deploys nothing on its own.
 */
test('it promises no earnings, hosting or production readiness', () => {
  for (const protocol of ['a2a', 'mcp'] as const) {
    for (const mainnetEscrow of [true, false]) {
      const prompt = createAgentBuildPrompt({ ...BASE, protocol }, { mainnetEscrow });
      for (const claim of [
        /will earn/i,
        /guaranteed income/i,
        /production[- ]ready once/i,
        /we will deploy/i,
        /this prompt deploys/i,
        /campaign eligib/i,
      ]) {
        assert.doesNotMatch(prompt, claim, `prompt must not promise: ${claim}`);
      }
    }
  }
});
