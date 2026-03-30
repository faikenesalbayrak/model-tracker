import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { isSupportedLocale } from "@/lib/i18n/locales";

function detectLocale(request: NextRequest) {
  const cookieLocale = request.cookies.get("NEXT_LOCALE")?.value;
  if (cookieLocale && isSupportedLocale(cookieLocale)) {
    return cookieLocale;
  }

  const header = request.headers.get("accept-language");
  if (header) {
    const first = header
      .split(",")
      .map((part) => part.trim().split(";")[0]?.toLowerCase())
      .find(Boolean);
    if (first?.startsWith("en")) return "en";
    if (first?.startsWith("tr")) return "tr";
  }

  return "tr";
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/_next") || pathname.startsWith("/api") || pathname.includes(".")) {
    return NextResponse.next();
  }

  if (pathname === "/") {
    const locale = detectLocale(request);
    return NextResponse.redirect(new URL(`/${locale}/overview`, request.url));
  }

  const seg = pathname.split("/").filter(Boolean)[0];
  if (!seg || !isSupportedLocale(seg)) {
    const locale = detectLocale(request);
    return NextResponse.redirect(new URL(`/${locale}${pathname}`, request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|icon.png|apple-icon.png).*)"],
};
