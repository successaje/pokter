import { CATEGORIES, NO_CATEGORY } from '@/lib/agents/categories';
import { FAUCETS, MAINNET_ESCROW, NATIVE_SYMBOL } from '@/lib/network/presentation';
import { ESCROW_PAYMENT_TOKEN } from '@/lib/network/escrow';
import { BUILT_WITH_KEY, BUILT_WITH_POKTER } from '@/lib/brand/built-with';
import { CANONICAL_RULES, JOB_DEADLINE_FIELD, KIT_VERSION, TIMING } from '@/lib/integration/guide';
import { PROPOSED_CONCEPT_COUNT } from '@/lib/builder/concepts';
import { RUNTIME_OPTIONS } from '@/lib/builder/runtime';
import type { BuildStyle } from '@/lib/builder/drafts';

export type AgentBuildPromptInput = {
  name: string;
  description: string;
  category: string;
  protocol: 'a2a' | 'mcp';
  target?: string;
  policy?: string;
  output?: string;
  /**
   * How the builder wants to be helped, carried into the prompt itself.
   *
   * The two styles existed as buttons on the page while the copied prompt
   * expressed neither, so the default the product advertises — Pokter
   * proposes and decides — stopped at the edge of the textarea. The prompt
   * is the only part of this that reaches the assistant doing the work, so
   * a style the prompt does not state is a style that does not happen.
   */
  style?: BuildStyle;
};

/**
 * What the marketplace actually calls, as opposed to what a well-built
 * service happens to expose.
 *
 * An agent can answer every probe Pokter sends and still be impossible to
 * hire: probing is a GET on the agent card, and the two things a sale needs
 * — a signed quote and a delivery — are never exercised by it. Of the
 * agents in the catalogue that have ever returned a signed price, most
 * quote in the wrong chain's token, which verifies honestly and still
 * cannot be paid from the escrow. Both failures are silent and both are
 * decided while the agent is being written, so they belong in the prompt
 * that writes it.
 */
/**
 * The checks a listing is graded on, written once.
 *
 * The prompt stated them twice and the two disagreed: "six checks" in the
 * section explaining what Pokter calls, "seven checks of its own" in the
 * verification step, which added the one that decides whether a quote can
 * actually be paid. A builder reading both learned that one of them was
 * wrong without learning which.
 *
 * Seven is the honest count of what a build can reach. Pokter's
 * compatibility API reports them at finer grain — it splits capabilities
 * into notify_funded, a named priced skill and example briefs — and adds
 * independent attestations, which no amount of code produces because it
 * needs somebody else to hire the agent. That last one is named here
 * rather than quietly dropped, because a builder who is told the build is
 * unfinished until every check passes will otherwise go hunting for a
 * defect that is not theirs.
 */
const LISTING_CHECKS = [
  'an ERC-8004 identity',
  'a published endpoint',
  'answering when called',
  'published capabilities',
  'a signed price quote',
  'that the quote can be paid from the escrow',
  'a marketplace category',
] as const;

const CHECK_COUNT_WORD = 'seven';

/** "a, b and c" — a list a person reads, not an array joined by commas. */
const CHECKS_SENTENCE = `${LISTING_CHECKS.slice(0, -1).join(', ')} and ${LISTING_CHECKS[LISTING_CHECKS.length - 1]}`;

const ESCROW_CHAIN_ID = 97;

/**
 * Where the contract comes from, and who owns it.
 *
 * This prompt used to send the assistant to a third-party agent card on
 * somebody else's host — `weigh-ladder-agent.onrender.com` — as its
 * reference for the wire format, with a comment conceding that the host
 * sleeps. That made a stranger's deployment the authority on Pokter's own
 * protocol: when it slept, the assistant had nothing; when it changed, the
 * assistant learned a contract Pokter never promised; and the first-party
 * kit, which is live, versioned and generated from the running constants,
 * was not mentioned anywhere in 174 lines.
 *
 * So the kit is the authority and the card is an example, clearly labelled
 * as one. The two surfaces are the same document: the page for a human, the
 * JSON for a script or an agent.
 */
const KIT_JSON = 'https://pokter.xyz/api/v1/integration';
const KIT_PAGE = 'https://pokter.xyz/build/integration';

/**
 * Where to find a live card to look at, without naming one.
 *
 * The prompt used to hardcode `weigh-ladder-agent.onrender.com`. That URL
 * returns 503 — immediately and repeatedly, so it is not a sleeping host
 * being slow but a service that is gone. Shipping it was the dead-link
 * defect this repo keeps making: the one artefact a builder was told to
 * read, on somebody else's host, down.
 *
 * Naming a different third-party card would rot the same way, so the
 * pointer is first-party and self-healing instead: Pokter's own catalogue,
 * filtered to agents that have signed a price, which is exactly the set
 * whose cards work. The kit already carries a complete worked example, so
 * nothing here is load-bearing — this is for a builder who wants to see a
 * real implementation beside the spec.
 */
const EXAMPLE_AGENT_SOURCE = 'https://pokter.xyz/agents';
const ESCROW_CHAIN_NAME = 'BNB Smart Chain Testnet';

/**
 * The categories, from the list the listing form renders.
 *
 * Hand-kept here as "rebalancing, grid-trading, yield, health-factor"
 * while `CATEGORIES` had five and the form also offered "none of these
 * fits". The prompt therefore told every builder to pick one of four, so
 * a token-safety agent — a real category, and the subject of the kit's own
 * worked example — was steered into claiming a category that describes
 * something it does not do. Generated now, so the set cannot drift again.
 */
function categoryChoices(): string {
  return [...CATEGORIES.map((c) => c.id as string), NO_CATEGORY].join(', ');
}

function categoryGuide(): string {
  return CATEGORIES.map((c) => `  - ${c.id}: ${c.blurb}`).join('\n');
}

/**
 * How to get the two test tokens, written into the prompt rather than left
 * for the builder to discover.
 *
 * Registering an identity is a transaction and submitting a delivery is a
 * transaction, so an unfunded wallet stops the build at the step the
 * assistant has just declared finished — and the failure it produces reads
 * as a bug in the agent rather than an empty wallet. The asks are taken
 * from the same constants the wallet panel shows, so the wording a builder
 * is told to send is the wording that works, and there is one place to fix
 * it when the bot changes.
 *
 * Empty on mainnet, where none of this applies.
 */
function fundingSection(mainnetEscrow: boolean): string {
  if (!FAUCETS) return '';
  const bot = FAUCETS.paymentTokenBot;
  const viaBot = bot
    ? `- Both come from the same Telegram bot, ${bot.handle} (${bot.url}), and it takes both in one message. Tell me to open it and send, with my own wallet in place of the address:
  "${bot.bothAsk.replace('ADDRESS', '0xMY_WALLET')}"
- The web faucet at ${FAUCETS.native} is the alternative for gas, but it asks the wallet to have mainnet history, so a fresh wallet will be turned away and the bot is the reliable route. ${FAUCETS.paymentToken} is the alternative for the payment token.`
    : `- Gas comes from ${FAUCETS.native} and the payment token from ${FAUCETS.paymentToken}.`;

  return `

FUNDING THE WALLETS, BEFORE ANY OF IT WORKS
- Registering the ERC-8004 identity costs gas, and every delivery the agent submits on chain costs gas, so the wallet that owns the identity needs ${NATIVE_SYMBOL} on chain ${ESCROW_CHAIN_ID} before either can happen.
- Testing the loop end to end needs a second, separate wallet to hire from, holding both ${NATIVE_SYMBOL} and the escrow payment token. Pokter's own hire page refuses it: the Hire button is disabled when the connected wallet is the agent's provider. The escrow itself does not refuse — one testnet self-hire has completed — but six of the seven ever funded expired undelivered, and Pokter excludes a hire whose buyer is its seller from the delivery figures on your agent's page. So fund the test from a second wallet: it is the only way the hire page will let you, and the only way the run counts. Plan for two wallets and tell me which is which.
- All of these are test tokens, all free, and none has any real value.
${viaBot}
${mainnetEscrow ? `- If I chose mainnet, none of the above applies: the wallet needs real BNB for gas on chain 56, and nobody gives that away.
` : ''}- Check with me that the wallets are funded before you tell me to register or to submit anything. An empty wallet fails at exactly the step you have just called finished, and the error it returns looks like a bug in the agent rather than an empty wallet.`;
}

/**
 * Where the agent is paid, which decides the chain it registers on, the token
 * it quotes in and the chain it signs for. Mirrors `escrowChainForHire`: a
 * price in a token an enabled escrow settles in is hired on that escrow.
 */
function chainsSection(mainnetEscrow: boolean): string {
  if (!mainnetEscrow) {
    return `WHICH CHAINS THIS AGENT LIVES ON
- Identity: register the ERC-8004 agent on BNB Chain mainnet (56) or BNB Smart Chain Testnet (97). Pokter lists both.
- Money: every escrow settles on ${ESCROW_CHAIN_NAME} (chain ${ESCROW_CHAIN_ID}), whichever chain the identity is on. Payment is a test token with no real value.
- Therefore: quote in the payment token of chain ${ESCROW_CHAIN_ID} (${ESCROW_PAYMENT_TOKEN[97]}), and bind the quote's signing domain to chain ${ESCROW_CHAIN_ID}. A quote priced in mainnet currency, or signed for chain 56, verifies correctly and still cannot be paid from this escrow — the agent will reject or never receive the job, and the buyer waits out the deadline for nothing. Confirm the address against the kit's \`escrows\` before you use it, and do not guess it.
- If the identity is on mainnet while escrow is on testnet, the agent cannot see the job at all and Pokter's own seller delivers on its behalf. Registering on chain ${ESCROW_CHAIN_ID} is what lets the agent earn its own record.`;
  }
  return `WHICH CHAINS THIS AGENT LIVES ON
- Pokter lists ERC-8004 agents on BNB Chain mainnet (56) and BNB Smart Chain Testnet (97), and funds each hire on the escrow that can pay the agent's signed price. Choose one with me before writing code:
  - Paid in real money: register the identity on chain 56, quote in mainnet $U (${ESCROW_PAYMENT_TOKEN[56]}), and bind the quote's signing domain to chain 56. Buyers hire it from a browser wallet and the agent is paid directly.
  - Free to try: register on chain ${ESCROW_CHAIN_ID}, quote in testnet $U (${ESCROW_PAYMENT_TOKEN[97]}), and bind the signing domain to chain ${ESCROW_CHAIN_ID}. Payment is a test token with no real value.
- Identity chain, quote token and signing domain must all name the same chain. The agent watches the escrow on its own chain, so a quote for the other chain verifies correctly and still cannot be paid there — the job is funded somewhere the agent never looks, and the buyer waits out the deadline for nothing.
- An agent on mainnet that signs no price is hired on testnet, where Pokter's own seller carries the task to it. Signing a price is what lets it be hired, and paid, on its own chain.`;
}

/**
 * The paid path is A2A, whatever else the agent also speaks.
 *
 * The kit has always said it — "prices and hires go over A2A. MCP alone can
 * be measured but not priced" — and the prompt did not: picking MCP in the
 * form produced a prompt describing an MCP server and nothing else, so an
 * assistant following it built something Pokter could probe, list and never
 * hire. MCP stays worth building as an additional surface; it is not an
 * alternative to the one that takes money.
 */
function transportSection(protocol: 'a2a' | 'mcp'): string {
  const a2a = `- Direct hire runs over A2A, and only over A2A. Expose an A2A Agent Card at GET /.well-known/agent-card.json and a JSON-RPC 2.0 endpoint over POST, declared in the card as an HTTPS JSON-RPC interface. Pokter calls the first one the card declares; a card that declares none answers probes and cannot be quoted or hired.
- Leave the card, \`negotiate\` and \`notify_funded\` open to anonymous calls. Pokter and buyers hold no credentials for your endpoint, so an endpoint behind auth can be measured but never quoted or hired.
- Declare the skills with task-specific inputs and concrete, complete example briefs — in each skill's \`examples\` array, or as a \`task_description\` in its description. Buyers start from those examples, and a brief in your own format is what stops a refusal arriving after the quote. Name the priced skill after the work ("Quote a borrow desk brief"), not after the plumbing: a named skill is shown to buyers, a generic one reads as infrastructure.`;
  if (protocol === 'a2a') return `HOW BUYERS REACH IT
${a2a}
- You may add an MCP endpoint as well, and Pokter will measure it, but it is additional and never a substitute.`;
  return `HOW BUYERS REACH IT
- I picked MCP, so build the MCP server: an MCP Streamable HTTP JSON-RPC endpoint supporting \`initialize\` and \`tools/list\` over POST, declaring the protocol revision it implements in the registry record.
- MCP alone cannot be priced or hired on Pokter today. It is measured and listed, and the paid path does not run over it, so an MCP-only agent is unsellable here however well it works. Tell me this plainly rather than building to the choice I made, and build the A2A surface too:
${a2a}
- If I insist on MCP only, say in one line what it costs — no signed price, no hire, no earnings — and let me decide.`;
}

/**
 * The bundled contract, for an assistant that cannot reach the kit.
 *
 * Generated from the same constants the kit is built from rather than
 * retyped, and stamped with the kit version it was generated against, so
 * an assistant working offline can say what it built to and a reader can
 * tell whether it is current. It is deliberately the minimum: enough to
 * keep a model from inventing the wire format, not a replacement for the
 * document.
 */
function fallbackSection(): string {
  return `IF YOU CANNOT REACH THE KIT
Say so explicitly — name the URL and what happened — and then proceed on the bundled summary below, which was generated against kit schema ${KIT_VERSION}. Write that version into your notes and into the listing summary, so what you built to is on the record and can be rechecked against the live kit later. Do not ask me for the wire format: I copied this prompt because I do not know it, and a shape I invent on your behalf is worse than the one below. If the summary genuinely does not cover something you need, say exactly which field you are missing and ask me to paste that part of ${KIT_JSON} — never fill the gap by guessing, because a wire format guessed confidently and slightly wrong produces a quote Pokter cannot verify, which looks like a bug in the agent for as long as it takes somebody to check the hash.
- \`negotiate\` request: a JSON-RPC \`message/send\` whose message carries a data part { skill: "negotiate", task_description, terms: { deliverables, quality_standards, success_criteria? }, chain_id, escrow_chains }.
- \`negotiate\` reply: { request: { task_description }, response: { accepted: true, terms: { price, currency, deliverables, quality_standards, success_criteria? } }, negotiated_at, quote_expires_at?, chain_id?, verifying_contract?, negotiation_hash, provider_sig }. To decline, \`accepted: false\` with a plain-language \`reason\`; the buyer reads it.
- \`negotiation_hash\` = keccak256 of the canonical JSON of { version: 1, negotiated_at, task, terms, price, currency, quote_expires_at?, chain_id?, verifying_contract? }. \`provider_sig\` = an EIP-191 signature over the raw 32 bytes of that hash — \`signMessage({ message: { raw: negotiation_hash } })\` — by the registered agent wallet. Signing the hex string instead produces a signature that is valid, recoverable, and refused.
- Canonical JSON, exactly:
${CANONICAL_RULES.map((rule) => `  - ${rule}`).join('\n')}
- \`notify_funded\` request: { skill: "notify_funded", job_id }. Reply { status: "accepted" | "rejected", job_id } immediately; do the work afterwards.
- Delivery: commerce.submit(jobId, deliverable, optParams), where \`deliverable\` is keccak256 of the exact bytes served and \`optParams\` is the UTF-8 bytes of { "deliverable_url": "https://…" }.
- Deadlines: ${TIMING.rules[0]}`;
}

/**
 * What the builder has already settled, and what is still open.
 *
 * A direction is a description or a category — something that says what the
 * agent is for. A name is neither: it is a label on an idea, and waiting
 * for one is the clearest way to stall a build that could otherwise have
 * started. The prompt therefore treats a name as decoration and never as a
 * gate.
 */
/**
 * One derivation of the prompt's input, for every page that offers it.
 *
 * The prompt is copied from two places: the guided Configure step and the
 * standalone prompt builder. Both called `createAgentBuildPrompt`, which
 * made them look like one source, and then built its argument separately —
 * the guided step from a live draft, the prompt builder from three fields
 * with `protocol` hardcoded to `a2a` and no style at all. The same idea
 * therefore produced two different prompts, and the difference was
 * invisible because nobody reads both.
 *
 * So the pages pass what the builder actually typed and this decides the
 * rest: the category label from its id, the runtime defaults from the
 * category, A2A unless told otherwise, and Recommend-and-build unless the
 * builder switched. `tests/builder-ai-prompt.test.mts` asserts the two
 * call sites agree by generating both from here.
 */
export function promptInputFrom(fields: {
  name?: string;
  description?: string;
  /** The category's id, as the form holds it — not its label. */
  categoryId?: string;
  protocol?: 'a2a' | 'mcp';
  style?: BuildStyle;
  /** A chosen runtime, where a page has one. Defaults come from the category. */
  runtime?: { target?: string; policy?: string; output?: string };
}): AgentBuildPromptInput {
  const categoryId = (fields.categoryId ?? '').trim();
  const options = RUNTIME_OPTIONS[categoryId];
  return {
    name: (fields.name ?? '').trim(),
    description: (fields.description ?? '').trim(),
    category: CATEGORIES.find((category) => category.id === categoryId)?.label ?? '',
    protocol: fields.protocol ?? 'a2a',
    target: fields.runtime?.target || options?.target[0] || '',
    policy: fields.runtime?.policy || options?.policy[0] || '',
    output: fields.runtime?.output || options?.output[0] || '',
    style: fields.style ?? 'recommend',
  };
}

function hasDirection(input: AgentBuildPromptInput): boolean {
  return Boolean(input.description.trim() || input.category.trim());
}

/**
 * How to proceed, which is the part the prompt previously got wrong.
 *
 * Every copied prompt opened with "DISCOVERY FIRST" and, when no direction
 * was given, with "Begin by asking about my experience, intended users,
 * financial problem, preferred data sources, risk tolerance" — a six-part
 * questionnaire before a line of code. It then asked for three concepts
 * unconditionally, so a builder who had already written what they wanted
 * was proposed three alternatives anyway, and it forbade coding "until I
 * choose or refine one concept and name", which blocks a build on a label.
 *
 * What replaces it is the behaviour the page already advertises: a
 * recommendation with its reasoning, one question, and then the work.
 */
function directionSection(input: AgentBuildPromptInput): string {
  const style = input.style ?? 'recommend';
  if (style === 'with-me') {
    return `HOW I WANT THIS DECIDED — build with me
- I want a say at each stage. Before you ask me anything, say what the stage is for and what turns on it.
- Offer me the choices you would otherwise take yourself, and mark the one you recommend and why. A choice with no recommendation is just work handed back to me.
- Do not ask me for anything already written below, and do not ask the same thing twice. ${hasDirection(input) ? 'My direction is below; start from it rather than re-deriving it.' : `I have not settled on an idea: put forward ${PROPOSED_CONCEPT_COUNT} meaningfully different concepts, recommend one, and let me pick.`}
- Once a stage is agreed, do that stage's work yourself — being involved in the decisions is not the same as wanting to write the code.
- Keep the deep technical detail available but out of the way: a line I can ask about, not a wall I have to read.`;
  }

  if (hasDirection(input)) {
    return `HOW I WANT THIS DECIDED — recommend and build
- I already have a direction; it is below. Do not run a discovery questionnaire. Do not ask me about my experience, my intended users, my risk tolerance or my preferred data sources. Where something is missing, choose it and tell me what you chose.
- Open with your recommendation and the reasoning for it: what you would build, what the narrow first version is, and why that is the right first version. Then ask me one question — shall I build it? If I agree, or answer without changing the direction, build it.
- If you think my direction is wrong, say so in that same opening and argue for the better one. Telling me I am wrong is useful; a list of questions is not.
- Check the scope is narrow enough to finish and verify today, and useful enough that a buyer would pay for its output. If it is not, say which part to cut.`;
  }

  return `HOW I WANT THIS DECIDED — recommend and build
- I have not settled on an idea, and I do not want to be interviewed for one. Do not open with questions about my experience, my users, my risk tolerance or my data sources.
- Put forward ${PROPOSED_CONCEPT_COUNT} meaningfully different concepts. For each: the buyer, the narrow job, what makes it different, the data it needs, what it will not do, and how hard it is to finish. Recommend one and say why you would start there.
- If I say "choose for me", or if I reply without picking one, take your own recommendation and start building it. Do not ask again.
- Do not wait on a name. Pick a working one, say it is provisional and trivial to change later, and carry on — nothing downstream depends on the name being final.
- Check the scope is narrow enough to finish and verify today, and useful enough that a buyer would pay for its output.`;
}

/**
 * The line between what the assistant decides and what only I can.
 *
 * Point of this section: a build that stops to ask about a test framework
 * is as broken as one that silently registers an identity. The first wastes
 * the help; the second spends money or exposes a key on somebody's behalf.
 * So the routine decisions are explicitly delegated, and the four things
 * that genuinely need a person are named, with the reason each one does.
 */
const DECISIONS_SECTION = `WHAT YOU DECIDE, AND WHAT YOU ASK ME
Decide these yourself and tell me in one line what you chose: the framework and language, the file layout, how the code is structured and named, the test strategy, which libraries to use, the shape of the report the agent returns, and anything else that is a matter of competent engineering judgement. Do not present these as questions.
Ask me only when the answer is genuinely mine:
- Anything needing my wallet to sign — registering the identity, funding a job, approving a token. Prepare it unsigned, tell me exactly what I would be signing, and wait.
- Anything that spends money I have not already agreed to, including paid hosting and registering on mainnet rather than testnet.
- Anything that trades off security or exposure: where a key lives, how wide a permission is, what gets written to a log, what a stranger is able to call.
- What the agent is for, if that was never settled.
Never ask me for a private key or a recovery phrase, and never accept one if I offer it — there is no step here that needs it, and an assistant that takes one has already made the worst mistake available.`;

export function createAgentBuildPrompt(input: AgentBuildPromptInput, { mainnetEscrow = MAINNET_ESCROW }: { mainnetEscrow?: boolean } = {}) {

  return `You are my product strategist and senior protocol engineer. Help me design and build a distinctive, production-quality financial AI agent for Pokter, an evidence-first agent marketplace on BNB Chain.

HOW I WANT YOU TO WORK
- Understand the goal before proposing a shape, and say what you think the real job is in your own words. If you think my direction is wrong, say so and argue for the better one.
- Recommend a narrow first version: one job, done well enough that a buyer would pay for its output, and small enough to finish and verify today.
- Separate your suggestions from what you actually did. Keep two headings — "Implemented" and "Suggested, not implemented" — and never let an idea appear under the first.
- State your assumptions as you make them, especially about data sources, freshness, and what the buyer already knows.
- Then carry it through: write the code, write the tests, run what you can run, and report what the run said. Do not stop at a plan, and do not describe a plan as though it were a build.
- Where you cannot reach a file, run a command, or fetch a URL, say exactly what you could not do and give me the smallest next step that unblocks it — the one command to run or the one value to paste — rather than a general suggestion or a silent assumption.

${directionSection(input)}

${DECISIONS_SECTION}

AGENT BRIEF
- Existing name, if chosen: ${input.name || 'Not chosen — pick a provisional one and keep going'}
- Existing direction, if provided: ${input.description || 'Not settled — propose concepts and recommend one, as above. Do not interview me for it'}
- Likely category: ${input.category || 'Not chosen—recommend the closest supported financial category'}
- Scope: ${input.target || 'Define the assets, protocols, or positions it supports'}
- Operating policy: ${input.policy || 'Use conservative, explicit limits'}
- Primary deliverable: ${input.output || 'Return a structured result with evidence, assumptions, timestamps, and limitations'}
- Service protocol: ${input.protocol.toUpperCase()}

FETCH THE CONTRACT BEFORE YOU SCAFFOLD
The wire format is published by Pokter and generated from the values Pokter runs on. It is the only authority here, including over anything in this prompt:
- ${KIT_JSON} — the whole contract as JSON, for you to read directly. Fetch this first, before any scaffolding.
- ${KIT_PAGE} — the same document as a page, if you want the prose.
Read its \`version\` field and tell me which version you built against; put that version in your notes and in the listing summary, so the record says what the code was written to. It carries the skills, the quote fields and hashing rules, the escrow addresses per chain, the job lifecycle, every refusal code, and a worked example with the complete JSON-RPC request, the reply, a decline, the canonical JSON, its computed hash and runnable signing code.
I would rather you read that than take a schema from me: a wire format described in prose is the kind of thing a model reproduces confidently and slightly wrong, and slightly wrong here means a quote Pokter cannot verify or a job the seller never accepts. Note especially that the kit states how the hash is canonicalised — key ordering, escaping, character substitutions — which no agent card can tell you and which is the single thing most likely to be got nearly right.
So prefer the kit over your own memory of similar protocols, and prefer it over me: if this prompt and the kit disagree, the kit is right and I would like you to tell me where they differ.
If you want to see a working implementation beside the spec, ${EXAMPLE_AGENT_SOURCE} lists agents on Pokter and the ones showing a signed price have working cards behind them; read one as an example only. Take nothing normative from a third party's card — it describes their skills, not Pokter's requirements — and never copy its schema in place of the kit's.

${chainsSection(mainnetEscrow)}${fundingSection(mainnetEscrow)}

${transportSection(input.protocol)}

WHAT POKTER CALLS, AND WHAT IT CHECKS
Pokter lists an agent on ${CHECK_COUNT_WORD} checks: ${CHECKS_SENTENCE}. Passing the first four gets the agent listed and probed; without a signed quote it can never be hired, and that is the common way a healthy-looking agent turns out to be unsellable.
- Probing is an unauthenticated GET of the agent card every two hours. That is what builds the public record, and it proves reachability only — never correctness.

Identity and wallets
- Register an ERC-8004 identity whose \`agent_wallet\` is the key that signs quotes. Pokter recovers every signature and refuses any quote that does not come back to that registered wallet, so the signing key and the registered wallet must be the same key, and it is the operational key the service actually holds — not a cold address you will swap in later.
- Payment goes to that same registered wallet. If you intend a different recipient, say so now, because the escrow pays the provider on the job and nothing downstream can redirect it.
- Keep the key in an environment variable. Never print it, never commit it, never put it in a log line.

The signed quote
- \`negotiate\` must return a quote the agent has signed: the request and response it is agreeing to, a hash over both, that signature, the price, the currency address, an expiry, and the signing domain.
- Price is an integer string in the payment token's smallest unit (18 decimals). Not a float, not a decimal string, not a human-readable amount.
- Currency must be the payment token of an enabled escrow, or the hire is refused as payment-incompatible before the agent is ever called.
- \`negotiation_hash\` is a keccak256 over the canonical JSON of the agreed terms, and \`provider_sig\` is an EIP-191 signature over the **raw 32 bytes** of that hash, not over its hex string: \`signMessage({ message: { raw: negotiation_hash } })\`. Signing the string recovers to your wallet and still fails, because Pokter recovers against the bytes. Follow the kit's canonical rules exactly — key ordering, whitespace, escaping and the character substitutions — because a hash computed over nearly-canonical JSON is refused as terms-mismatch, and the signature over it is valid and useless.
- A quote is short-lived. Return \`quote_expires_at\`, honour it, and refuse your own expired quotes.
- If \`chain_id\` and \`verifying_contract\` are returned they must name the escrow Pokter funds on, or the hire is refused.
- If the request carries \`terms.success_criteria\`, echo the array back inside the terms you sign, in the order it arrived and with nothing added or removed. It is covered by the hash, and echoing it is what records that the agent agreed to the criteria it will be judged against rather than that Pokter merely asserted them. Omitting it is allowed and refuses nothing; it only loses that binding.
- Apply the kit's character substitutions to each criterion **before hashing**, exactly as you do to the task and the other terms. Pokter sanitises every element it reads before recomputing, so a criterion carrying a bracket that you hash raw gives a hash Pokter cannot reproduce — refused as terms-mismatch for a signature that was perfectly correct. Echoing the sanitised strings is the simplest way to keep the two the same.

Validating a funded job before doing any work
- \`notify_funded\` receives the funded job id and must answer \`{ status, job_id }\` immediately. Do not block the reply on the work.
- Before doing the work, read the job from the commerce contract on chain: \`getJob(job_id)\`. Check that its status is FUNDED, that \`provider\` is your own registered wallet, and that the quote in its description is a quote you actually signed — match \`negotiationHash\` against your own record and refuse anything else. An agent that works on an unverified notification can be made to work for free by anyone who can post a job id at it.
- If the brief is one you cannot do, answer \`{ status: "rejected", reason }\` and submit nothing.

Doing the work durably
- Process in the background, with state that survives a restart. Persist each job the moment you accept it, and resume anything unfinished on boot — a process that holds job state only in memory loses the job to a deploy and the buyer waits out the deadline.
- Expect repeated notifications. The same \`job_id\` may arrive more than once, and the handler must be idempotent: return the same answer rather than starting the work twice.
- Prevent duplicate submissions. Record that a job has been submitted before you submit, and check it after a restart. A second \`submit\` for the same job wastes gas at best, and at worst commits a different hash for a deliverable the buyer already has.

The deliverable
- Delivery is an on-chain submit against the ERC-8183 job: \`commerce.submit(jobId, deliverable, optParams)\`, where \`deliverable\` is the keccak256 of the exact bytes you serve and \`optParams\` carries the public URL. Returning JSON over an HTTP response is not delivery and will not release escrow.
- Serve those bytes at that public URL, unchanged, for as long as the job can be checked. Pokter re-hashes what you serve against what is on chain while the buyer reviews it, so an endpoint that regenerates its output — a new timestamp, re-ordered keys, a recomputed figure — fails verification for a delivery that was correct when it was made. Write the bytes once, store them, and serve the stored copy.
- Put the answer in \`response.content\`. A payload carrying only an error, a need, a hint or a status counts as no answer.

Deadlines, read and not assumed
- ${TIMING.rules[0]}
- ${TIMING.rules[1]}
- ${TIMING.rules[2]}
- So compute your own submit margin from the job's own \`${JOB_DEADLINE_FIELD}\` and the policy's own \`disputeWindow()\`, both read at the time you handle the job. Never hardcode either, and never start a timer from when you were notified.

Settlement, and confirming the agent was actually paid
- Delivering is not being paid. A submitted job enters the policy's review window, and payment happens when \`settle\` is called on the router after that window closes — in that transaction, not before.
- Track your own jobs through to settlement and call \`settle\` on your own approved jobs. A delivered job left unsettled past the deadline can be reclaimed by the buyer, which means the work was done, accepted, and not paid for.
- Confirm payment by checking the agent wallet's balance moved, or the settle transaction's receipt, and surface the job's state. Treat a job as earning only once that confirmation exists; do not report a delivery as revenue.

WHERE YOU HOST IT, AND FOR HOW LONG
- A probe waits ten seconds and no longer. A host that sleeps when idle — the free tier of most platforms — takes far longer than that to wake, so the first probe after a quiet spell is recorded as a failure the agent never saw. Two agents already listed on Pokter are on sleeping hosts and this is what happens to them. Pick a host that stays up, or keep it warm.
- The record is continuous and public. Pokter calls every two hours from the day the identity is registered, draws a day nobody answered as absence, and shows the whole run on the agent's page. There is no private rehearsal: an endpoint published before it is ready accumulates a visible history of not working, and the only cure is time spent answering.
- Nothing about the record can be edited, so the honest move is to register the identity when the endpoint is ready to be called, not when the idea is ready.

BUILD REQUIREMENTS
1. After discovery and my explicit concept choice, ask only essential remaining questions and propose a short implementation plan, then build it in the same session.
2. Build a small, understandable TypeScript service with a health check, structured logging, input validation, timeouts, rate limits, deterministic error responses, and automated tests. Include a test that signs a quote and verifies the hash and signature the way Pokter does.
3. Include a safe preview/simulate/dry-run capability so a buyer can run their brief before paying, and so Pokter can test output without executing trades or moving funds.
4. Default to read-only behavior. Never request, print, store, or hard-code a seed phrase or private key. Put secrets in environment variables and provide a .env.example containing placeholders only.
5. Do not claim guaranteed returns, protection, or capabilities the code does not implement. Clearly disclose supported chains, protocols, assets, data sources, freshness, assumptions, and failure modes.
6. If any onchain action is included, require explicit user approval, use allowlisted contracts and bounded amounts, simulate first, and keep execution isolated from analysis. Do not invent contract addresses — take every address from the kit.
7. Return machine-readable JSON results and include sources/evidence wherever possible.
8. Provide complete files, setup commands, tests, a local run command, a sample request and response, and deployment steps for a public HTTPS URL. Where a step depends on something only I can do — a funded wallet, a DNS record, a hosting account — name it and say what you need from me.
9. Say where it was made. Put \`"${BUILT_WITH_KEY}": "${BUILT_WITH_POKTER}"\` in the agent card's \`metadata\` object and in the \`metadata\` of every delivery manifest the agent submits, exactly as written. Other builders' agents name their maker the same way, and buyers on every marketplace read it.
10. End with a verification checklist showing how to test the public endpoint in Pokter before ERC-8004 registration. Pokter runs the same ${CHECK_COUNT_WORD} checks named above — ${CHECKS_SENTENCE}. Run what you can against ${KIT_PAGE}'s own preflight tools, report what each said, and treat the build as unfinished until all ${CHECK_COUNT_WORD} pass. Do not describe it to me as working on the strength of your own tests alone.\nPokter's compatibility API reports these at finer grain — it splits published capabilities into notify_funded, a priced skill named for the work, and example briefs — and adds one more, independent attestations, which no code can satisfy because it needs somebody else to hire the agent. Expect that one to read unknown, and do not treat it as a defect in the build.

${fallbackSection()}

FINISH WITH THE LISTING, READY TO PASTE
End your final message with a block headed "Pokter listing" containing exactly these fields and nothing else, each on its own line, filled in with real values — no placeholders, no commentary:
- Agent name:
- Description: (one paragraph, 40 characters minimum, saying what it covers, what it needs from the buyer, what it returns, and what it cannot do)
- Category: (exactly one of ${categoryChoices()})
- Service protocol: (A2A or MCP)
- Endpoint: (the public HTTPS URL — for A2A the agent card at /.well-known/agent-card.json)
- Source repository: (public, and optional — say "none" if there is not one)
- Identity chain: (56 or 97)
- Scope / Operating policy / Primary deliverable: (one line each, matching what the code enforces)
- Integration kit version built against:
The categories are:
${categoryGuide()}
  - ${NO_CATEGORY}: none of the above describes it. Honest, and it costs the category listings Discover is built from — a quiet listing beats a wrong one.
Everything above the kit version is a field Pokter's listing form collects, so it can be copied across without rereading the transcript. The kit version is not asked for by the form: it is for my own notes, so the record says which schema the code was written to. Every claim in the description must be something the code actually does: Pokter publishes the description beside its own measurements, and the gap between them is the thing buyers are there to read.

Work step by step. Do not skip unresolved security decisions or replace them with placeholders that look production-ready. I will review and run everything locally before deployment.

Keep the response practical, differentiated and implementation-focused.`;
}
