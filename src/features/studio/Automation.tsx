'use client';

import Link from 'next/link';
import { useState } from 'react';
import { getAddress } from 'viem';
import { useAccount } from 'wagmi';

import { AUTOMATION_SCOPES, DEFAULT_TOKEN_DAYS, TOKEN_DAY_CHOICES } from '@/lib/builders/automation-token';
import { TOKEN_ENV_NAME, tokenEnvLine } from '@/lib/builders/automation-prompt';
import { bidMessage } from '@/lib/briefs/model';
import { formatQuotedPrice } from '@/lib/erc8183/pricing';
import { requestToken } from '@/lib/network/tokens';
import { shortAddress } from '@/lib/ui/format';
import { cn } from '@/lib/ui/cn';
import { useLiveSignMessage } from '@/lib/wallet/use-live-sign-message';
import { useConnect } from '@/shell/wallet/ConnectProvider';
import { Button } from '@/ui/Button';
import { CodeBlock, CopyButton } from '@/ui/Data';
import { EmptyState, Notice } from '@/ui/Feedback';
import { Checkbox, Field, Input, Select } from '@/ui/Field';

export interface TokenRow {
  id: string;
  label: string;
  hint: string;
  scopes: string[];
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
  lastUsedAt: string | null;
  state: string;
}

const when = (iso: string | null) => (iso ? new Date(iso).toUTCString().slice(5, 22) : '—');

/**
 * Minting, listing and revoking the credential a provider's assistant holds.
 *
 * The secret appears exactly once, in the response to the mint, and this
 * component is the only place it is ever shown. It is deliberately not put
 * into a pre-built shell command for copying: a command with a live
 * credential in it goes into shell history, and the point of showing the
 * export line with a placeholder is that the user pastes the value
 * themselves and decides where it lands.
 *
 * That was the comment, and the line below it rendered `export
 * POKTER_AUTOMATION_TOKEN=${minted.token}` — a copy button that put the
 * live credential straight into `~/.zsh_history`, while
 * `tokenEnvLine()`, written for exactly this with a placeholder, had no
 * call sites at all. The token is its own copyable block and the shell
 * line is the placeholder, which is what the comment always claimed.
 */
export function AutomationTokens({ initial }: { initial: TokenRow[] }) {
  const [tokens, setTokens] = useState(initial);
  const [minted, setMinted] = useState<{ token: string; label: string; expiresAt: string } | null>(null);
  const [scopes, setScopes] = useState<string[]>(AUTOMATION_SCOPES.map((s) => s.id));
  const [label, setLabel] = useState('');
  const [days, setDays] = useState(String(DEFAULT_TOKEN_DAYS));
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const post = async (body: unknown) => {
    const response = await fetch('/api/builders/automation', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const payload = (await response.json().catch(() => ({}))) as Record<string, unknown> & { error?: string };
    if (!response.ok) throw new Error(payload.error ?? 'Pokter refused that.');
    return payload;
  };

  const mint = async () => {
    setError(null);
    setBusy('mint');
    try {
      const payload = (await post({ action: 'mint', label, scopes, days: Number(days) })) as {
        token: string;
        label: string;
        expiresAt: string;
        tokens: TokenRow[];
      };
      setMinted({ token: payload.token, label: payload.label, expiresAt: payload.expiresAt });
      setTokens(payload.tokens);
      setLabel('');
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const revoke = async (id: string) => {
    setError(null);
    setBusy(id);
    try {
      const payload = (await post({ action: 'revoke', id })) as { revoked: boolean; tokens: TokenRow[] };
      setTokens(payload.tokens);
      /* The minted secret is cleared as soon as anything else happens on
         this page: it is shown once, and leaving it on screen through a
         revocation is leaving a credential lying about. */
      setMinted(null);
      if (!payload.revoked) setError('That token was already revoked or expired. Nothing changed.');
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      {minted && (
        <Notice tone="ok" title="Copy this token now — Pokter will not show it again">
          <div className="flex flex-col gap-2">
            <CodeBlock wrap label="Copy token">{minted.token}</CodeBlock>
            <p>
              Put it in your environment or in a config file your assistant reads. <strong>Do not paste it into a chat,
              a commit or an issue.</strong> It expires {when(minted.expiresAt)} UTC and you can revoke it below at any
              time; revocation takes effect on the next call.
            </p>
            <CodeBlock wrap label="Copy the export line">{tokenEnvLine()}</CodeBlock>
            <p className="text-[12.5px] text-ink-3">
              The export line is a placeholder on purpose: paste the token in place of{' '}
              <span className="t-readout">pka_…</span> yourself. A command with the live token in it is a command your
              shell writes to its history file, where it stays long after{' '}
              <span className="t-readout">{TOKEN_ENV_NAME}</span> has been revoked.
            </p>
          </div>
        </Notice>
      )}

      <div className="flex flex-col gap-4 rounded-[14px] border border-rule bg-raised p-5">
        <div className="flex flex-col gap-1">
          <h3 className="text-sm font-medium">Mint an automation token</h3>
          <p className="text-[13px] text-ink-3">
            Grant only what the assistant needs. There is no scope for signing a transaction or moving funds, and there
            cannot be one — Pokter holds no key of yours.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name it" hint="For your own records; it is not a secret.">
            {(props) => <Input {...props} value={label} onChange={(e) => setLabel(e.target.value)} maxLength={60} placeholder="Laptop, Claude Code" />}
          </Field>
          <Field label="Expires after">
            {(props) => (
              <Select {...props} value={days} onChange={(e) => setDays(e.target.value)}>
                {TOKEN_DAY_CHOICES.map((choice) => (
                  <option key={choice} value={choice}>
                    {choice} day{choice === 1 ? '' : 's'}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
        <div className="flex flex-col gap-2.5">
          {AUTOMATION_SCOPES.map((scope) => (
            <Checkbox
              key={scope.id}
              checked={scopes.includes(scope.id)}
              onChange={(e) =>
                setScopes((current) => (e.target.checked ? [...current, scope.id] : current.filter((s) => s !== scope.id)))
              }
              label={
                <span>
                  {scope.label} <span className="t-readout text-[12px] text-ink-3">{scope.id}</span>
                </span>
              }
              description={scope.what}
            />
          ))}
        </div>
        {error && <Notice tone="bad">{error}</Notice>}
        <Button size="s" className="self-start" busy={busy === 'mint'} disabled={scopes.length === 0 || busy !== null} onClick={() => void mint()}>
          Mint token
        </Button>
      </div>

      <div className="flex flex-col gap-3">
        <h3 className="text-sm font-medium">Your tokens</h3>
        {tokens.length === 0 ? (
          <p className="text-[13px] text-ink-3">None yet. A token is the only way an assistant can reach Pokter on your behalf.</p>
        ) : (
          <ul className="ruled border-y border-rule">
            {tokens.map((token) => (
              <li key={token.id} className="flex flex-col gap-1.5 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
                <span className="flex min-w-0 flex-col gap-1">
                  <span className="truncate text-sm font-medium">
                    {token.label} <span className="t-readout font-normal text-ink-3">…{token.hint}</span>
                  </span>
                  <span className="text-[12.5px] text-ink-3">
                    {token.scopes.join(', ') || 'no scopes'} · expires {when(token.expiresAt)} ·{' '}
                    {token.lastUsedAt ? `last call ${when(token.lastUsedAt)}` : 'never used'}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-3">
                  <span
                    className={cn(
                      'rounded-full border px-2 py-0.5 text-[11.5px] font-medium',
                      token.state === 'Active' ? 'border-ok/30 bg-ok-wash text-ok' : 'border-rule-strong text-ink-3',
                    )}
                  >
                    {token.state}
                  </span>
                  {token.state === 'Active' && (
                    <Button size="s" intent="danger" busy={busy === token.id} disabled={busy !== null} onClick={() => void revoke(token.id)}>
                      Revoke
                    </Button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export interface StagedProposalRow {
  key: string;
  requestId: string;
  requestTitle: string | null;
  requestOpen: boolean;
  agentChainId: number;
  agentTokenId: string;
  /** The amount, in whole units of `paymentToken` (named `priceU` from when every price was $U). */
  priceU: number;
  /**
   * The escrow chain of the request it answers, and the token the proposal
   * is priced in. A staged proposal written before proposals carried a token
   * was priced against a form that offered $U only, so a null token on a
   * known chain reads as that chain's default (`requestToken`). Without a
   * chain the money is not known and the row says so rather than "$U".
   */
  chainId?: number | null;
  paymentToken?: string | null;
  deliverDays: number;
  note: string;
  preparedAt: string;
}

/** A staged proposal's price in its own token, or with the currency said to be unknown. */
export function stagedPriceLabel(row: Pick<StagedProposalRow, 'priceU' | 'chainId' | 'paymentToken'>): string {
  const token = row.chainId ? requestToken(row.chainId, row.paymentToken) : null;
  return formatQuotedPrice(row.priceU, token?.address ?? null);
}

/**
 * The handoff a proposal cannot skip.
 *
 * An assistant writes the terms down; this is where they become an offer.
 * The signature has to come from the wallet the registry names as the
 * agent's owner, so it is produced here, in the owner's own wallet, and
 * `placedAt` is stamped at the moment of signing rather than when the
 * assistant prepared it — the bids endpoint refuses a proposal signed more
 * than ten minutes ago, and a timestamp from preparation time would be
 * stale before the owner ever saw it.
 *
 * It posts to the public `/api/briefs/[id]/bids`, the same endpoint a
 * builder bidding by hand uses, so there is one set of checks on who may
 * offer an agent and not two that can disagree.
 */
export function StagedProposals({ proposals, owner }: { proposals: StagedProposalRow[]; owner: string }) {
  const { address, isConnected } = useAccount();
  const { openConnect } = useConnect();
  const { signMessageAsync } = useLiveSignMessage();
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState<Record<string, string>>({});
  const [error, setError] = useState<Record<string, string>>({});
  const connected = address ? getAddress(address) : null;
  const isOwner = connected?.toLowerCase() === owner.toLowerCase();

  if (proposals.length === 0) {
    return (
      <EmptyState title="Nothing waiting for your signature">
        When your assistant prepares a proposal it appears here, unsigned. Pokter cannot place one for you: a proposal is
        an offer signed by the wallet the registry names as your agent&rsquo;s owner.
      </EmptyState>
    );
  }

  const place = async (row: StagedProposalRow) => {
    setBusy(row.key);
    setError((current) => ({ ...current, [row.key]: '' }));
    try {
      /* Stamped here, not at preparation: this is what the signature covers
         and what the endpoint measures its ten-minute window against. */
      const placedAt = new Date().toISOString();
      const content = {
        agentChainId: row.agentChainId,
        agentTokenId: row.agentTokenId,
        priceU: row.priceU,
        paymentToken: row.paymentToken ?? null,
        deliverDays: row.deliverDays,
        note: row.note,
      };
      /* Signed in the request's token and on its chain, as the bids route checks it. */
      const message = bidMessage({ ...content, ...(row.chainId ? { chainId: row.chainId } : {}), briefId: row.requestId, bidder: owner, placedAt });
      const signature = await signMessageAsync({ message, account: connected as `0x${string}` });
      const response = await fetch(`/api/briefs/${row.requestId}/bids`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ bidder: owner, signature, placedAt, content }),
      });
      const payload = (await response.json().catch(() => ({}))) as { bid?: { id: string }; error?: string };
      if (!response.ok || !payload.bid) throw new Error(payload.error ?? `Pokter refused the proposal (HTTP ${response.status}).`);
      setDone((current) => ({ ...current, [row.key]: payload.bid!.id }));
    } catch (caught) {
      const message = (caught as Error).message ?? 'The proposal was not placed.';
      setError((current) => ({
        ...current,
        [row.key]: /reject|denied|cancel/i.test(message) ? 'Cancelled in your wallet. Nothing was placed.' : message,
      }));
    } finally {
      setBusy(null);
    }
  };

  return (
    <ul className="ruled border-y border-rule">
      {proposals.map((row) => (
        <li key={row.key} className="flex flex-col gap-3 py-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium">
                {row.requestTitle ?? 'A request no longer listed'}{' '}
                <span className="t-readout font-normal text-ink-3">{row.agentChainId}:{row.agentTokenId}</span>
              </p>
              <p className="text-[12.5px] text-ink-3">
                {stagedPriceLabel(row)} · deliver in {row.deliverDays} days · staged {when(row.preparedAt)}
              </p>
              <p className="mt-1 line-clamp-3 text-[13px] text-ink-2">{row.note}</p>
            </div>
            <Link href={`/requests/${row.requestId}`} className="shrink-0 text-[12.5px] font-medium text-ink-2 hover:text-ink hover:underline">
              View request
            </Link>
          </div>
          {done[row.key] ? (
            <Notice tone="ok" title="Proposal placed">
              Signed by {shortAddress(owner)} and on the request. The buyer chooses a proposal and then funds the escrow
              in their own wallet; nothing is paid until they do.
            </Notice>
          ) : !row.requestOpen ? (
            <p className="text-[13px] text-ink-3">This request is no longer open, so this proposal can no longer be placed.</p>
          ) : !isConnected || !connected ? (
            <div className="flex flex-col gap-2">
              <p className="text-[13px] text-ink-2">
                Placing it is signed by {shortAddress(owner)}, the wallet the registry names as this agent&rsquo;s owner, in
                your own wallet. Pokter cannot sign it.
              </p>
              <Button size="s" intent="secondary" className="self-start" onClick={() => openConnect('to sign this proposal')}>
                Connect {shortAddress(owner)}
              </Button>
            </div>
          ) : !isOwner ? (
            <Notice tone="watch">
              Connected {shortAddress(connected)}, but this proposal must be signed by {shortAddress(owner)}. Switch
              accounts in your wallet.
            </Notice>
          ) : (
            <Button size="s" className="self-start" busy={busy === row.key} disabled={busy !== null} onClick={() => void place(row)}>
              Sign and place this proposal
            </Button>
          )}
          {error[row.key] && <Notice tone="bad">{error[row.key]}</Notice>}
        </li>
      ))}
    </ul>
  );
}

/** The one line somebody pastes into Claude Code, with its own copy button. */
export function OnboardingPrompt({ prompt }: { prompt: string }) {
  return (
    <div className="flex flex-col gap-2">
      <CodeBlock wrap label="Copy the prompt">{prompt}</CodeBlock>
      <CopyButton value={prompt} className="self-start px-2 py-1">
        Copy the onboarding prompt
      </CopyButton>
    </div>
  );
}
