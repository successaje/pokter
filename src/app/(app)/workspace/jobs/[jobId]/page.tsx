import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { JobDetailLoader } from '@/features/workspace/JobDetail';

export async function generateMetadata({ params }: { params: Promise<{ jobId: string }> }): Promise<Metadata> {
  const { jobId } = await params;
  return { title: `Job #${jobId}` };
}

export default async function JobPage({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  if (!/^\d{1,20}$/.test(jobId)) notFound();
  return <JobDetailLoader jobId={jobId} />;
}
