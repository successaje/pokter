import type { Metadata } from 'next';

import { AccountProfile } from '@/components/account/AccountProfile';

export const metadata: Metadata = {
  title: 'Account',
  description: 'Your Pokter identity, wallets and workspace access.',
  robots: { index: false, follow: false },
};

export default function AccountPage() {
  return <AccountProfile />;
}
