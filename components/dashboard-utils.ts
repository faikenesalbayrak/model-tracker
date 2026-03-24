import type { Locale } from "./dashboard-types";

export const STALE_AFTER_DAYS = 7;

export function daysAgo(days: number) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

export function isStale(lastSuccessAt: string, now = Date.now()) {
  const timestamp = Date.parse(lastSuccessAt);

  if (Number.isNaN(timestamp)) {
    return false;
  }

  return now - timestamp > STALE_AFTER_DAYS * 24 * 60 * 60 * 1000;
}

export function formatLastUpdated(lastSuccessAt: string, locale: Locale) {
  const timestamp = Date.parse(lastSuccessAt);

  if (Number.isNaN(timestamp)) {
    return locale === "tr" ? "Bilinmiyor" : "Unknown";
  }

  return new Intl.DateTimeFormat(locale === "tr" ? "tr-TR" : "en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(timestamp);
}

export function formatCompactNumber(value: number, locale: Locale) {
  return new Intl.NumberFormat(locale === "tr" ? "tr-TR" : "en-US", {
    maximumFractionDigits: 1,
  }).format(value);
}

export function formatCurrency(value: number, locale: Locale) {
  return new Intl.NumberFormat(locale === "tr" ? "tr-TR" : "en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatLocaleCode(locale: Locale) {
  return locale === "en" ? "EN" : "TR";
}
