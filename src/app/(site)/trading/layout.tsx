import { WalletRoot } from '@/shell/wallet/WalletRoot';

/**
 * The trading watch reads without a wallet, but changing a watched
 * wallet's own addresses is signed by that wallet, and `(site)` provides
 * no wallet context (see the requests layout).
 */
export default function TradingLayout({ children }: { children: React.ReactNode }) {
  return <WalletRoot>{children}</WalletRoot>;
}
