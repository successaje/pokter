'use client';

import { NotificationBell } from '../NotificationBell';
import { AccountButton } from './AccountButton';
import { WalletRoot } from './WalletRoot';

/**
 * The public header's account control, with its own wallet context.
 *
 * The unread bell sits beside it, where a count is seen without looking
 * for it. It lived in the workspace's own header until the workspace moved
 * inside the site, and went with that header; without it a closing review
 * window had no sign anywhere outside the Inbox. It draws nothing until a
 * wallet is connected.
 */
export default function HeaderWallet() {
  return (
    <WalletRoot>
      <span className="flex items-center gap-1">
        <NotificationBell />
        <AccountButton compact />
      </span>
    </WalletRoot>
  );
}
