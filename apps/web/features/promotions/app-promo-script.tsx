import { appPromoInitScript } from "@/features/promotions/app-promo";

export function AppPromoScript() {
  return <script dangerouslySetInnerHTML={{ __html: appPromoInitScript }} />;
}
