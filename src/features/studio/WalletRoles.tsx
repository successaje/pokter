import {
  NEVER_ASK_FOR_KEYS,
  WALLET_ROLES,
  walletRoleConflicts,
  type WalletRoleAssignment,
  type WalletRoleId,
} from '@/lib/builder/wallet-roles';
import { shortAddress } from '@/lib/ui/format';
import { Details } from '@/ui/Data';
import { Notice } from '@/ui/Feedback';
import { Icon } from '@/ui/icons';

const ROLE_LABEL: Record<WalletRoleId, string> = {
  'identity-owner': 'Identity owner',
  'agent-wallet': 'Agent wallet',
  'test-buyer': 'Test buyer',
};

/**
 * Three wallets, kept apart, with the ones Pokter can see filled in.
 *
 * The flow used to say "the wallet that signs owns the agent" and stop
 * there, so the same key ended up owning the identity, signing quotes on
 * a server, and funding the test hire. The last of those the escrow
 * refuses outright — two mainnet jobs were funded that way and can never
 * be completed by anyone — so it is shown as blocking and the other two
 * as advice.
 *
 * The test buyer is the one address Pokter does not know: it is a wallet
 * the builder will use elsewhere. Its row says what it is for and what it
 * must not be, and the hire flow enforces the one hard rule when the
 * moment comes, so nothing here asks for an address it has no use for.
 */
export function WalletRoles({
  assignment,
  compact = false,
}: {
  assignment: WalletRoleAssignment;
  compact?: boolean;
}) {
  const conflicts = walletRoleConflicts(assignment);
  const known: Record<WalletRoleId, string | null> = {
    'identity-owner': assignment.identityOwner ?? null,
    'agent-wallet': assignment.agentWallet ?? null,
    'test-buyer': assignment.testBuyer ?? null,
  };

  return (
    <section aria-labelledby="wallet-roles-title" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 id="wallet-roles-title" className="t-h3">
          Three wallets, kept apart
        </h2>
        <p className="text-[13px] leading-relaxed text-ink-2">
          Not three accounts for the sake of it: each one signs something different, and sharing a key between any two of
          them costs something specific.
        </p>
      </div>

      <ul className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        {WALLET_ROLES.map((role) => {
          const address = known[role.id];
          return (
            <li key={role.id} className="flex flex-col gap-2 rounded-[12px] border border-rule bg-raised p-4">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[13.5px] font-medium">{role.label}</span>
                <span className="t-readout text-[11.5px] text-ink-3">{address ? shortAddress(address) : 'yours, not shared'}</span>
              </div>
              <p className="text-[12.5px] leading-relaxed text-ink-2">{role.purpose}</p>
              {!compact && (
                <>
                  <p className="text-[12px] leading-relaxed text-ink-3">
                    <span className="font-medium text-ink-2">Signs: </span>
                    {role.signs}
                  </p>
                  <p className="text-[12px] leading-relaxed text-ink-3">
                    <span className="font-medium text-ink-2">Key lives: </span>
                    {role.keyLives}
                  </p>
                </>
              )}
              <p className="mt-auto pt-1 text-[12px] leading-relaxed text-ink-3">
                <span className="font-medium text-ink-2">Never: </span>
                {role.neverDoes}
              </p>
            </li>
          );
        })}
      </ul>

      {conflicts.map((conflict) => (
        <Notice
          key={conflict.roles.join('-')}
          tone={conflict.severity === 'blocking' ? 'bad' : 'watch'}
          title={
            conflict.severity === 'blocking'
              ? `${ROLE_LABEL[conflict.roles[0]]} and ${ROLE_LABEL[conflict.roles[1]]} are the same wallet, and the escrow will not accept that`
              : `${ROLE_LABEL[conflict.roles[0]]} and ${ROLE_LABEL[conflict.roles[1]]} are the same wallet`
          }
        >
          {conflict.consequence} <span className="font-medium text-ink">{conflict.fix}</span>
        </Notice>
      ))}

      <Notice tone="neutral" icon={<Icon.Key size={15} />} title="Pokter never wants your key">
        {NEVER_ASK_FOR_KEYS}
      </Notice>

      <Details summary="How to give the agent a signer without exposing a personal wallet">
        <div className="flex flex-col gap-2.5 text-[13px] leading-relaxed text-ink-2">
          <p>
            Generate a fresh key for the agent and give it nothing but what it needs. It signs quotes and submits
            deliveries; it never needs to hold your funds and should not own the identity.
          </p>
          <p>
            Hand it to the process at start-up, not in the source: an environment variable from your host&rsquo;s secret
            store, a secrets manager, or a KMS the process calls to sign. It must not appear in the repository, in the agent
            card, in a log line, or in anything you paste into a web page — including this one.
          </p>
          <p>
            Publish only its <span className="t-readout">address</span> on the registry record, as the agent wallet. That is
            what Pokter checks every signature against, which is also why changing the key means updating the record: a
            quote signed by a key the record does not name cannot be bound to you.
          </p>
          <p>
            Rotating it is a registry update and nothing more, so a key you suspect is better replaced than reasoned about.
            Your identity owner wallet stays where it is, in your own hands, and signs that update.
          </p>
        </div>
      </Details>
    </section>
  );
}
