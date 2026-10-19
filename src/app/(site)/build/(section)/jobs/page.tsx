import type { Metadata } from 'next';

import { DeliveryInbox } from '@/features/studio/DeliveryInbox';
import { loadFleet, studioOwner } from '@/features/studio/data';
import { BuildingSignedOut } from '@/features/studio/SignedOut';
import { PageHeader } from '@/features/workspace/parts';
import { chainLabel } from '@/lib/network/presentation';

// Reads the builder's session cookie, so never cached.
export const dynamic = 'force-dynamic';
// Personal or step-by-step builder pages: kept out of search, as they were under Studio.
export const metadata: Metadata = { title: 'Jobs', robots: { index: false } };

export default async function IncomingJobsPage() {
  const owner = await studioOwner();
  const header = <PageHeader title="Incoming jobs" description="Jobs funded for your agents through Pokter, with what each needs from you." />;
  if (!owner) {
    return (
      <>
        {header}
        <BuildingSignedOut what="jobs for your agents" />
      </>
    );
  }
  const { jobs, unavailable } = await loadFleet(owner);
  return (
    <>
      {header}
      {unavailable.length > 0 && (
        <p className="mb-3 text-sm text-watch">
          Pokter could not read this wallet&rsquo;s agents on {unavailable.map(chainLabel).join(' and ')} just now, so jobs for them may be missing. Reload to try again.
        </p>
      )}
      <DeliveryInbox jobs={jobs} />
    </>
  );
}
