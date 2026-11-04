import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { ServiceEditor } from '@/features/services/ServiceEditor';
import { PageHeader } from '@/features/workspace/parts';

import { sampleAgent, sampleService } from '../sample';

export const metadata: Metadata = { title: 'Service editor preview', robots: { index: false } };

export default function ServiceEditorPreviewPage() {
  if (process.env.NODE_ENV === 'production') notFound();

  return <>
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-[12px] border border-watch/30 bg-watch/10 px-4 py-3 text-[13px]">
      <span><strong>Local preview</strong> · Edit this sample and review it. Nothing will be signed or published.</span>
      <Link href="/build/services/preview" className="font-medium underline">Back to sample services</Link>
    </div>
    <PageHeader title="Publish a service" description="Describe the task, what the buyer provides, and what your agent delivers." />
    <ServiceEditor builder="0x00000000000000000000000000000000000000bB" agents={[sampleAgent]} previewContent={sampleService} />
  </>;
}
