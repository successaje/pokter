'use client';

import type { ReactNode } from 'react';

import { HashTabBar, HashTabHint, HashTabHintStyle, HashTabPanel } from '@/ui/HashTabs';

export const AGENT_TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'evidence', label: 'Evidence' },
  { id: 'work', label: 'Work and reviews' },
  { id: 'pricing', label: 'Pricing' },
  { id: 'permissions', label: 'Permissions' },
  { id: 'technical', label: 'Technical' },
] as const;

export type AgentTabId = (typeof AGENT_TABS)[number]['id'];

/** #try is the free trial, which lives in Overview. */
const ANCHORS = { try: 'overview' };

export function AgentTabBar() {
  return (
    <HashTabBar
      tabs={AGENT_TABS}
      anchors={ANCHORS}
      label="Agent details"
      panelsId="agent-tab-panels"
      className="sticky top-14 z-20 border-b border-rule bg-[color-mix(in_oklab,var(--paper)_92%,transparent)] backdrop-blur-md"
      innerClassName="frame"
    />
  );
}

export function AgentTabPanel({ id, children }: { id: AgentTabId; children: ReactNode }) {
  return (
    <HashTabPanel tabs={AGENT_TABS} anchors={ANCHORS} id={id}>
      {children}
    </HashTabPanel>
  );
}

export function AgentTabHint() {
  return (
    <>
      <HashTabHintStyle tabs={AGENT_TABS} />
      <HashTabHint tabs={AGENT_TABS} />
    </>
  );
}
