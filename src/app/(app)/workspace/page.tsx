import type { Metadata } from 'next';

import { WorkspaceOverview } from '@/features/workspace/Overview';

export const metadata: Metadata = { title: 'Workspace' };

export default function WorkspacePage() {
  return <WorkspaceOverview />;
}
