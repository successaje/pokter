import type { Metadata } from 'next';
import { Suspense } from 'react';

import { HiredAgentsPage } from '@/features/workspace/Pages';

export const metadata: Metadata = { title: 'Hired agents' };

export default function Page() {
  return (
    <Suspense>
      <HiredAgentsPage />
    </Suspense>
  );
}
