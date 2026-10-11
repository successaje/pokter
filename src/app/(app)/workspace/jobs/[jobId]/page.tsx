import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { JobDetailLoader } from '@/features/workspace/JobDetail';
import { jobChainParam } from '@/lib/jobs/href';

export async function generateMetadata({ params }: { params: Promise<{ jobId: string }> }): Promise<Metadata> {
  const { jobId } = await params;
  return { title: `Job #${jobId}` };
}

export default async function JobPage({
  params,
  searchParams,
}: {
  params: Promise<{ jobId: string }>;
  searchParams: Promise<{ chain?: string }>;
}) {
  const [{ jobId }, { chain }] = await Promise.all([params, searchParams]);
  if (!/^\d{1,20}$/.test(jobId)) notFound();
  return <JobDetailLoader jobId={jobId} chainId={jobChainParam(chain)} />;
}
