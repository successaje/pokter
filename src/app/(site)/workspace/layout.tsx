import type { Metadata } from 'next';

import { WalletRoot } from '@/shell/wallet/WalletRoot';
import { WorkspaceFrame } from '@/shell/WorkspaceFrame';
import { Icon } from '@/ui/icons';

export const metadata: Metadata = { robots: { index: false } };

/*
 * Hiring: the work you pay for. Where that work is, and nothing else — job
 * states are filters inside My jobs and hired agents are "By agent" there.
 * Saved agents and the wallet sit below, because they are supplies rather
 * than work.
 */
export default function HiringLayout({ children }: { children: React.ReactNode }) {
  return (
    <WalletRoot>
      <WorkspaceFrame
        section="hiring"
        items={[
          { href: '/workspace', label: 'Overview', icon: <Icon.Grid size={17} />, exact: true },
          { href: '/workspace/jobs', label: 'My jobs', icon: <Icon.Briefcase size={17} /> },
          { href: '/workspace/requests', label: 'My requests', icon: <Icon.Doc size={17} /> },
          { href: '/workspace/inbox', label: 'Inbox', icon: <Icon.Inbox size={17} /> },
        ]}
        more={[
          { href: '/workspace/saved', label: 'Saved agents', icon: <Icon.Bookmark size={17} /> },
          { href: '/workspace/wallet', label: 'Wallet', icon: <Icon.Wallet size={17} /> },
        ]}
      >
        {children}
      </WorkspaceFrame>
    </WalletRoot>
  );
}
