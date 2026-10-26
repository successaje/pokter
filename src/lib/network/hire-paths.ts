import { enabledHireTokens, offeredTokens, type HireTokenSet, type PaymentToken } from './tokens';

/**
 * Which way into a hire can fund which money.
 *
 * One table, read by the hire flow (to refuse a path before a wallet is
 * asked), by the release notes and by tests, so "supported" means the same
 * thing everywhere. `$U` is the escrow default and every path funds it.
 * Another token is funded only where the path builds `createJobWithToken`
 * and approves that token, and only where that has been exercised:
 *
 * - browser wallet, one transaction at a time: yes.
 * - browser wallet, one atomic batch (`wallet_sendCalls`): no. The same calls,
 *   but the batch path has not been run end to end for another token, so it
 *   is switched off for them and the hire falls back to one at a time.
 * - passkey wallet: no. It funds through the SDK's `hireErc8183Agent`, which
 *   only creates `$U` jobs.
 * - server hire (`hireAgent`): yes, given the signed token and amount. No
 *   public route passes them.
 * - prepared hire (`prepare_hire`): yes, when the owner names the token.
 * - requests board and proposals (and the seller tools that write them): yes.
 *   A request names its token; a proposal must be in that same token, is
 *   compared in raw units, and is hired through the browser wallet path.
 */
export type HirePath = 'browser-wallet' | 'browser-wallet-batch' | 'passkey-wallet' | 'server-hire' | 'prepared-hire' | 'requests-board';

export const HIRE_PATHS: Record<HirePath, { label: string; otherTokens: boolean; why: string }> = {
  'browser-wallet': { label: 'Browser wallet, one transaction at a time', otherTokens: true, why: 'Builds createJobWithToken and approves exactly the signed amount in that token.' },
  'browser-wallet-batch': { label: 'Browser wallet, one atomic batch', otherTokens: false, why: 'Not yet exercised end to end for another token; such hires are sent one transaction at a time.' },
  'passkey-wallet': { label: 'Passkey wallet', otherTokens: false, why: 'Funds through the SDK, which only creates $U jobs.' },
  'server-hire': { label: 'Server hire (operator)', otherTokens: true, why: 'Funds the signed token and amount when both are passed.' },
  'prepared-hire': { label: 'Prepared hire (prepare_hire)', otherTokens: true, why: 'Only when the owner names the token; the ceiling is then counted in it.' },
  'requests-board': { label: 'Requests board and proposals', otherTokens: true, why: 'The request names its token; a proposal is signed in the same token, compared in raw units, and hired through a browser wallet.' },
};

/** Whether a path can fund this token. Null is the escrow default ($U), which every path funds. */
export function pathFundsToken(path: HirePath, token: PaymentToken | null): boolean {
  return token === null || token.offered || HIRE_PATHS[path].otherTokens;
}

/** Every offered token on a chain, with the paths that fund it: the table the release notes print. */
export function hireSupportMatrix(chainId: number, tokens: HireTokenSet = enabledHireTokens()) {
  return offeredTokens(chainId, tokens).map((token) => ({
    chainId,
    token: token.address,
    symbol: token.symbol,
    paths: Object.fromEntries((Object.keys(HIRE_PATHS) as HirePath[]).map((path) => [path, pathFundsToken(path, token)])) as Record<HirePath, boolean>,
  }));
}
