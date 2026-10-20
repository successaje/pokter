import { WalletRoot } from '@/shell/wallet/WalletRoot';

/* The owner edits their own profile here, which needs the active wallet; `(site)` provides none. */
export default function ProfileLayout({ children }: { children: React.ReactNode }) {
  return <WalletRoot>{children}</WalletRoot>;
}
