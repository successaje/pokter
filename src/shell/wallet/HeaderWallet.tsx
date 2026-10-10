'use client';

import { AccountButton } from './AccountButton';
import { WalletRoot } from './WalletRoot';

/** The public header's account control, with its own wallet context. */
export default function HeaderWallet() {
  return (
    <WalletRoot>
      <AccountButton compact />
    </WalletRoot>
  );
}
