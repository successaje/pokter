import 'server-only';

/**
 * The demo seller is a testnet fixture and must never run anywhere else.
 *
 * It accepts a funded job, submits a prepared manifest and takes the escrow.
 * On testnet that proves the lifecycle end to end. On mainnet it would charge
 * a real buyer real money for a deliverable written in advance, which is
 * indefensible at any price.
 *
 * Kept in its own module, free of `@altananetwork/sdk` imports, so it can
 * actually be tested. Reading the network through `altana/client` dragged the
 * SDK in, and `altana-sdk#88` makes that unresolvable under the
 * `react-server` condition `server-only` needs — so the guard could be read
 * but never run (POK-016). A safety gate nobody can execute is a comment.
 *
 * It reads `ALTANA_NETWORK` rather than the public variable deliberately:
 * that is the value deciding what actually gets signed, and a gate should
 * follow the signature, not the label.
 */
export function assertTestnetOnly(): void {
  if (process.env.ALTANA_NETWORK === 'bnb') {
    throw new Error(
      'The demo seller is testnet-only and will not run on mainnet. It returns a ' +
        'prepared deliverable, so charging a real buyer for it is not something ' +
        'this code is permitted to do.',
    );
  }
}
