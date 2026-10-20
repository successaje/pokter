import type { Metadata } from 'next';
import { Suspense } from 'react';

import { BuildWithMcpCard } from '@/features/studio/BuildWithMcp';
import { BuildWithStudio } from '@/features/studio/BuildWithStudio';
import { NewAgent } from '@/features/studio/NewAgent';

// Personal or step-by-step builder pages: kept out of search, as they were under Studio.
export const metadata: Metadata = { title: 'Create an agent', robots: { index: false } };

export default function Page() {
  return (
    <>
      <Suspense>
        <NewAgent />
      </Suspense>
      {/* Other ways to make one, side by side, where someone is choosing how to build. */}
      <section aria-labelledby="other-ways-title" className="mt-16">
        <h2 id="other-ways-title" className="mb-4 text-[19px] font-medium tracking-[-0.015em]">
          Other ways to build
        </h2>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <BuildWithMcpCard />
          <BuildWithStudio compact />
        </div>
      </section>
    </>
  );
}
