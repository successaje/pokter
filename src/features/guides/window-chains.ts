/**
 * Which escrows a guide's review window should speak for.
 *
 * `ReviewWindow` names every escrow it can read, which is right where a
 * reader may be on either network. It was used in a paragraph about
 * recording a review on PokterBoard, which takes jobs funded on mainnet
 * only — so the guide quoted a testnet figure beside a rule that can
 * never apply to a testnet job, and a newcomer was told their testnet
 * hire was reviewable.
 *
 * Narrowing is what fixes that, and it lives here rather than inside the
 * component because the component cannot be imported by a test: without
 * the `react-server` condition it throws on `server-only`, and with it
 * React has no `createContext` for the client context it pulls in. The
 * choice of networks is data either way, and out here it is checkable.
 *
 * Mainnet first, because a reader on one network should not have to look
 * past the other to find theirs, and mainnet is where money moves.
 */
export function windowChains(escrows: readonly number[], only?: number): number[] {
  return escrows
    .filter((id) => only === undefined || id === only)
    .sort((a, b) => (a === 56 ? -1 : b === 56 ? 1 : 0));
}
