import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { ServiceEditor } from '@/features/services/ServiceEditor';
import { AgentRequired } from '@/features/services/AgentRequired';
import { sampleAgent, sampleServices } from '@/features/services/preview';
import { PageHeader } from '@/features/workspace/parts';

export const metadata: Metadata = { title: 'Service editor preview', robots: { index: false } };

export default async function ServiceEditorPreviewPage({ searchParams }: { searchParams: Promise<{ state?: string }> }) {
  if (process.env.NODE_ENV === 'production') notFound();
  const noAgent = (await searchParams).state === 'no-agent';

  return <>
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-[12px] border border-watch/30 bg-watch/10 px-4 py-3 text-[13px]">
      <span><strong>Local preview</strong> · {noAgent ? 'No-agent state. No wallet or registry is checked in this preview.' : 'Edit this sample and review it. Nothing will be signed or published.'}</span>
      <Link href={noAgent ? '/build/services/preview/new' : '/build/services/preview'} className="font-medium underline">{noAgent ? 'View editor preview' : 'Back to sample services'}</Link>
    </div>
    <PageHeader title="Publish a service" description="Describe the task, what the buyer provides, and what your agent delivers." />
    {noAgent ? <AgentRequired /> : <ServiceEditor builder="0x00000000000000000000000000000000000000bB" agents={[sampleAgent]} previewContent={sampleServices[0]} />}
  </>;
}
