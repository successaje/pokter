import { WalletRoot } from '@/shell/wallet/WalletRoot';

/**
 * Build lives in the site's own layout, under the same header as Discover
 * and Proof, with Build lit in it. Its pages read the builder's wallet, and
 * `(site)` provides none, so the provider is added here once for every page
 * under /build rather than per island.
 */
export default function BuildLayout({ children }: { children: React.ReactNode }) {
  return <WalletRoot>{children}</WalletRoot>;
}
