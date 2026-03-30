import { NewsPage } from "@/components/pages/NewsPage";
import { normalizeLocale } from "@/lib/i18n/locales";

export default async function NewsReleasesRoute({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return (
    <main className="mx-auto flex w-full max-w-none flex-col gap-5 overflow-hidden px-4 pb-4 sm:px-6 lg:px-8">
      <NewsPage locale={normalizeLocale(locale)} section="releases" />
    </main>
  );
}
