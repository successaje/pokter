'use client';

import { useEffect } from 'react';

import type { ConversionEvent } from '@/lib/conversion/funnel';

function key(event: ConversionEvent, chainId: number, tokenId: string, escrowChainId: number | null) {
  return `pokter:conversion:${event}:${chainId}:${tokenId}:${escrowChainId ?? 0}`;
}

/** One event per tab session. The key stays on the device and is never sent. */
export function recordConversionOnce(event: ConversionEvent, chainId: number, tokenId: string, escrowChainId: number | null = null) {
  const storageKey = key(event, chainId, tokenId, escrowChainId);
  try {
    if (window.sessionStorage.getItem(storageKey)) return;
    window.sessionStorage.setItem(storageKey, '1');
  } catch {
    // Privacy modes may disable storage; the server still receives an aggregate event.
  }
  const body = JSON.stringify({ event, chainId, tokenId, escrowChainId });
  if (navigator.sendBeacon && navigator.sendBeacon('/api/conversion', new Blob([body], { type: 'application/json' }))) {
    return;
  }
  void fetch('/api/conversion', { method: 'POST', headers: { 'content-type': 'application/json' }, body, keepalive: true });
}

export function ConversionBeacon({ event, chainId, tokenId, escrowChainId = null }: { event: ConversionEvent; chainId: number; tokenId: string; escrowChainId?: number | null }) {
  useEffect(() => {
    recordConversionOnce(event, chainId, tokenId, escrowChainId);
  }, [event, chainId, tokenId, escrowChainId]);
  return null;
}
