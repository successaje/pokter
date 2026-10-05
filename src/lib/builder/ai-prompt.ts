export type AgentBuildPromptInput = {
  name: string;
  description: string;
  category: string;
  protocol: 'a2a' | 'mcp';
  target?: string;
  policy?: string;
  output?: string;
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
const ESCROW_CHAIN_ID = 97;

/**
 * A live agent that negotiates and delivers, offered as the reference.
 *
 * Linked rather than transcribed. A schema copied into this file is a
 * schema that goes stale silently, and the failure it produces — a quote
 * Pokter cannot verify — looks like a bug in the new agent rather than a
 * bug in the instructions it was built from. The card is public and Pokter
 * already reads it every two hours.
 *
 * It is one example, not a dependency: the prompt tells the model what to
 * do when it does not load, because this is somebody else's endpoint on a
 * host that sleeps and it may one day not be there.
 */
const REFERENCE_AGENT_CARD =
  'https://weigh-ladder-agent.onrender.com/.well-known/agent-card.json';
const ESCROW_CHAIN_NAME = 'BNB Smart Chain Testnet';

export function createAgentBuildPrompt(input: AgentBuildPromptInput) {
  const protocolContract = input.protocol === 'a2a'
    ? 'Expose an A2A Agent Card at GET /.well-known/agent-card.json and a JSON-RPC 2.0 task endpoint over POST.'
    : 'Expose an MCP Streamable HTTP JSON-RPC endpoint supporting initialize and tools/list over POST.';

  const hasDefinedConcept = Boolean(input.name || input.description || input.category);

  return `You are my product strategist and senior protocol engineer. Help me design and build a distinctive, production-quality financial AI agent for Pokter, an evidence-first agent marketplace on BNB Chain.

DISCOVERY FIRST
${hasDefinedConcept
    ? '- I have provided an initial direction below. Challenge weak assumptions and suggest improvements before implementation.'
    : '- Begin by asking about my experience, intended users, financial problem, preferred data sources, risk tolerance, and whether the agent should only advise or also prepare actions.'}
- Suggest three meaningfully different agent concepts and original names. For each, explain the buyer, narrow job, differentiator, required data, limitations, and implementation difficulty.
- Do not reuse a generic sample identity or begin coding until I choose or refine one concept and name.
- Check that the selected scope is specific enough to test and useful enough that a buyer would pay for its output.

AGENT BRIEF
- Existing name, if chosen: ${input.name || 'Not chosen—propose original options'}
- Existing direction, if provided: ${input.description || 'Not defined—discover it with me'}
- Likely category: ${input.category || 'Not chosen—recommend the closest supported financial category'}
- Scope: ${input.target || 'Define the assets, protocols, or positions it supports'}
- Operating policy: ${input.policy || 'Use conservative, explicit limits'}
- Primary deliverable: ${input.output || 'Return a structured result with evidence, assumptions, timestamps, and limitations'}
- Service protocol: ${input.protocol.toUpperCase()}

WHICH CHAINS THIS AGENT LIVES ON
- Identity: register the ERC-8004 agent on BNB Chain mainnet (56) or BNB Smart Chain Testnet (97). Pokter lists both.
- Money: every escrow settles on ${ESCROW_CHAIN_NAME} (chain ${ESCROW_CHAIN_ID}), whichever chain the identity is on. Payment is a test token with no real value.
- Therefore: quote in the payment token of chain ${ESCROW_CHAIN_ID}, and bind the quote's signing domain to chain ${ESCROW_CHAIN_ID}. A quote priced in mainnet currency, or signed for chain 56, verifies correctly and still cannot be paid from this escrow — the agent will reject or never receive the job, and the buyer waits out the deadline for nothing. Ask me for the exact payment-token address and do not guess it.
- If the identity is on mainnet while escrow is on testnet, the agent cannot see the job at all and Pokter's own seller delivers on its behalf. Registering on chain ${ESCROW_CHAIN_ID} is what lets the agent earn its own record.

WHAT POKTER CALLS, AND WHAT IT CHECKS
Pokter lists an agent on six checks: ERC-8004 identity, a published endpoint, answering when called, published capabilities, a signed price quote, and a marketplace category. Passing the first four gets the agent listed and probed; without the fifth it can never be hired, and that is the common way a healthy-looking agent turns out to be unsellable.
- Probing is an unauthenticated GET of the agent card every two hours. That is what builds the public record, and it proves reachability only — never correctness.
- \`negotiate\` must return a quote the agent has signed with its registered ERC-8004 wallet: the request and response it is agreeing to, a hash over both, that signature, the price in the escrow token, the currency address, an expiry, and the signing domain (chain id and verifying contract). Pokter recovers the signature and refuses any quote that does not come back to the registered wallet.
- \`notify_funded\` receives the funded job id, verifies the job on chain carries the agent's own signed quote, answers immediately with accepted or rejected, and does the work afterwards. Do not block the reply on the work.
- Delivery is an on-chain submit against the ERC-8183 job carrying the deliverable's hash, so a buyer can check the file is the one committed to. Returning JSON over HTTP is not delivery and will not release escrow.
- A quote is short-lived. State its expiry and honour it.

READ A WORKING AGENT BEFORE YOU WRITE ONE
Fetch ${REFERENCE_AGENT_CARD} and read its two skill descriptions. It is a live agent on Pokter that negotiates and delivers end to end, and its card states the exact message shape each skill expects and returns. Copy the contract, not the strategy — the agent you build should do a different job.
I would rather you read that card than take a schema from me: a wire format described in prose is the kind of thing a model reproduces confidently and slightly wrong, and slightly wrong here means a quote Pokter cannot verify or a job the seller never accepts. If the card does not load, say so and ask me for a current one rather than inventing the shape — any agent listed on pokter.xyz/agents showing a signed price has a working card behind it.

BUILD REQUIREMENTS
1. After discovery and my explicit concept choice, ask only essential remaining questions and propose a short implementation plan before writing code.
2. Build a small, understandable TypeScript service with a health check, structured logging, input validation, timeouts, rate limits, deterministic error responses, and automated tests.
3. ${protocolContract}
4. Include a safe preview/simulate/dry-run capability so Pokter can test output without executing trades or moving funds.
5. Default to read-only behavior. Never request, print, store, or hard-code a seed phrase or private key. Put secrets in environment variables and provide a .env.example containing placeholders only.
6. Do not claim guaranteed returns, protection, or capabilities the code does not implement. Clearly disclose supported chains, protocols, assets, data sources, freshness, assumptions, and failure modes.
7. If any onchain action is included, require explicit user approval, use allowlisted contracts and bounded amounts, simulate first, and keep execution isolated from analysis. Do not invent contract addresses.
8. Return machine-readable JSON results and include sources/evidence wherever possible.
9. Provide: complete files, setup commands, tests, a local run command, a sample request/response, and deployment steps for a public HTTPS URL.
10. Implement \`negotiate\` and \`notify_funded\` as described above, and publish both in the agent card's skills so Pokter can read them. Keep the signing key in an environment variable.
11. End with a verification checklist showing how to test the public endpoint in Pokter before ERC-8004 registration.

FINISH WITH THE LISTING, READY TO PASTE
End your final message with a block headed "Pokter listing" containing exactly these fields and nothing else, each on its own line, filled in with real values — no placeholders, no commentary:
- Agent name:
- Description: (one paragraph, 40 characters minimum, saying what it covers, what it needs from the buyer, what it returns, and what it cannot do)
- Category: (exactly one of rebalancing, grid-trading, yield, health-factor)
- Service protocol: (A2A or MCP)
- Endpoint: (the public HTTPS URL — for A2A the agent card at /.well-known/agent-card.json)
- Public repository:
- Identity chain: (56 or 97)
- Scope / Operating policy / Primary deliverable: (one line each, matching what the code enforces)
These are the fields Pokter's listing form asks for, in its order, so they can be copied across without rereading the transcript. Every claim in the description must be something the code actually does: Pokter publishes the description beside its own measurements, and the gap between them is the thing buyers are there to read.

Work step by step. Do not skip unresolved security decisions or replace them with placeholders that look production-ready. I will review and run everything locally before deployment.

Keep the response practical, differentiated and implementation-focused.`;
}
