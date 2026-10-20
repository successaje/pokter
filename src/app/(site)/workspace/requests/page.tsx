import type { Metadata } from 'next';

import { PostedRequestsPage } from '@/features/workspace/PostedRequests';

export const metadata: Metadata = { title: 'My requests' };

export default function Page() {
  return <PostedRequestsPage />;
}
