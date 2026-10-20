import { CampaignBar } from '@/features/campaign/CampaignBar';
import { CompactFooter, SiteFooter } from '@/shell/SiteFooter';
import { FooterForRoute } from '@/shell/FooterForRoute';
import { SiteHeader } from '@/shell/SiteHeader';
import { MobileTabBar } from '@/shell/MobileTabBar';
import { ScrollReset } from '@/shell/ScrollReset';

export default function SiteLayout({ children, modal }: { children: React.ReactNode; modal: React.ReactNode }) {
  return (
    <>
      <ScrollReset />
      <CampaignBar />
      <SiteHeader />
      <main id="main" className="min-h-[70vh]">
        {children}
      </main>
      <FooterForRoute full={<SiteFooter />} compact={<CompactFooter />} />
      <MobileTabBar />
      {modal}
    </>
  );
}
