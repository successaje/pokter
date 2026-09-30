import type { Metadata } from 'next';

import { BuilderStudio } from '@/components/builder/BuilderStudio';

export const metadata: Metadata = {
  title: 'Build an agent',
  description:
    'Prepare, verify and list an ERC-8004 agent for discovery on Pokter.',
};

export default function BuildPage() {
  return <BuilderStudio />;
}
