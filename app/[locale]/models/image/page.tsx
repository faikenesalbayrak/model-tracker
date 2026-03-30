import DashboardApp from "@/components/DashboardApp";
import { normalizeLocale } from "@/lib/i18n/locales";

export default async function ModelsImagePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return <DashboardApp locale={normalizeLocale(locale)} initialSection="image" lockSection showSectionTabs={false} />;
}
