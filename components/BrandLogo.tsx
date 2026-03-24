import Image, { type StaticImageData } from "next/image";
import type { ComponentPropsWithoutRef } from "react";
import type { BrandLogoVariant } from "@/lib/theme";

import darkAltHorizontalSingle from "../style/logos/tt-dark-alt-horizontal-single.png";
import darkAltHorizontalStacked from "../style/logos/tt-dark-alt-horizontal-stacked.png";
import darkAltVerticalSingle from "../style/logos/tt-dark-alt-vertical-single.png";
import darkAltVerticalStacked from "../style/logos/tt-dark-alt-vertical-stacked.png";
import darkHorizontalSingle from "../style/logos/tt-dark-horizontal-single.png";
import darkHorizontalStacked from "../style/logos/tt-dark-horizontal-stacked.png";
import darkVerticalSingle from "../style/logos/tt-dark-vertical-single.png";
import darkVerticalStacked from "../style/logos/tt-dark-vertical-stacked.png";
import lightHorizontalSingle from "../style/logos/tt-light-horizontal-single.png";
import lightHorizontalStacked from "../style/logos/tt-light-horizontal-stacked.png";
import lightVerticalSingle from "../style/logos/tt-light-vertical-single.png";
import lightVerticalStacked from "../style/logos/tt-light-vertical-stacked.png";

const logoByVariant = {
  "dark-horizontal-single": darkHorizontalSingle,
  "dark-horizontal-stacked": darkHorizontalStacked,
  "dark-vertical-single": darkVerticalSingle,
  "dark-vertical-stacked": darkVerticalStacked,
  "dark-alt-horizontal-single": darkAltHorizontalSingle,
  "dark-alt-horizontal-stacked": darkAltHorizontalStacked,
  "dark-alt-vertical-single": darkAltVerticalSingle,
  "dark-alt-vertical-stacked": darkAltVerticalStacked,
  "light-horizontal-single": lightHorizontalSingle,
  "light-horizontal-stacked": lightHorizontalStacked,
  "light-vertical-single": lightVerticalSingle,
  "light-vertical-stacked": lightVerticalStacked,
} satisfies Record<BrandLogoVariant, StaticImageData>;

type BrandLogoProps = Omit<
  ComponentPropsWithoutRef<typeof Image>,
  "alt" | "src"
> & {
  variant?: BrandLogoVariant;
  alt?: string;
};

export function BrandLogo({
  variant = "dark-horizontal-single",
  alt = "Turkish Technology",
  ...props
}: BrandLogoProps) {
  const src = logoByVariant[variant] ?? logoByVariant["dark-horizontal-single"];

  return <Image src={src} alt={alt} priority={false} {...props} />;
}
