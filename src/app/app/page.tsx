import type { Metadata } from 'next';

import { MobileAppHome } from '@/components/app/MobileAppHome';

export const metadata: Metadata = {
  title: 'Home',
  description: 'Your Pokter wallet, agents and active work in one place.',
  robots: { index: false, follow: false },
};

export default function AppHomePage() {
  return <MobileAppHome />;
}
