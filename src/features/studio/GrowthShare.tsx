'use client';

import { useState } from 'react';

import { Button } from '@/ui/Button';
import { Icon } from '@/ui/icons';

export function GrowthShare({ name, path, text }: { name: string; path: string; text: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <Button
      intent="secondary"
      size="s"
      icon={copied ? <Icon.Check size={14} /> : <Icon.Share size={14} />}
      onClick={async () => {
        const url = new URL(path, window.location.origin).toString();
        try {
          if (navigator.share && window.matchMedia('(pointer: coarse)').matches) {
            await navigator.share({ title: `${name} on Pokter`, text, url });
            return;
          }
          await navigator.clipboard.writeText(`${text}\n\nVerify the evidence: ${url}`);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1600);
        } catch {
          // Closing the native share sheet is not an error the builder needs to resolve.
        }
      }}
    >
      {copied ? 'Evidence copied' : 'Share evidence'}
    </Button>
  );
}
