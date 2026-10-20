import type { Metadata } from 'next';

import { WalletRoot } from '@/shell/wallet/WalletRoot';

export const metadata: Metadata = { robots: { index: false } };

/** Settings: the account itself, under the site's header, neither Hiring nor Building. */
export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return (
    <WalletRoot>
      <div className="frame pb-24 pt-8">
        <div className="mx-auto w-full max-w-[1080px]">{children}</div>
      </div>
    </WalletRoot>
  );
}
