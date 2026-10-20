import type { Metadata } from 'next';
import { Suspense } from 'react';

import { SavedPage } from '@/features/workspace/Pages';

export const metadata: Metadata = { title: 'Saved agents' };

export default function Page() {
  return (
    <Suspense>
      <SavedPage />
    </Suspense>
  );
}
