import type { Metadata } from 'next';

import { AppShell } from '@/shell/AppShell';
import { WalletRoot } from '@/shell/wallet/WalletRoot';

export const metadata: Metadata = { robots: { index: false } };

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <WalletRoot>
      <AppShell>{children}</AppShell>
    </WalletRoot>
  );
}
