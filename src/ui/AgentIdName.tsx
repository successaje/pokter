import { BOARD_CHAIN_ID } from '@/lib/board/contract';
import { explorerBaseFor } from '@/lib/network/presentation';
import { cn } from '@/lib/ui/cn';
import { Icon } from './icons';

/**
 * A wallet shown by the handle of its Agent ID, in place of its address.
 *
 * Links to the wallet on BscScan, where the Agent ID it holds can be
 * checked, since an Agent ID lives on BNB Chain whatever network the thing
 * beside it is on. The full address is the link's title. Never a link to
 * anything on Pokter by name: the handle is shown, not looked up.
 */
export function AgentIdName({ wallet, handle, className }: { wallet: string; handle: string; className?: string }) {
  return (
    <a
      href={`${explorerBaseFor(BOARD_CHAIN_ID)}/address/${wallet}`}
      target="_blank"
      rel="noreferrer noopener"
      title={wallet}
      aria-label={`${handle}, Agent ID, ${wallet} on BscScan`}
      className={cn('group inline-flex items-center gap-1.5 align-middle', className)}
    >
      <span className="t-label">Agent ID</span>
      <span className="font-medium text-ink-2 underline-offset-2 group-hover:text-ink group-hover:underline">{handle}</span>
      <Icon.ArrowUpRight size={12} className="text-ink-3" aria-hidden />
    </a>
  );
}
