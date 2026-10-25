import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

import { createAgentBuildPrompt, promptInputFrom } from '../src/lib/builder/ai-prompt';
import { PROPOSED_CONCEPT_COUNT } from '../src/lib/builder/concepts';
import { BUILD_STYLES, RECOMMEND_AND_BUILD_BRIEF } from '../src/lib/builder/style';
import { DEFAULT_PLAN } from '../src/lib/builder/drafts';
import { RUNTIME_OPTIONS } from '../src/lib/builder/runtime';
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
  /*
   * This input carries a direction, so the prompt must not propose
   * concepts at all. It used to ask for three unconditionally, which meant
   * a builder who had already written what they wanted was offered three
   * alternatives to it.
   */
  assert.doesNotMatch(prompt, /meaningfully different concepts/);
  assert.match(prompt, /I already have a direction/);
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
  /* Was "echo the array back unchanged inside the terms you sign", which
     reads as hash-them-unchanged and costs the hire on a bracket. */
  assert.match(prompt, /echo the array back inside the terms you sign, in the order it arrived/);
  assert.match(prompt, /before hashing/);
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

/* Seven, including the one that catches an unpayable quote — and stated
   from the same list as the section that introduces them, because the two
   passages used to say six and seven. */
test('it defers the verdict to Pokter’s own checks, all seven', () => {
  const prompt = createAgentBuildPrompt({ ...BASE });
  assert.match(prompt, /Pokter runs the same seven checks named above/);
  assert.match(prompt, /lists an agent on seven checks/);
  assert.match(prompt, /that the quote can be paid from the escrow/);
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
  /*
   * Neither wrong version may come back. "The escrow will not let it hire
   * itself" is refuted by testnet job 1444, a self-hire that COMPLETED;
   * "nothing stops it" is refuted by `useHire`, which disables the Hire
   * button. The block is Pokter's hire page, and that is what it says.
   */
  assert.doesNotMatch(prompt, /will not let it hire itself/);
  assert.doesNotMatch(prompt, /Nothing stops the agent being hired by its own wallet/);
  assert.match(prompt, /hire page refuses it/i);
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


/*
 * The five corrections to the building experience, each pinned where it
 * can actually fail: in the text that gets copied into somebody's
 * assistant. The mode buttons were already correct on the page while the
 * copied prompt expressed no style at all and opened with a questionnaire,
 * so asserting the buttons would have proved nothing.
 */

test('Recommend and build is the default, in the prompt and not only on the page', () => {
  /* Omitted entirely — the case both pages hit before they passed a style. */
  const defaulted = createAgentBuildPrompt({ ...BASE });
  assert.match(defaulted, /HOW I WANT THIS DECIDED — recommend and build/);
  assert.equal(promptInputFrom({}).style, 'recommend');
  assert.equal(DEFAULT_PLAN.style, 'recommend', 'the stored default no longer agrees with the prompt');
  assert.equal(BUILD_STYLES[0].id, 'recommend', 'the first style offered is no longer the default one');

  /* And the other style is genuinely available, not just listed. */
  const withMe = createAgentBuildPrompt({ ...BASE, style: 'with-me' });
  assert.match(withMe, /HOW I WANT THIS DECIDED — build with me/);
  assert.match(withMe, /offer me the choices you would otherwise take yourself/i);
});

test('a builder who already has an idea is not sent through discovery', () => {
  /* A description alone is a direction. A name alone is not — see below. */
  for (const input of [
    { ...BASE, description: 'Returns a read-only Venus risk report.' },
    { ...BASE, category: 'yield' },
  ]) {
    const prompt = createAgentBuildPrompt(input);
    assert.match(prompt, /I already have a direction/);
    assert.doesNotMatch(prompt, /meaningfully different concepts/);
    /* The six-part interview the prompt used to open with. */
    assert.doesNotMatch(prompt, /Begin by asking about my experience/);
    assert.doesNotMatch(prompt, /DISCOVERY FIRST/);
    assert.match(prompt, /Do not run a discovery questionnaire/);
    assert.match(prompt, /Do not ask me about my experience, my intended users, my risk tolerance or my preferred data sources/);
    /* The target experience: a recommendation and one question. */
    assert.match(prompt, /Open with your recommendation and the reasoning for it/);
    assert.match(prompt, /shall I build it\?/);
  }
});

test('with no idea it proposes options, recommends one, and takes "choose for me"', () => {
  const prompt = createAgentBuildPrompt({ ...BASE });
  assert.match(prompt, new RegExp(`Put forward ${PROPOSED_CONCEPT_COUNT} meaningfully different concepts`));
  assert.match(prompt, /Recommend one and say why you would start there/);
  /*
   * Was: start "if I reply without picking one". A clarifying question is
   * a reply, so that read a question as a yes — and the style panel has
   * always promised the opposite, in the same words, two screens away:
   * "Changes nothing until you choose. Saying nothing is not agreement."
   */
  assert.doesNotMatch(prompt, /reply without picking one/);
  assert.match(prompt, /Start on one of two things and nothing else: I pick a concept, or I say "choose for me"/);
  assert.match(prompt, /is not approval/);
  assert.doesNotMatch(prompt, /Begin by asking about my experience/);
  /* The brief's own fallbacks have to agree with the section above it. The
     direction line used to read "Not defined—discover it with me", which
     invited the discovery the section had just refused. */
  assert.doesNotMatch(prompt, /discover it with me/);
  assert.match(prompt, /Do not interview me for it/);
  assert.match(prompt, /pick a provisional one and keep going/);
});

/*
 * The name gate, which was explicit: "do not begin coding until I choose
 * or refine one concept and name". A name is a label on an idea and the
 * cheapest thing in the build to change, so nothing waits for it.
 */
test('a name never blocks the build, and having only a name is not a direction', () => {
  const prompt = createAgentBuildPrompt({ ...BASE });
  assert.doesNotMatch(prompt, /begin coding until I choose or refine one concept and name/);
  assert.match(prompt, /Do not wait on a name/);
  assert.match(prompt, /provisional and trivial to change later/);

  /* A name with nothing behind it still needs concepts proposing. */
  const named = createAgentBuildPrompt({ ...BASE, name: 'Position Guardian' });
  assert.match(named, /Position Guardian/, 'the name was dropped from the brief');
  assert.match(named, new RegExp(`Put forward ${PROPOSED_CONCEPT_COUNT} meaningfully different concepts`));
});

test('routine choices are delegated and only four things come back to the builder', () => {
  const prompt = createAgentBuildPrompt({ ...BASE });
  assert.match(prompt, /WHAT YOU DECIDE, AND WHAT YOU ASK ME/);
  for (const routine of [/the framework and language/, /the file layout/, /the test strategy/, /which libraries to use/]) {
    assert.match(prompt, routine);
  }
  assert.match(prompt, /Do not present these as questions/);

  /* The four that are genuinely the builder's, each with its reason. */
  assert.match(prompt, /Anything needing my wallet to sign/);
  assert.match(prompt, /Prepare it unsigned/);
  assert.match(prompt, /spends money I have not already agreed to, including paid hosting/);
  assert.match(prompt, /trades off security or exposure/);
  assert.match(prompt, /What the agent is for, if that was never settled/);
  /* And the line that is never negotiable, in the prompt as well as the UI. */
  assert.match(prompt, /Never ask me for a private key or a recovery phrase/);
});

/*
 * Point 4, and the reason the other four could regress quietly. The prompt
 * is copied from two pages. Both called `createAgentBuildPrompt`, which
 * looked like one source, and then built its argument separately — the
 * standalone builder hardcoded `protocol: 'a2a'` and passed no style. The
 * same idea produced two different prompts.
 *
 * This generates both pages' inputs the way the pages now do and compares
 * the whole text, so a field added to one and not the other fails here
 * rather than in a prompt nobody reads twice.
 */
test('both pages generate the same prompt for the same idea', () => {
  const idea = { name: 'Treasury Sentinel', description: 'Returns a sourced treasury risk report.', categoryId: 'yield' } as const;

  /* The standalone prompt builder: three fields and a style. */
  const standalone = createAgentBuildPrompt(promptInputFrom({ ...idea, style: 'recommend' }));

  /* The guided Configure step: the same fields off a live draft, with the
     category's first runtime options, which is what its defaults resolve to. */
  const options = RUNTIME_OPTIONS[idea.categoryId];
  const guided = createAgentBuildPrompt(
    promptInputFrom({
      ...idea,
      protocol: 'a2a',
      style: 'recommend',
      runtime: { target: options.target[0], policy: options.policy[0], output: options.output[0] },
    }),
  );

  assert.equal(standalone, guided, 'the two pages describe the same idea differently');
});

test('the shared derivation fills what a page does not ask for', () => {
  const input = promptInputFrom({ name: '  Spaced  ', categoryId: 'yield' });
  assert.equal(input.name, 'Spaced', 'the name was not trimmed');
  assert.equal(input.category, CATEGORIES.find((c) => c.id === 'yield')!.label, 'the category id was not resolved to its label');
  assert.equal(input.protocol, 'a2a', 'a page that does not offer a protocol no longer defaults to A2A');
  /* Runtime defaults come from the category, so neither page carries a copy. */
  assert.equal(input.target, RUNTIME_OPTIONS.yield.target[0]);
  assert.equal(input.policy, RUNTIME_OPTIONS.yield.policy[0]);
  assert.equal(input.output, RUNTIME_OPTIONS.yield.output[0]);

  /* An unknown category must not invent runtime text. */
  const unknown = promptInputFrom({ categoryId: 'not-a-category' });
  assert.equal(unknown.category, '');
  assert.equal(unknown.target, '');
});

test('the concept count is one number, and the style panel counts its own list', () => {
  assert.equal(PROPOSED_CONCEPT_COUNT, 3);
  /* The panel said five while the prompt said three. It now reads from the
     list it renders, so the two cannot disagree again. */
  const behaviour = BUILD_STYLES.find((style) => style.id === 'recommend')!.behaviour.join(' ');
  assert.doesNotMatch(behaviour, /five concepts/);
  assert.match(behaviour, /puts forward \d+ concepts/);
});

/*
 * Both pages are client components, so the wiring is asserted as a source
 * fact — the pattern `tests/provider-route-wiring.test.mts` uses. Comments
 * are stripped first, so the comments above these call sites cannot
 * satisfy the assertions they describe.
 */
const source = (path: string) =>
  readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

test('neither page builds the prompt input itself any more', () => {
  const standalone = source('features/build/PromptBuilder.tsx');
  const guided = source('features/studio/useAgentDraft.ts');

  for (const [name, text] of [['the prompt builder', standalone], ['the guided step', guided]] as const) {
    assert.match(text, /promptInputFrom\(/, `${name} no longer derives its input from the shared helper`);
    /* The fields each page owns go in; the label lookup and the runtime
       defaults come out. A page resolving its own category label is the
       drift this replaced. */
    assert.doesNotMatch(text, /CATEGORIES\.find\(\(c\) => c\.id === (category|draft\.category)\)/, `${name} resolves the category label itself again`);
  }

  /* The standalone page hardcoded A2A and passed no style at all. */
  assert.doesNotMatch(standalone, /protocol: 'a2a'/, 'the prompt builder hardcodes the protocol again');
  assert.match(standalone, /style/, 'the prompt builder does not pass a style');
});

test('the prompt page offers the same style switch as the guided flow', () => {
  const standalone = source('features/build/PromptBuilder.tsx');
  assert.match(standalone, /<BuildStyleSwitch/, 'the prompt page has no style switch');
  assert.match(standalone, /useState<BuildStyle>\('recommend'\)/, 'the prompt page does not default to Recommend and build');

  /* And the guided flow's default comes from the stored plan, not a literal. */
  const guided = source('features/studio/useAgentDraft.ts');
  assert.match(guided, /style: readLastStyle\(\)/, 'the guided flow no longer restores the remembered style');
  assert.match(guided, /style: plan\.style/, 'the guided flow does not pass its style into the prompt');
});

/*
 * Three surfaces hand an assistant a brief, not two: the guided step, the
 * standalone prompt builder, and the Pokter MCP section — which the page
 * marks "Recommended" and which therefore reaches more builders than the
 * other two together.
 *
 * That one ended "Ask me what the agent should do before writing
 * anything", so the most prominent route on the page was the one
 * instructing the questionnaire the other two had just stopped doing. The
 * mode buttons were correct throughout.
 */
test('the recommended MCP route does not ask first either', () => {
  const mcp = source('features/build/BuildWithAI.tsx');
  assert.doesNotMatch(mcp, /Ask me what the agent should do before writing anything/);
  assert.match(mcp, /RECOMMEND_AND_BUILD_BRIEF/, 'the MCP brief no longer carries the shared stance');
  /* Still asks for the thing it legitimately needs: the five checks. */
  assert.match(mcp, /call integration_kit for the current requirements/);
});

test('the short and long forms of the default agree on what it commits to', () => {
  const long = createAgentBuildPrompt({ ...BASE });

  /* The short form is one string, so it cannot drift from itself. What can
     drift is the long form quietly dropping one of these. */
  assert.match(RECOMMEND_AND_BUILD_BRIEF, /Do not interview me before you start/);
  assert.match(RECOMMEND_AND_BUILD_BRIEF, /choose for me/);
  assert.match(RECOMMEND_AND_BUILD_BRIEF, /Do not wait on a name/);
  assert.match(RECOMMEND_AND_BUILD_BRIEF, /Never ask me for a private key or a recovery phrase/);

  for (const commitment of [/choose for me/, /Do not wait on a name/, /Never ask me for a private key or a recovery phrase/]) {
    assert.match(long, commitment, 'the long prompt dropped a commitment the short brief still makes');
  }
});

/* The page's own description of the blank case, which said it would ask. */
test('the page does not promise a questionnaire the prompt no longer runs', () => {
  const page = source('app/(site)/build/(section)/new/assistant/page.tsx');
  assert.doesNotMatch(page, /leave them blank and it will ask you/);
  assert.match(page, /propose a few and recommend one/);

  /* The empty category reads as a decision to delegate, not a question
     queued up for later. */
  const standalone = source('features/build/PromptBuilder.tsx');
  assert.doesNotMatch(standalone, /Let the assistant ask/);
  assert.match(standalone, /Let the assistant choose/);
});

/*
 * Three defects the fresh-session acceptance test turned up, each of which
 * produces a signature or a verdict that is valid and refused — the
 * expensive kind, because nothing visibly breaks.
 */

test('the listing checks are stated once and the two passages agree', () => {
  const prompt = createAgentBuildPrompt({ ...BASE });
  /* It said "six checks" in one section and "seven checks of its own" in
     another, the second adding whether the quote can be paid. */
  assert.doesNotMatch(prompt, /lists an agent on six checks/);
  assert.equal(prompt.match(/that the quote can be paid from the escrow/g)?.length, 2, 'the two passages no longer list the same checks');

  /* And the one no build can satisfy is named rather than left to look
     like a defect in the builder's own code. */
  assert.match(prompt, /independent attestations, which no code can satisfy/);
  assert.match(prompt, /Expect that one to read unknown/);
});

test('it says the signature is over the raw bytes, not the hex string', () => {
  const prompt = createAgentBuildPrompt({ ...BASE });
  /* "an EIP-191 signature of that hash" is ambiguous in the one direction
     that costs money: signing the hex string recovers to the right wallet
     and is still refused. */
  assert.doesNotMatch(prompt, /EIP-191 signature of that hash/);
  assert.match(prompt, /signMessage\(\{ message: \{ raw: negotiation_hash \} \}\)/);
  assert.match(prompt, /raw 32 bytes/);
  assert.match(prompt, /Signing the hex string instead produces a signature that is valid, recoverable, and refused/);
});

test('it says to sanitise the criteria before hashing them', () => {
  const prompt = createAgentBuildPrompt({ ...BASE });
  /* "echo the array back unchanged inside the terms you sign" reads as
     hash-them-unchanged. Pokter sanitises every element before it
     recomputes, so a bracketed criterion hashed raw is terms-mismatch. */
  assert.doesNotMatch(prompt, /echo the array back unchanged inside the terms you sign/);
  assert.match(prompt, /Apply the kit's character substitutions to each criterion \*\*before hashing\*\*/);
  assert.match(prompt, /refused as terms-mismatch for a signature that was perfectly correct/);
});

/*
 * Consent, stated the same way everywhere it is stated.
 *
 * Three surfaces said a build could begin on a reply that picked nothing:
 * the long prompt's two branches and the short brief the MCP section
 * carries. The style panel said the opposite in the same product — and a
 * fresh session given the text proved the risk rather than describing it,
 * signing off with "say go (or nothing in particular) and I'll start".
 *
 * The cost is asymmetric. Waiting one extra turn for a yes is a small
 * delay; building on a misread question spends the builder's time on an
 * agent they did not choose, and they find out after it exists.
 */
test('nothing starts a build except a choice or an explicit go', () => {
  const noIdea = createAgentBuildPrompt({ ...BASE });
  const withIdea = createAgentBuildPrompt({ ...BASE, description: 'Reports a Venus position read-only.' });

  for (const [label, prompt] of [['no idea', noIdea], ['a direction', withIdea]] as const) {
    assert.doesNotMatch(prompt, /reply without picking one/, label);
    assert.doesNotMatch(prompt, /answer without changing the direction/, label);
  }

  /* With nothing chosen: two starts, named, and everything else refused. */
  assert.match(noIdea, /I pick a concept, or I say "choose for me"/);
  assert.match(noIdea, /a question, a remark, a half-answer, silence — is not approval/);
  assert.match(noIdea, /Answer what I asked and put the choice back to me/);

  /* With a direction: a question back is a question, not a yes. */
  assert.match(withIdea, /Build it when I agree/);
  assert.match(withIdea, /that is a question and not approval: answer it and ask me again/);

  /* And the short form the MCP route carries says the same. */
  assert.doesNotMatch(RECOMMEND_AND_BUILD_BRIEF, /reply without picking one/);
  assert.match(RECOMMEND_AND_BUILD_BRIEF, /Those are the only two starts/);
  assert.match(RECOMMEND_AND_BUILD_BRIEF, /is not approval/);
});

/*
 * The other half of the instruction: once chosen, get on with it. Needing
 * a yes to start must not become needing a yes for every decision after
 * it, which would be the questionnaire again by a different route.
 */
test('a choice buys the whole build, not one step of it', () => {
  const prompt = createAgentBuildPrompt({ ...BASE });
  assert.match(prompt, /Once I have chosen, build it\. Do not come back to confirm the routine decisions/);
  assert.match(RECOMMEND_AND_BUILD_BRIEF, /Do not come back for the routine decisions; they are yours/);
  /* The four that still come back are unchanged. */
  assert.match(prompt, /Anything needing my wallet to sign/);
});

/*
 * A name is still not a gate. "Pick the name yourself" and "wait for me to
 * pick the concept" are easy to collapse into each other, and collapsing
 * them either way loses one of the two instructions.
 */
test('choosing a name is still the assistant’s, and is not choosing the concept', () => {
  const prompt = createAgentBuildPrompt({ ...BASE });
  assert.match(prompt, /Do not wait on a name/);
  assert.match(prompt, /Choosing a name for me is not the same as choosing the concept for me, which I have to say/);
  assert.match(RECOMMEND_AND_BUILD_BRIEF, /Do not wait on a name/);
});
