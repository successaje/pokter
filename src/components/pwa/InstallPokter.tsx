'use client';

import { useState } from 'react';

import { usePwaInstall } from './PwaProvider';

function InstallIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="size-4 fill-none stroke-current" strokeWidth="1.8">
      <path d="M12 3v12m0 0 4-4m-4 4-4-4" />
      <path d="M5 16v2a3 3 0 0 0 3 3h8a3 3 0 0 0 3-3v-2" />
    </svg>
  );
}

export function InstallPokter({ onComplete }: { onComplete?: () => void }) {
  const { installMethod, install } = usePwaInstall();
  const [showIosHelp, setShowIosHelp] = useState(false);

  if (!installMethod) return null;

  return (
    <div className="border-t border-[color:var(--border)] pt-1.5">
      <button
        type="button"
        onClick={async () => {
          if (installMethod === 'ios') {
            setShowIosHelp((visible) => !visible);
            return;
          }
          if (await install()) onComplete?.();
        }}
        aria-expanded={installMethod === 'ios' ? showIosHelp : undefined}
        className="flex w-full items-center gap-2.5 rounded-[var(--radius)] px-3 text-left text-sm text-[color:var(--text)] transition-colors hover:bg-[color:var(--surface-hover)]"
      >
        <span className="text-[color:var(--brand)]"><InstallIcon /></span>
        <span className="flex flex-1 flex-col">
          <span className="font-medium">Install Pokter</span>
          <span className="text-[10px] text-[color:var(--text-faint)]">Open faster from your Home Screen</span>
        </span>
        <span aria-hidden>→</span>
      </button>
      {showIosHelp && (
        <p className="px-3 pb-2 pt-1 text-[12px] leading-relaxed text-[color:var(--text-muted)]">
          Tap the browser Share button, then choose <strong className="font-medium text-[color:var(--text)]">Add to Home Screen</strong>.
        </p>
      )}
    </div>
  );
}
