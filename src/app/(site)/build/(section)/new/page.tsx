import type { Metadata } from 'next';
import { Suspense } from 'react';

import { NewAgent } from '@/features/studio/NewAgent';

// Personal or step-by-step builder pages: kept out of search, as they were under Studio.
export const metadata: Metadata = { title: 'Create an agent', robots: { index: false } };

export default function Page() {
  return (
    <Suspense>
      <NewAgent />
    </Suspense>
  );
}
