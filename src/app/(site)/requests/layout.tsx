import { WalletRoot } from '@/shell/wallet/WalletRoot';

/**
 * Requests need a wallet and `(site)` does not provide one.
 *
 * Only `(app)` and `(flow)` wrap `WalletRoot`, so anything under `(site)`
 * that asks for the active wallet throws on render — the hire sheet hit
 * the same wall and solved it in its own route. A layout here does it once
 * for both pages instead of each island carrying its own provider, which
 * would give the page several wallet states that could disagree.
 */
export default function RequestsLayout({ children }: { children: React.ReactNode }) {
  return <WalletRoot>{children}</WalletRoot>;
}
