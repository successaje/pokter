'use client';

import type { AgentRef } from '@/lib/scout/web-chat';

/**
 * Opening Scout from anywhere on the page.
 *
 * An event rather than a context, so a button deep inside a server-rendered
 * page can open the panel without the whole layout becoming a client
 * provider. `ScoutDock`, mounted once in the site layout, listens.
 */

export const SCOUT_OPEN_EVENT = 'pokter:scout-open';

export type ScoutOpen = {
  /** Set the conversation's subject: the agent the visitor is looking at. */
  about?: AgentRef & { name: string };
  /** A question to ask as soon as the panel is ready. */
  ask?: string;
};

export function openScout(detail: ScoutOpen = {}): void {
  window.dispatchEvent(new CustomEvent<ScoutOpen>(SCOUT_OPEN_EVENT, { detail }));
}
