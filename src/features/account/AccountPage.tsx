'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { useState, useSyncExternalStore } from 'react';

import { NETWORK_LABEL } from '@/lib/network/presentation';
import { notificationSettings, saveNotificationSettings, subscribeToNotifications } from '@/lib/wallet/notifications';
import { revokeExternalWalletAllowance } from '@/lib/wallet/external';
import { walletActionError } from '@/lib/wallet/errors';
import { useConnect } from '@/shell/wallet/ConnectProvider';
import { useWalletState } from '@/shell/wallet/useWalletState';
import { usePwaInstall } from '@/shell/PwaProvider';
import { ThemeSegmented } from '@/shell/ThemeControl';
import { jobPhase, useMyJobs } from '@/features/workspace/hooks';
import { PageHeader } from '@/features/workspace/parts';
import { Button, LinkButton } from '@/ui/Button';
import { Address } from '@/ui/Data';
import { Notice } from '@/ui/Feedback';
import { Field, Input, Select } from '@/ui/Field';
import { Icon } from '@/ui/icons';

function Section({ id, title, description, children }: { id: string; title: string; description?: string; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-t`} className="grid grid-cols-1 scroll-mt-24 gap-6 border-t border-rule py-8 md:grid-cols-[240px_minmax(0,1fr)]">
      <div className="flex flex-col gap-1">
        <h2 id={`${id}-t`} className="t-h3">
          {title}
        </h2>
        {description && <p className="text-[13px] leading-relaxed text-ink-3">{description}</p>}
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

function Notifications({ address }: { address: string }) {
  const settings = useSyncExternalStore(
    subscribeToNotifications,
    () => JSON.stringify(notificationSettings(address)),
    () => '{}',
  );
  const s = JSON.parse(settings) as ReturnType<typeof notificationSettings>;
  const { jobs } = useMyJobs();
  const active = jobs.filter((j) => ['working', 'review'].includes(jobPhase(j)));
  const [email, setEmail] = useState('');
  const [chosenJob, setJobId] = useState('');
  // Always one of the jobs actually listed, even as the list changes.
  const jobId = active.some((j) => j.jobId === chosenJob) ? chosenJob : (active[0]?.jobId ?? '');
  const [state, setState] = useState<'idle' | 'busy' | 'sent' | 'error'>('idle');
  const [message, setMessage] = useState<string | null>(null);

  const toggleBrowser = async (on: boolean) => {
    if (on && 'Notification' in window && Notification.permission !== 'granted') {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setMessage('Your browser blocked notifications for this site. Allow them in the site settings to turn this on.');
        return;
      }
    }
    saveNotificationSettings({ ...s, walletAddress: address, browser: on });
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <label className="flex items-center justify-between gap-4 text-sm">
          <span>
            <span className="font-medium">In Pokter</span>
            <span className="block text-[12.5px] text-ink-3">Job updates in your inbox on this device</span>
          </span>
          <input type="checkbox" className="size-5 accent-[var(--ink)]" checked={Boolean(s.inApp)} onChange={(e) => saveNotificationSettings({ ...s, walletAddress: address, inApp: e.target.checked })} />
        </label>
        <label className="flex items-center justify-between gap-4 text-sm">
          <span>
            <span className="font-medium">Browser notifications</span>
            <span className="block text-[12.5px] text-ink-3">A system notification when a job changes, while Pokter is open</span>
          </span>
          <input type="checkbox" className="size-5 accent-[var(--ink)]" checked={Boolean(s.browser)} onChange={(e) => void toggleBrowser(e.target.checked)} />
        </label>
      </div>
      <div className="flex flex-col gap-3 rounded-[12px] border border-rule p-4">
        <p className="text-sm font-medium">Email me about a job</p>
        <p className="text-[12.5px] text-ink-3">Emails are per job and need confirming. Pokter checks on chain that this wallet funded it.</p>
        {active.length === 0 ? (
          <p className="text-[13px] text-ink-3">No job in progress to follow.</p>
        ) : (
          <form
            className="flex flex-col gap-3"
            onSubmit={async (e) => {
              e.preventDefault();
              setState('busy');
              setMessage(null);
              try {
                const r = await fetch('/api/notifications/subscribe', {
                  method: 'POST',
                  headers: { 'content-type': 'application/json' },
                  body: JSON.stringify({ email, walletAddress: address, jobId }),
                });
                const body = (await r.json().catch(() => ({}))) as { error?: string };
                if (!r.ok) throw new Error(body.error ?? 'The subscription was not accepted.');
                setState('sent');
              } catch (err) {
                setMessage((err as Error).message);
                setState('error');
              }
            }}
          >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Job">
                {(p) => (
                  <Select {...p} value={jobId} onChange={(e) => setJobId(e.target.value)}>
                    {active.map((j) => (
                      <option key={j.jobId} value={j.jobId}>
                        #{j.jobId} · {j.agentName}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <Field label="Email">
                {(p) => <Input {...p} type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />}
              </Field>
            </div>
            <Button type="submit" intent="secondary" busy={state === 'busy'} className="self-start">
              Send confirmation
            </Button>
            {state === 'sent' && <Notice tone="ok">Check your inbox for a confirmation link.</Notice>}
          </form>
        )}
      </div>
      {message && <Notice tone="watch">{message}</Notice>}
    </div>
  );
}

export function AccountPage() {
  const w = useWalletState();
  const { openConnect } = useConnect();
  const pwa = usePwaInstall();
  const [revoking, setRevoking] = useState(false);
  const [revokeMessage, setRevokeMessage] = useState<string | null>(null);
  const builder = useQuery({
    queryKey: ['builder-session'],
    queryFn: async () => (await (await fetch('/api/builders/session', { cache: 'no-store' })).json()) as { authenticated: boolean; owner?: string },
  });

  return (
    <>
      <PageHeader title="Account" description="One account for hiring and building. Your identity is your wallet; Pokter keeps no password and no email unless you give one for job updates." />

      <nav aria-label="Account sections" className="no-scrollbar -mx-4 mb-2 flex gap-2 overflow-x-auto px-4 text-[13px] md:mx-0 md:px-0">
        {[
          ['wallets', 'Wallets'],
          ['security', 'Security'],
          ['notifications', 'Notifications'],
          ['preferences', 'Preferences'],
          ['building', 'Building'],
        ].map(([id, label]) => (
          <a key={id} href={`#${id}`} className="shrink-0 rounded-full border border-rule px-3 py-1.5 text-ink-2 hover:border-ink hover:text-ink">
            {label}
          </a>
        ))}
      </nav>

      <Section id="wallets" title="Wallets" description={`Which wallet signs on ${NETWORK_LABEL}. A connected browser wallet takes precedence over a passkey wallet on this device.`}>
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-[12px] border border-rule bg-raised p-4">
            <div className="flex items-center gap-3">
              <span className="grid size-9 place-items-center rounded-[9px] bg-sunken"><Icon.Wallet size={17} /></span>
              <div>
                <p className="text-sm font-medium">
                  {w.connectorName ?? 'Browser wallet'}{' '}
                  <span className="ml-1 rounded-full bg-signal-wash px-2 py-0.5 text-[11px] font-medium text-ink">Recommended</span>{' '}
                  {w.mode === 'external' && <span className="ml-1 text-[12px] text-ok">· signing</span>}
                  {w.wrongChain && <span className="ml-1 text-[12px] text-watch">· on {w.externalChainName}</span>}
                </p>
                {w.externalAddress ? <Address address={w.externalAddress} /> : <p className="text-[12.5px] text-ink-3">Not connected</p>}
              </div>
            </div>
            {w.externalConnected ? (
              <div className="flex gap-2">
                {w.wrongChain && (
                  <Button size="s" onClick={w.switchToEscrowChain} busy={w.switching}>
                    Switch network
                  </Button>
                )}
                <Button intent="ghost" size="s" onClick={w.disconnectExternal}>
                  Disconnect
                </Button>
              </div>
            ) : (
              <Button intent="secondary" size="s" onClick={() => openConnect()}>
                Connect
              </Button>
            )}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-[12px] border border-rule bg-raised p-4">
            <div className="flex items-center gap-3">
              <span className="grid size-9 place-items-center rounded-[9px] bg-sunken"><Icon.Key size={17} /></span>
              <div>
                <p className="text-sm font-medium">Passkey wallet {w.mode === 'passkey' && <span className="ml-1 text-[12px] text-ok">· signing</span>}</p>
                {w.passkey.wallet ? <Address address={w.passkey.wallet.address} /> : <p className="text-[12.5px] text-ink-3">None on this device</p>}
              </div>
            </div>
            {w.passkey.wallet ? (
              <Button intent="ghost" size="s" onClick={w.passkey.forget}>
                Forget on this device
              </Button>
            ) : (
              <Button intent="secondary" size="s" onClick={() => openConnect()}>
                Create or restore
              </Button>
            )}
          </div>
          <p className="text-[12.5px] text-ink-3">Forgetting a passkey wallet only removes it from this browser. Restore it any time with the same passkey; the address and funds do not change.</p>
        </div>
      </Section>

      <Section id="security" title="Security and permissions" description="What Pokter, and any agent you hired, can do with your wallet.">
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-[12px] border border-rule bg-raised p-4">
              <p className="t-label">Standing permissions</p>
              <p className="mt-1 text-2xl font-semibold">None</p>
              <p className="mt-1 text-[12.5px] text-ink-3">Pokter never creates session keys or delegated authority. Each hire is a single escrow payment.</p>
            </div>
            <div className="rounded-[12px] border border-rule bg-raised p-4">
              <p className="t-label">Token approvals</p>
              <p className="mt-1 text-[13.5px] text-ink-2">A browser-wallet hire approves exactly the job budget to the escrow, which the hire spends. If a hire stopped half way, an unused approval may remain.</p>
              {w.mode === 'external' && w.address && (
                <Button
                  size="s"
                  intent="secondary"
                  className="mt-3"
                  busy={revoking}
                  onClick={async () => {
                    setRevoking(true);
                    setRevokeMessage(null);
                    try {
                      await revokeExternalWalletAllowance(w.address as `0x${string}`);
                      setRevokeMessage('Approval set to zero.');
                    } catch (err) {
                      setRevokeMessage(walletActionError(err, 'Revoking the approval'));
                    } finally {
                      setRevoking(false);
                    }
                  }}
                >
                  Set escrow approval to zero
                </Button>
              )}
              {revokeMessage && <p className="mt-2 text-[12.5px] text-ink-2">{revokeMessage}</p>}
            </div>
          </div>
          <Notice tone="neutral" title="Pokter will never ask for">
            Your seed phrase, private key or a signature that grants spending beyond one job. Anything asking for those on a page that looks like Pokter is not Pokter.
          </Notice>
        </div>
      </Section>

      <Section id="notifications" title="Notifications" description="How you hear about jobs you funded.">
        {w.address ? <Notifications address={w.address} /> : <p className="text-sm text-ink-3">Connect a wallet to choose how you are notified.</p>}
      </Section>

      <Section id="preferences" title="Preferences">
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium">Appearance</span>
            <ThemeSegmented />
            <p className="text-[12.5px] text-ink-3">System follows your device. Motion follows your device&rsquo;s reduce-motion setting.</p>
          </div>
          {pwa.installMethod && (
            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium">Install Pokter</span>
              {pwa.installMethod === 'native' ? (
                <Button intent="secondary" size="s" onClick={() => void pwa.install()} className="self-start" icon={<Icon.Download size={15} />}>
                  Install as an app
                </Button>
              ) : (
                <p className="text-[13px] text-ink-2">On iPhone: tap Share, then Add to Home Screen.</p>
              )}
            </div>
          )}
        </div>
      </Section>

      <Section id="building" title="Building" description="Publishing agents uses the same account.">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[12px] border border-rule bg-raised p-4">
          <div className="text-sm">
            {builder.data?.authenticated ? (
              <>
                <p className="font-medium">Signed in to Builder Studio</p>
                <p className="text-[12.5px] text-ink-3">Verified as the owner of agents held by {builder.data.owner?.slice(0, 6)}…{builder.data.owner?.slice(-4)}</p>
              </>
            ) : (
              <>
                <p className="font-medium">Not signed in to Builder Studio</p>
                <p className="text-[12.5px] text-ink-3">You verify ownership of an agent once, by signing a message with its owner wallet.</p>
              </>
            )}
          </div>
          <LinkButton href="/studio" size="s" intent="secondary">
            Open Studio
          </LinkButton>
        </div>
        <p className="mt-3 text-[12.5px] text-ink-3">
          Saved agents and job memory live in this browser. <Link href="/workspace/saved" className="link">Saved agents</Link>
        </p>
      </Section>
    </>
  );
}
