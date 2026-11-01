import type { Page } from '@playwright/test';

/*
 * A browser wallet for tests: an EIP-1193 provider at `window.ethereum` that
 * answers with a fixed account and chain, records every request made to it
 * and whether it answered, and signs and sends nothing. Requests that would
 * move money or sign are refused, as a person pressing Reject would, so a
 * test can assert both that the page never asked and what it did when
 * refused.
 *
 * It is a page script, so nothing here reaches a real wallet, a key or a
 * chain. Reads the page sends through the wallet go nowhere either: they
 * are answered by `reads`, or refused.
 */

export interface MockWallet {
  address: `0x${string}`;
  chainId: number;
  /** Answers for read methods (eth_call, eth_getTransactionReceipt...), by method name. */
  reads?: Record<string, unknown>;
}

export interface WalletCall {
  method: string;
  params: unknown;
  /** What the mock did: gave an answer, or refused as a person pressing Reject (or a wallet without the method) would. */
  outcome: 'answered' | 'refused';
}

/** Methods that ask the person to sign or pay. The mock refuses all of them. */
export const SIGNING_METHODS = ['eth_sendTransaction', 'wallet_sendCalls', 'eth_sign', 'personal_sign', 'eth_signTypedData_v4', 'eth_signTransaction'];

export async function installMockWallet(page: Page, wallet: MockWallet): Promise<void> {
  await page.addInitScript(
    ({ address, chainId, reads, signing }) => {
      const calls: Array<{ method: string; params: unknown; outcome: 'answered' | 'refused' }> = [];
      const listeners = new Map<string, Set<(...args: unknown[]) => void>>();
      const hex = `0x${chainId.toString(16)}`;
      const reject = (message: string, code: number) => Object.assign(new Error(message), { code });
      const answer = (method: string): unknown => {
        switch (method) {
          case 'eth_chainId':
            return hex;
          case 'net_version':
            return String(chainId);
          case 'eth_accounts':
          case 'eth_requestAccounts':
            return [address];
          case 'wallet_requestPermissions':
          case 'wallet_getPermissions':
            return [{ parentCapability: 'eth_accounts' }];
          case 'wallet_switchEthereumChain':
            return null;
          case 'wallet_getCapabilities':
            return {};
        }
        if (signing.includes(method)) throw reject('User rejected the request.', 4001);
        if (reads && method in reads) return reads[method];
        throw reject(`The mock wallet does not answer ${method}.`, 4200);
      };
      const provider = {
        isMockWallet: true,
        async request({ method, params }: { method: string; params?: unknown }) {
          // Recorded as refused until an answer is actually given.
          const call = { method, params: params ?? null, outcome: 'refused' as 'answered' | 'refused' };
          calls.push(call);
          const result = answer(method);
          call.outcome = 'answered';
          return result;
        },
        on(event: string, fn: (...args: unknown[]) => void) {
          if (!listeners.has(event)) listeners.set(event, new Set());
          listeners.get(event)!.add(fn);
        },
        removeListener(event: string, fn: (...args: unknown[]) => void) {
          listeners.get(event)?.delete(fn);
        },
      };
      Object.defineProperty(window, 'ethereum', { value: provider, configurable: true });
      Object.defineProperty(window, '__walletCalls', { value: calls });
      // Reconnect on load, as a wallet the person already connected would.
      try {
        localStorage.setItem('wagmi.recentConnectorId', JSON.stringify('injected'));
        localStorage.setItem('wagmi.injected.connected', 'true');
      } catch {
        /* Storage blocked: the test connects through the page instead. */
      }
    },
    { address: wallet.address, chainId: wallet.chainId, reads: wallet.reads ?? null, signing: SIGNING_METHODS },
  );
}

/** Every request the page has made to the mock wallet, in order. */
export function walletCalls(page: Page): Promise<WalletCall[]> {
  return page.evaluate(() => (window as unknown as { __walletCalls: WalletCall[] }).__walletCalls.slice());
}
