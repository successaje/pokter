import { WalletRoot } from '@/shell/wallet/WalletRoot';

export default function ServiceLayout({ children }: { children: React.ReactNode }) {
  return <WalletRoot>{children}</WalletRoot>;
}
