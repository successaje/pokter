import type { Metadata } from 'next';
import { Suspense } from 'react';

import { NewAgent } from '@/features/studio/NewAgent';

export const metadata: Metadata = { title: 'Create an agent' };

export default function Page() {
  return (
    <Suspense>
      <NewAgent />
    </Suspense>
  );
}
