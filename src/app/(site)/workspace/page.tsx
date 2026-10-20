import type { Metadata } from 'next';

import { WorkspaceOverview } from '@/features/workspace/Overview';

export const metadata: Metadata = { title: 'Hiring' };

export default function WorkspacePage() {
  return <WorkspaceOverview />;
}
