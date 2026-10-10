import type { Metadata } from 'next';
import { Suspense } from 'react';

import { WalletPage } from '@/features/workspace/Pages';

export const metadata: Metadata = { title: 'Wallet and payments' };

export default function Page() {
  return (
    <Suspense>
      <WalletPage />
    </Suspense>
  );
}
