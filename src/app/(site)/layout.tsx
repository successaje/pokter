import { CampaignBar } from '@/features/campaign/CampaignBar';
import { SiteFooter } from '@/shell/SiteFooter';
import { SiteHeader } from '@/shell/SiteHeader';
import { MobileTabBar } from '@/shell/MobileTabBar';

export default function SiteLayout({ children, modal }: { children: React.ReactNode; modal: React.ReactNode }) {
  return (
    <>
      <CampaignBar />
      <SiteHeader />
      <main id="main" className="min-h-[70vh]">
        {children}
      </main>
      <SiteFooter />
      <MobileTabBar />
      {modal}
    </>
  );
}
