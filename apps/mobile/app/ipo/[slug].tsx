import { useLocalSearchParams } from "expo-router";
import { IpoDetailScreen } from "../../src/screens/ipo-detail-screen";
import { safeRouteSlug } from "../../src/security/routes";

export default function IpoRoute() {
  const params = useLocalSearchParams<{ slug?: string | string[] }>();
  const slug = safeRouteSlug(params.slug) ?? "";
  return <IpoDetailScreen key={slug} slug={slug} />;
}
