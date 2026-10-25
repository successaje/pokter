/**
 * The three wallets an agent needs, and why they are three.
 *
 * Builders arrive expecting one wallet and the flow never said otherwise,
 * so the same key ended up owning the identity, signing the agent's
 * quotes and funding the test hire. Each of those collapses something
 * real:
 *
 *   - Identity owner and agent wallet as one key means the key that sits
 *     on a server, answering anonymous calls all day, is also the key
 *     that can transfer the identity.
 *   - Agent wallet and test buyer as one key means Pokter's hire page
 *     refuses the hire: `useHire`'s `selfHire` disables the button. The
 *     escrow does not refuse — testnet job 1444 is a self-hire that
 *     reached COMPLETED — but of the seven ever funded, six expired
 *     undelivered, including both mainnet ones. An agent does not tend
 *     to answer its own hire, which is a different failure from the
 *     escrow rejecting one, and saying the escrow refuses sends a
 *     builder looking for a contract error that never happens.
 *   - Identity owner and test buyer as one key means the hire is the
 *     owner paying their own agent, which is honest as a test and is not
 *     demand — and under Set and Earn's rules it counts for nothing.
 *
 * Pokter never needs any of the three keys. It reads addresses from the
 * registry and from chain, and the only signatures it asks for are made
 * in the builder's own wallet. There is no field anywhere in this product
 * for a private key or a recovery phrase, and nothing in it should ever
 * ask for one.
 */

export type WalletRoleId = 'identity-owner' | 'agent-wallet' | 'test-buyer';

export interface WalletRole {
  id: WalletRoleId;
  label: string;
  /** The one sentence version of what this wallet is for. */
  purpose: string;
  /** What it signs, and where that signature is checked. */
  signs: string;
  /** Where the key should live. */
  keyLives: string;
  /** What it must never be asked to do. */
  neverDoes: string;
}

export const WALLET_ROLES: ReadonlyArray<WalletRole> = [
  {
    id: 'identity-owner',
    label: 'Identity owner',
    purpose: 'Owns the ERC-8004 token and can change the registry record.',
    signs: 'The two registration transactions, profile edits, and the message that proves ownership to Pokter.',
    keyLives: 'Your own browser or hardware wallet. It is used by hand, a few times, and never by a server.',
    neverDoes: 'Run on the machine serving your agent. A key that answers anonymous calls all day should not be able to transfer the identity.',
  },
  {
    id: 'agent-wallet',
    label: 'Agent wallet (provider)',
    purpose: 'The operational wallet your running agent signs and delivers from. Published on the registry record as the agent wallet, and the escrow pays it.',
    signs: 'Every quote (negotiation_hash, EIP-191) and every delivery submitted to escrow.',
    keyLives: 'On the host running your agent, in an environment variable, a secrets manager or a KMS the process reads at start-up. Never in the repository, never in the agent card, never pasted into a web page.',
    neverDoes: 'Fund your own test hire. It is the wallet being paid, so Pokter\'s hire page will not offer it, and a job whose payer and payee match is left out of your delivery figures.',
  },
  {
    id: 'test-buyer',
    label: 'Test buyer',
    purpose: 'A separate wallet you use to hire your own agent once, to prove the delivery and settlement path end to end.',
    signs: 'The escrow funding transaction, and nothing of the agent’s.',
    keyLives: 'Your own wallet, a second account. On testnet it needs only free tBNB and test $U.',
    neverDoes: 'Stand in for a customer. A hire you funded is a test, and Pokter counts it separately from outside demand everywhere it is shown.',
  },
];

export interface WalletRoleAssignment {
  identityOwner?: string | null;
  agentWallet?: string | null;
  testBuyer?: string | null;
}

export type WalletConflictSeverity = 'blocking' | 'advised';

export interface WalletConflict {
  roles: [WalletRoleId, WalletRoleId];
  severity: WalletConflictSeverity;
  /** What goes wrong, in the terms of the thing that breaks. */
  consequence: string;
  fix: string;
}

const same = (a?: string | null, b?: string | null) =>
  Boolean(a && b) && a!.trim().toLowerCase() === b!.trim().toLowerCase();

/**
 * Which of the three roles are sharing a key, and what that costs.
 *
 * `blocking` is reserved for the overlap the escrow itself refuses —
 * everything else is advice, and saying so is the difference between a
 * warning a builder can act on and a wall they work around.
 */
export function walletRoleConflicts(assignment: WalletRoleAssignment): WalletConflict[] {
  const conflicts: WalletConflict[] = [];
  if (same(assignment.agentWallet, assignment.testBuyer)) {
    conflicts.push({
      roles: ['agent-wallet', 'test-buyer'],
      severity: 'blocking',
      consequence:
        'Pokter\'s hire page refuses to fund it: the Hire button is disabled when the connected wallet is the agent\'s provider. The escrow would settle such a job — one testnet self-hire has completed — but six of the seven ever funded expired undelivered, because an agent does not tend to answer its own hire, and Pokter leaves it out of your delivery figures either way.',
      fix: 'Hire from a second wallet. On testnet it costs nothing.',
    });
  }
  if (same(assignment.identityOwner, assignment.agentWallet)) {
    conflicts.push({
      roles: ['identity-owner', 'agent-wallet'],
      severity: 'advised',
      consequence:
        'The key that runs on your server is also the key that owns the identity, so a compromise of the host is a loss of the agent rather than a loss of its signatures.',
      fix: 'Generate a separate operational key for the agent and publish that one as the agent wallet.',
    });
  }
  if (same(assignment.identityOwner, assignment.testBuyer)) {
    conflicts.push({
      roles: ['identity-owner', 'test-buyer'],
      severity: 'advised',
      consequence:
        'The hire is the owner paying their own agent. It proves the delivery path and is not demand: Pokter shows it separately, and Set and Earn requires hirers independent of the owner.',
      fix: 'Keep it if you only want the end-to-end test. Use a third wallet if the hire needs to count as independent.',
    });
  }
  return conflicts;
}

/**
 * The line this product holds about keys.
 *
 * One constant because it is said on more than one surface and the two
 * must not drift: a page that softens it once is a page that taught
 * somebody their key is sometimes wanted.
 */
export const NEVER_ASK_FOR_KEYS =
  'Pokter never asks for a private key or a recovery phrase, for any of these three roles. It reads addresses from the registry and from chain, and every signature is made in your own wallet. Anything that asks you to paste a key into Pokter is not Pokter.';
