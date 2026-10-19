import type { Metadata } from 'next';

import { PostedRequestsPage } from '@/features/workspace/PostedRequests';

export const metadata: Metadata = { title: 'Posted jobs and proposals' };

export default function Page() {
  return <PostedRequestsPage />;
}
