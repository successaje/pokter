/**
 * The hiring workflow as tools an assistant can drive, described once.
 *
 * Pokter's MCP surface could find an agent, read its evidence, ask it for a
 * price and hand the user a link. Everything after the link was the user's
 * own hands: compiling the brief, reading what the agent would actually be
 * asked, funding, tracking, checking the delivery. An assistant could take
 * somebody to the door and no further.
 *
 * These four close that, and the order matters as much as the tools:
 *
 *   discover → prepare brief → quote → prepare an unsigned hire request →
 *   owner approves payment → track the job → read the deliverable and the
 *   verification
 *
 * The step in the middle is the one this product will not move. A prepared
 * request is unsigned; a human owner approves it in their own wallet; and
 * every description below says so, because a description that left it out
 * would be the only part of this chain a caller could get wrong without
 * being told.
 *
 * The names, titles, descriptions and schemas live here as data rather than
 * in the route, so a test can hold them to that: the route is `server-only`
 * and cannot be imported, and "the tool says it needs owner approval" is a
 * claim worth checking on every build.
 */

export interface AssistantToolSpec {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  /**
   * Whether this tool, by itself, can part the owner from any money.
   *
   * `false` for all four, and it is not decoration: it is the claim the
   * tests assert and the sentence the assistant repeats to the user.
   */
  spends: false;
}

const agentArgs = {
  chain_id: {
    type: 'integer',
    enum: [56, 97],
    description: 'The ERC-8004 registry chain: 56 for BNB Chain, 97 for BNB Testnet.',
  },
  token_id: { type: 'string', pattern: '^\\d{1,12}$', description: 'The agent’s ERC-8004 token id.' },
} as const;

const jobArgs = {
  job_id: { type: 'string', pattern: '^\\d{1,18}$', description: 'The ERC-8183 job id, as the funded hire reported it.' },
  chain_id: {
    type: 'integer',
    enum: [56, 97],
    description: 'The escrow chain the job was funded on — not the agent’s registry chain, which can differ.',
  },
} as const;

export const PREPARE_BRIEF: AssistantToolSpec = {
  name: 'prepare_brief',
  title: 'Compile a brief into what the agent accepts',
  description:
    'Turn a plain-language request into the exact text and fields the agent’s own skill accepts, before asking for a price. Returns the skill it resolves to, every value that will be sent and where it came from, the exact payload, and one question per input that is still missing — each bound to the field it belongs to, so an answer is used for that field and never parsed back out of prose. ' +
    'Use it before get_quote or prepare_hire, and again after the user answers a question. Pokter fills nothing in on the user’s behalf: no wallet, chain, asset, amount or limit is ever invented, and a skill that publishes no input format is reported as exactly that rather than guessed at. ' +
    'Reads the agent’s published card; sends the brief to no one, moves nothing and signs nothing.',
  inputSchema: {
    type: 'object',
    required: ['chain_id', 'token_id', 'task'],
    properties: {
      ...agentArgs,
      task: { type: 'string', maxLength: 2000, description: 'What the user wants done, in their own words.' },
      answers: {
        type: 'object',
        description: 'Answers to the questions a previous call returned, keyed by the field key it asked for. Strings only.',
        additionalProperties: { type: 'string', maxLength: 2000 },
      },
    },
  },
  spends: false,
};

export const PREPARE_HIRE: AssistantToolSpec = {
  name: 'prepare_hire',
  title: 'Prepare an unsigned hire request for the owner to approve',
  description:
    'Ask the agent for a signed price for this exact brief and write the hire down in full, UNSIGNED, for a human owner to approve and fund in their own wallet. This tool cannot pay: it signs nothing, moves nothing, escrows nothing and creates no job on chain. ' +
    'The request states every term explicitly — chain, ERC-8183 escrow contract, provider wallet and where that address came from, token, amount in raw units and in words, the owner’s own ceiling in the same money, when the signed price stops holding, and the exact task the signature covers — plus the authority funding it would create and a link where the owner approves it. Show the owner those terms; only they can complete the hire. ' +
    'escrow_chain_id, max_budget and owner_address are all the owner’s, and all three are required: the network this hire spends on, the ceiling it may not exceed, and the wallet that will fund it. The request is bound to that wallet, so two owners asking for the same work are two requests and neither can be handed the other’s job. ' +
    'escrow_chain_id and max_budget are both the owner’s and both required. The escrow chain decides whether this hire spends real money (56) or test tokens (97), so the owner states it: an agent that answers with a price in the other network’s token is refused, never quietly funded on the network it chose. max_budget is the ceiling on that chain’s own token: a price above it is refused rather than prepared, and nothing an agent says in a reply can raise it, change where escrow pays, or grant any wallet permission. ' +
    'Idempotent: calling it again with the same terms returns the same request under the same key, and once that request has been funded it returns the job instead of preparing a second one. If a funding attempt may have landed, pass possibly_funded_job_id and the escrow is read back before anything is offered again.',
  inputSchema: {
    type: 'object',
    required: ['chain_id', 'token_id', 'task', 'escrow_chain_id', 'max_budget', 'owner_address'],
    properties: {
      ...agentArgs,
      task: { type: 'string', minLength: 1, maxLength: 2000, description: 'The brief. Use the payload prepare_brief returned, where it returned one.' },
      answers: {
        type: 'object',
        description: 'Answers to prepare_brief’s questions, keyed by field key. Compiled here through the same compiler, so the text quoted is the text the owner approves.',
        additionalProperties: { type: 'string', maxLength: 2000 },
      },
      escrow_chain_id: {
        type: 'integer',
        enum: [56, 97],
        description:
          'The escrow the OWNER authorised: 56 for BNB Chain, which spends real $U, or 97 for BNB Testnet, which spends test tokens. Required, with no default — an agent is registered on one network and may quote in the other’s token, so this is the owner’s choice and never the agent’s. A quote that settles anywhere else is refused.',
      },
      max_budget: {
        type: 'number',
        exclusiveMinimum: 0,
        description:
          'The most the OWNER has authorised for this one job, in whole $U on escrow_chain_id — real $U on 56, test $U on 97. Required: there is no default budget, and the owner has to have said both this number and which network it is in.',
      },
      request_id: {
        type: 'string',
        maxLength: 64,
        description: 'Only to buy the same work twice on purpose. Omit it and identical terms are treated as one purchase, which is what makes a retry safe.',
      },
      possibly_funded_job_id: {
        type: 'string',
        pattern: '^\\d{1,18}$',
        description: 'A job id from a funding attempt whose outcome is unknown. The escrow is read first and a second request is never offered until the chain has answered.',
      },
      owner_address: {
        type: 'string',
        pattern: '^0x[0-9a-fA-F]{40}$',
        description:
          'The wallet that will fund this hire: the OWNER’s own public address. Required, with no default — the prepared request is bound to it, so that one owner is never handed another owner’s job and a payment can be checked against the request it answered. If you do not know it, ask the owner; it is not something Pokter can pick. Public address only, never a key or a seed.',
      },
    },
  },
  spends: false,
};

export const JOB_STATUS: AssistantToolSpec = {
  name: 'job_status',
  title: 'Track a funded job',
  description:
    'Read one ERC-8183 job from chain by its id: its state (funded, submitted, completed, rejected, expired), its budget, its provider, its deadline, the brief it was funded with and the deliverable link once the agent has published one. ' +
    'Use it after the owner has funded a hire, and to confirm whether a hire you are unsure about exists at all. The chain is the authority here: nothing is inferred from elapsed time. Read-only, and it settles nothing — releasing or disputing escrow is the owner’s own action in their wallet.',
  inputSchema: { type: 'object', required: ['job_id', 'chain_id'], properties: { ...jobArgs } },
  spends: false,
};

export const CHECK_DELIVERY: AssistantToolSpec = {
  name: 'check_delivery',
  title: 'Read a delivery and check it against the chain',
  description:
    'Fetch what the agent delivered for a job and, where Pokter can recompute the claim independently, check it. Today that is a Venus health-factor report: the account comes from the brief in the job description on chain, the figures from Venus’s own contracts at the block the report names, and the delivered file counts only once its bytes hash to what the agent committed on chain. ' +
    'Advisory. It returns what a match does and does not mean, and it settles nothing: it releases no escrow, pays nobody, records no score and raises no dispute. The owner reads it and decides. A job it cannot recompute is reported as that, never as a pass.',
  inputSchema: { type: 'object', required: ['job_id', 'chain_id'], properties: { ...jobArgs } },
  spends: false,
};

/**
 * The chain, in order, with the step no tool performs named in the middle.
 *
 * Returned by `integration_kit` and asserted by the tests. An assistant
 * reading this list should come away unable to believe it can buy anything.
 */
export const HIRE_TOOL_CHAIN = [
  { step: 'discover', tool: 'search_agents', byWhom: 'assistant' },
  { step: 'vet', tool: 'get_agent', byWhom: 'assistant' },
  { step: 'prepare the brief', tool: 'prepare_brief', byWhom: 'assistant' },
  { step: 'obtain a signed price', tool: 'get_quote', byWhom: 'assistant' },
  { step: 'prepare an unsigned hire request', tool: 'prepare_hire', byWhom: 'assistant' },
  {
    step: 'approve and fund the payment',
    tool: null,
    byWhom: 'the human owner, in their own wallet',
    note: 'No tool does this, and none can. Pokter has no key that can spend the owner’s funds and takes no standing permission over their wallet.',
  },
  { step: 'track the job', tool: 'job_status', byWhom: 'assistant' },
  { step: 'read and check the delivery', tool: 'check_delivery', byWhom: 'assistant' },
  {
    step: 'release or dispute escrow',
    tool: null,
    byWhom: 'the human owner, in their own wallet',
    note: 'The review window after delivery is the owner’s to use. Pokter neither releases nor disputes on their behalf.',
  },
] as const;

export const ASSISTANT_TOOLS: readonly AssistantToolSpec[] = [PREPARE_BRIEF, PREPARE_HIRE, JOB_STATUS, CHECK_DELIVERY];
