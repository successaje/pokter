import type { Metadata } from 'next';
import { Suspense } from 'react';

import { JobsPage } from '@/features/workspace/Pages';

export const metadata: Metadata = { title: 'Jobs' };

export default function Page() {
  return (
    <Suspense>
      <JobsPage />
    </Suspense>
  );
}
