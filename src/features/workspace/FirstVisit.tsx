'use client';

import { useState } from 'react';

import { useHydrated } from '@/lib/ui/use-hydrated';
import { Icon } from '@/ui/icons';

const KEY = 'pokter.workspace.intro.dismissed';

/**
 * What this place is, once, for somebody who has not been here before.
 *
 * Deliberately not a tour. It says the three things the Workspace does and
 * gets out of the way, because the page behind it is already legible and a
 * modal over it would be the second thing a new buyer had to dismiss after
 * connecting a wallet.
 *
 * The dismissal is remembered per browser. `localStorage` can throw in a
 * private window and comes back empty with site data cleared, so every read
 * and write is guarded and the note simply shows again — an extra sighting
 * is a far smaller cost than a crash on the first visit.
 */
function alreadyDismissed(): boolean {
  try {
    return window.localStorage.getItem(KEY) === '1';
  } catch {
    /* Private window, or site data blocked: show it rather than fail. */
    return false;
  }
}

export function FirstVisit({ onHelp }: { onHelp?: () => void }) {
  const hydrated = useHydrated();
  const [dismissedNow, setDismissedNow] = useState(false);

  // Read after hydration only, so the server and the first client render agree.
  if (!hydrated || dismissedNow || alreadyDismissed()) return null;

  const dismiss = () => {
    setDismissedNow(true);
    try {
      window.localStorage.setItem(KEY, '1');
    } catch {
      /* Remembering is a convenience; failing to is not worth an error. */
    }
  };

  return (
    <div className="mb-6 flex items-start gap-3 rounded-[14px] border border-rule bg-raised px-4 py-3.5">
      <Icon.Info size={17} className="mt-0.5 shrink-0 text-ink-3" aria-hidden />
      <div className="flex min-w-0 flex-col gap-1">
        <p className="text-[14px] leading-relaxed text-ink-2">
          Track your jobs, review deliveries and manage your agents here. Hires you fund appear under My jobs; switch to
          Building for the agents you build and the jobs they get.
        </p>
        {onHelp && (
          <button type="button" onClick={onHelp} className="self-start text-[13px] font-medium hover:underline">
            How hiring works
          </button>
        )}
      </div>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss this introduction"
        className="-mr-1 -mt-1 shrink-0 rounded-[8px] p-1.5 text-ink-3 transition-colors hover:bg-sunken hover:text-ink"
      >
        <Icon.Cross size={15} aria-hidden />
      </button>
    </div>
  );
}

/** Show it again, from a help entry that is always present. */
export function resetWorkspaceIntro(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* Nothing to undo if it was never stored. */
  }
}
