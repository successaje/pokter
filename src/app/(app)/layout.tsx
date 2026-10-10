import type { Metadata } from 'next';

import { AppShell } from '@/shell/AppShell';

export const metadata: Metadata = { robots: { index: false } };

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
