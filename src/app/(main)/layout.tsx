import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';
import { PromoPopup } from '@/components/PromoPopup';
import { activePromotions } from '@/lib/extras';

export default async function MainLayout({ children }: { children: React.ReactNode }) {
  const promotions = await activePromotions();
  return (
    <>
      <SiteHeader />
      <main id="main">{children}</main>
      <SiteFooter />
      <PromoPopup promotions={promotions.map(({ id, title, link }) => ({ id, title, link }))} />
    </>
  );
}
