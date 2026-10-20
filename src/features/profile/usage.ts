'use client';

import type { Usage } from '@/lib/profiles/model';

const KEY = 'pokter.usage.v1';

/**
 * How this wallet uses Pokter, remembered on this device for navigation.
 *
 * A convenience copy of what the wallet signed into its profile, so the
 * menu can lead with Hiring or Building without a request. It decides
 * emphasis only: every permission still comes from ownership checks.
 */
export function rememberUsage(wallet: string, usage: Usage | ''): void {
  try {
    const all = JSON.parse(window.localStorage.getItem(KEY) ?? '{}') as Record<string, string>;
    if (usage) all[wallet.toLowerCase()] = usage;
    else delete all[wallet.toLowerCase()];
    window.localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    /* Storage blocked: navigation falls back to the default. */
  }
}

export function rememberedUsage(wallet: string | undefined): Usage | '' {
  if (!wallet || typeof window === 'undefined') return '';
  try {
    const all = JSON.parse(window.localStorage.getItem(KEY) ?? '{}') as Record<string, string>;
    const value = all[wallet.toLowerCase()];
    return value === 'hire' || value === 'build' || value === 'both' ? value : '';
  } catch {
    return '';
  }
}
