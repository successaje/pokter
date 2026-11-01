/*
 * TEST ONLY. A signing key for the browser tests, and the house agent whose
 * registration the tests pretend it is.
 *
 * Generated for these tests and committed on purpose: it has never held
 * funds on any chain, must never be funded, and means nothing outside them.
 * Nothing in the app reads it. The test server is handed it as Brinkwatch's
 * house key (playwright.config.ts), and the replayed registry and indexer
 * name its address as Brinkwatch's agent wallet on testnet
 * (server-network.mjs), so the real quote route verifies a quote this key
 * signed. The real Brinkwatch wallet is untouched by any of it.
 */
export const TEST_AGENT = Object.freeze({
  chainId: 97,
  tokenId: '2618',
  slug: 'brinkwatch',
  name: 'Brinkwatch by Pokter',
  /** Testnet registry the wallet is read from (`IDENTITY_REGISTRY[97]` in src/lib/reviews/onchain.ts). */
  registry: '0x8004A818BFB912233c491871b3d84c89A494BD9e',
  privateKey: '0x06fcf05d914cd875f659ef4d5cf21c03d82ca519de68de56d2a864518e98c0bb',
  address: '0xcFDbDa4e8746bc098C9fC81eA1396eaBCbEb3358',
});
