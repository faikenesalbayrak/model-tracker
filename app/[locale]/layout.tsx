import { notFound } from "next/navigation";
import { isSupportedLocale } from "@/lib/i18n/locales";

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isSupportedLocale(locale)) {
    notFound();
  }

  return children;
}
