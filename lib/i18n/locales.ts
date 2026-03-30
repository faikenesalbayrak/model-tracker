export const SUPPORTED_LOCALES = ["tr", "en"] as const;

export type AppLocale = (typeof SUPPORTED_LOCALES)[number];

export function isSupportedLocale(value: string): value is AppLocale {
  return SUPPORTED_LOCALES.includes(value as AppLocale);
}

export function normalizeLocale(value: string | null | undefined): AppLocale {
  return value === "en" ? "en" : "tr";
}
