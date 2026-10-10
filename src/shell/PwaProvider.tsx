'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

type InstallMethod = 'native' | 'ios' | null;

interface PwaContextValue {
  installMethod: InstallMethod;
  installed: boolean;
  install(): Promise<boolean>;
}

const PwaContext = createContext<PwaContextValue>({
  installMethod: null,
  installed: false,
  install: async () => false,
});

function isStandalone() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    ('standalone' in window.navigator &&
      Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone))
  );
}

function isIosMobile() {
  const platform = navigator.userAgent;
  const touchMac = /Macintosh/.test(platform) && navigator.maxTouchPoints > 1;
  return /iPhone|iPad|iPod/.test(platform) || touchMac;
}

export function PwaProvider({ children }: { children: React.ReactNode }) {
  const [promptEvent, setPromptEvent] = useState<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [ios, setIos] = useState(false);

  useEffect(() => {
    // Read browser-only capabilities after hydration without making the
    // server and first client render disagree.
    const environmentFrame = window.requestAnimationFrame(() => {
      setInstalled(isStandalone());
      setIos(isIosMobile());
    });

    const capturePrompt = (event: Event) => {
      event.preventDefault();
      setPromptEvent(event as InstallPromptEvent);
    };
    const markInstalled = () => {
      setInstalled(true);
      setPromptEvent(null);
    };

    window.addEventListener('beforeinstallprompt', capturePrompt);
    window.addEventListener('appinstalled', markInstalled);

    if (
      process.env.NODE_ENV === 'production' &&
      window.isSecureContext &&
      'serviceWorker' in navigator
    ) {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // Installation remains available even if offline support cannot start.
      });
    }

    return () => {
      window.cancelAnimationFrame(environmentFrame);
      window.removeEventListener('beforeinstallprompt', capturePrompt);
      window.removeEventListener('appinstalled', markInstalled);
    };
  }, []);

  const install = useCallback(async () => {
    if (!promptEvent) return false;
    await promptEvent.prompt();
    const choice = await promptEvent.userChoice;
    if (choice.outcome === 'accepted') setPromptEvent(null);
    return choice.outcome === 'accepted';
  }, [promptEvent]);

  const value = useMemo<PwaContextValue>(
    () => ({
      installed,
      installMethod: installed ? null : promptEvent ? 'native' : ios ? 'ios' : null,
      install,
    }),
    [installed, promptEvent, ios, install],
  );

  return <PwaContext.Provider value={value}>{children}</PwaContext.Provider>;
}

export function usePwaInstall() {
  return useContext(PwaContext);
}
