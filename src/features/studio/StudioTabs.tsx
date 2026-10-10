'use client';

import type { ReactNode } from 'react';

import { HashTabBar, HashTabHintStyle, HashTabPanel } from '@/ui/HashTabs';

const STUDIO_TABS = [
  { id: 'health', label: 'Health' },
  { id: 'operations', label: 'Operations' },
  { id: 'jobs', label: 'Customer jobs' },
  { id: 'profile', label: 'Public profile' },
] as const;

export function StudioTabBar() {
  return (
    <HashTabBar
      tabs={STUDIO_TABS}
      label="Manage agent"
      panelsId="studio-tab-panels"
      className="sticky top-14 z-20 -mx-4 border-b border-rule bg-[color-mix(in_oklab,var(--paper)_92%,transparent)] px-4 backdrop-blur-md sm:-mx-6 sm:px-6 md:top-16 md:-mx-8 md:px-8"
    />
  );
}

export function StudioTabPanel({ id, children }: { id: (typeof STUDIO_TABS)[number]['id']; children: ReactNode }) {
  return (
    <HashTabPanel tabs={STUDIO_TABS} id={id}>
      {children}
    </HashTabPanel>
  );
}

export function StudioTabHint() {
  return (
    <>
      <HashTabHintStyle tabs={STUDIO_TABS} />
    </>
  );
}
