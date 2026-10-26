/*
 * Browser rehearsal helper for docs/release/hire-tokens.md (section 8).
 * Paste into the hire page's console on a LOCAL flag-on build, with QUOTE set
 * to the JSON written by scripts/rehearsal-page-quote.mts.
 *
 * Part 1 is a NON-SIGNING stand-in wallet: reads go to public testnet RPC and
 * every signing method is rejected with 4001, so nothing can be signed or sent.
 * For section 9B (your own wallet), omit part 1 and keep only part 2.
 *
 * Part 2 replaces only the page's /api/hire/quote transport with that real quote.
 */
(() => {
  /* Part 1: stand-in wallet. */
  /* NON-SIGNING STAND-IN WALLET for local verification. Reads are proxied to public testnet RPC; every signing request is rejected with 4001. */
  const ADDR = '0xdAb12cf15F4385188bE62bda9F00877AF4C1b32f';
  const RPC = 'https://bsc-testnet-rpc.publicnode.com';
  const SIGNING = new Set(['eth_sendTransaction','eth_sign','personal_sign','eth_signTypedData','eth_signTypedData_v3','eth_signTypedData_v4','wallet_sendCalls','eth_sendRawTransaction']);
  window.__walletLog = [];
  const provider = {
    isStandIn: true,
    async request({ method, params }) {
      window.__walletLog.push(method);
      if (method === 'eth_accounts' || method === 'eth_requestAccounts') return [ADDR];
      if (method === 'eth_chainId') return '0x61';
      if (method === 'net_version') return '97';
      if (method === 'wallet_switchEthereumChain' || method === 'wallet_addEthereumChain') return null;
      if (method === 'wallet_getCapabilities') return {};
      if (method === 'wallet_requestPermissions' || method === 'wallet_getPermissions') return [{ parentCapability: 'eth_accounts' }];
      if (SIGNING.has(method)) { const e = new Error('User rejected the request.'); e.code = 4001; throw e; }
      const r = await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params: params ?? [] }) }).then((x) => x.json());
      if (r.error) { const e = new Error(r.error.message); e.code = r.error.code; throw e; }
      return r.result;
    },
    on() {}, removeListener() {},
  };
  window.ethereum = provider;
  const info = { uuid: '00000000-0000-4000-8000-000000000001', name: 'Stand-in (no signing)', icon: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciLz4=', rdns: 'xyz.pokter.standin' };
  const announce = () => window.dispatchEvent(new CustomEvent('eip6963:announceProvider', { detail: Object.freeze({ info, provider }) }));
  window.addEventListener('eip6963:requestProvider', announce); announce();
  /* Part 2, MOCKED TRANSPORT: /api/hire/quote returns a real USDT quote signed by the local Evidence handler. */
  const QUOTE = /* paste the JSON from scripts/rehearsal-page-quote.mts here */ null;
  if (!QUOTE) throw new Error('Set QUOTE first.');
  const real = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input.url;
    if (url.includes('/api/hire/quote')) return new Response(JSON.stringify(QUOTE), { status: 200, headers: { 'content-type': 'application/json' } });
    return real(input, init);
  };
  return 'installed';
})()
