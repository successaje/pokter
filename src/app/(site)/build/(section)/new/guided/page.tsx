import type { Metadata } from 'next';
import { Suspense } from 'react';

import { NewAgent } from '@/features/studio/NewAgent';

// Personal or step-by-step builder pages: kept out of search, as they were under Studio.
export const metadata: Metadata = { title: 'Guided setup', robots: { index: false } };

/** The form, with the listing previewed beside it. Reached from "Choose how to create your agent". */
export default function GuidedSetupPage() {
  return (
    <Suspense>
      <NewAgent />
    </Suspense>
  );
}
