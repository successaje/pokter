import type { Metadata } from 'next';

import { loadFleet, studioOwner } from '@/features/studio/data';
import { FleetList } from '@/features/studio/FleetList';
import { BuildingSignedOut } from '@/features/studio/SignedOut';
import { PageHeader } from '@/features/workspace/parts';
import { chainLabel } from '@/lib/network/presentation';
import { LinkButton } from '@/ui/Button';
import { Icon } from '@/ui/icons';

// Reads the builder's session cookie, so never cached.
export const dynamic = 'force-dynamic';
// Personal or step-by-step builder pages: kept out of search, as they were under Studio.
export const metadata: Metadata = { title: 'My agents', robots: { index: false } };

export default async function MyAgentsPage() {
  const owner = await studioOwner();
  const header = <PageHeader title="My agents" description="Agents this wallet owns, whether they answer, and their jobs." action={<LinkButton href="/build/new" size="s" trailing={<Icon.Plus size={13} />}>Create agent</LinkButton>} />;
  if (!owner) {
    return (
      <>
        {header}
        <BuildingSignedOut what="your agents" />
      </>
    );
  }
  const { agents, unavailable } = await loadFleet(owner);
  return (
    <>
      {header}
      {unavailable.length > 0 && (
        <p className="mb-3 text-sm text-watch">
          Pokter could not read this wallet&rsquo;s agents on {unavailable.map(chainLabel).join(' and ')} just now, so this list may be incomplete. Reload to try again.
        </p>
      )}
      <FleetList agents={agents} unavailable={unavailable} />
    </>
  );
}
