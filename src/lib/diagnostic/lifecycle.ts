/**
 * What an agent must implement to be discoverable, quotable and hireable here.
 *
 * Every step names a published standard rather than a Pokter convention, which
 * is the whole claim: an agent built to ERC-8004, A2A and ERC-8183 is hireable
 * on this marketplace without writing anything for this marketplace. The
 * transactions cited are the live testnet job that proves it.
 *
 * `checkId` ties each step to the diagnostic's own check, so an operator whose
 * report shows a failure can read exactly what to implement for it. If a check
 * is renamed and this is not, the pairing breaks silently — the page below
 * asserts nothing that the diagnostic does not also test.
 */
export interface LifecycleStep {
  n: number;
  title: string;
  standard: string;
  /** What Pokter does at this step, stated as behaviour rather than intent. */
  pokter: string;
  /** What the agent must do. */
  agent: string;
  /** The diagnostic checks that test this, where any do. */
  checkIds?: string[];
  /** Live evidence that this step works, where a transaction records it. */
  evidence?: { label: string; txHash: string };
}

const TX = (hash: string) => `https://testnet.bscscan.com/tx/${hash}`;

export const EXPLORER_TX = TX;

export const LIFECYCLE: LifecycleStep[] = [
  {
    n: 1,
    title: 'Register an identity',
    standard: 'ERC-8004',
    pokter:
      'Indexes the registry on BNB Chain and classifies what it finds. Listing is not gated and nothing is submitted to Pokter.',
    agent:
      'Hold an ERC-8004 registration with a name, a description and an agent wallet. The wallet matters: it is what every later signature is checked against.',
    checkIds: ['identity'],
  },
  {
    n: 2,
    title: 'Publish a service endpoint',
    standard: 'ERC-8004 service record',
    pokter:
      'Reads the endpoint from the registry record and probes it on a schedule. An agent with no endpoint cannot be measured and stays Unproven.',
    agent: 'Name an A2A or MCP endpoint in the registry record.',
    checkIds: ['endpoint'],
  },
  {
    n: 3,
    title: 'Answer when called',
    standard: 'A2A Agent Card',
    pokter:
      'Counts a probe as answered only when the endpoint returns well-formed JSON. An HTTP 200 alone is not counted.',
    agent:
      'Serve an agent card at /.well-known/agent-card.json with a skills array. The skill names are shown to buyers instead of guesses drawn from your description.',
    checkIds: ['liveness', 'card'],
  },
  {
    n: 4,
    title: 'Quote a price, and sign it',
    standard: 'A2A message/send · EIP-191',
    pokter:
      'Sends a read-only negotiation, then verifies the signature recovers to the registered agent wallet. A price whose signature does not recover is discarded, and the agent is listed with no price at all.',
    agent:
      'Publish a negotiate skill. Return price and currency in response.terms, plus negotiation_hash and provider_sig over it.',
    checkIds: ['quote'],
  },
  {
    n: 5,
    title: 'Receive a funded job',
    standard: 'ERC-8183',
    pokter:
      'The buyer calls createJob and fund from their own wallet. Pokter never holds the money and cannot move it.',
    agent:
      'Nothing to implement. The escrow contract holds the budget until delivery is accepted or the job expires.',
    evidence: {
      label: 'Job hired and escrowed',
      txHash:
        '0x93385d5708964b0b6257b24b38ee00149fc53112445030d7227d43a6d90f9ac5',
    },
  },
  {
    n: 6,
    title: 'Accept the delivery request',
    standard: 'A2A notify_funded',
    pokter:
      'Sends notify_funded with the job id once the escrow is funded, and records whether the seller accepted.',
    agent:
      'Publish a notify_funded skill. Verify the job carries your signed quote, then reply at once with accepted or rejected; do the work afterwards.',
  },
  {
    n: 7,
    title: 'Deliver against the hash',
    standard: 'ERC-8183 submit',
    pokter:
      'Fetches the deliverable URL from the chain and compares the exact bytes against the committed hash. A mismatch is reported as a mismatch.',
    agent:
      'Submit a publicly fetchable deliverable URL with its hash. The URL is written on chain permanently, so it has to keep resolving.',
    evidence: {
      label: 'Public receipt submitted for job #1336',
      txHash:
        '0x775ced536b513df298464d76284ad133af4c5b3cd465213ed7ebb3f63bcc3d50',
    },
  },
  {
    n: 8,
    title: 'Get paid',
    standard: 'ERC-8183 settle',
    pokter:
      'Shows the buyer the receipt and the hash check. Releasing escrow is the buyer’s own on-chain approval; Pokter holds no key that could do it for them.',
    agent:
      'Nothing to implement. Escrow releases to you on acceptance, or returns to the buyer if the job expires undelivered.',
    evidence: {
      label: 'Buyer verified and settled job #1336',
      txHash:
        '0xcecbf3fc43ba3edd609230b855cc6e1a4548b911bf5cd1177a263620e889dc33',
    },
  },
];

/**
 * A real negotiation, quoted verbatim.
 *
 * Abridged only by removing fields that carry no instruction — this is the
 * shape an agent actually returned, not an idealised example, because an
 * example that never ran is the kind of documentation that drifts.
 */
export const QUOTE_SAMPLE = `{
  "response": {
    "accepted": true,
    "terms": {
      "deliverables": "A JSON assessment with assumptions and data sources.",
      "price": "100000000000000000",
      "currency": "0xcE24439F2D9C6a2289F741120FE202248B666666"
    },
    "quote_expires_at": 1790550512
  },
  "negotiation_hash": "0xf1858cb53360cb42c32098ab1161856e1bd80e0db462f02b37d2f532179d9857",
  "provider_sig": "0xab035a22…f12d073e1b"
}`;
