export const brandColors = {
  red: "#C90C0F",
  black: "#000000",
  white: "#FFFFFF",
  navy: "#000C54",
  deepNavy: "#1C1D52",
  blue: "#0035D6",
  purple: "#1E122F",
  pink: "#CB29AC",
} as const;

export const brandThemeCssVars = {
  "--tt-red": brandColors.red,
  "--tt-black": brandColors.black,
  "--tt-white": brandColors.white,
  "--tt-navy": brandColors.navy,
  "--tt-deep-navy": brandColors.deepNavy,
  "--tt-blue": brandColors.blue,
  "--tt-purple": brandColors.purple,
  "--tt-pink": brandColors.pink,
} as const;

export const brandLogoVariants = [
  "dark-horizontal-single",
  "dark-horizontal-stacked",
  "dark-vertical-single",
  "dark-vertical-stacked",
  "dark-alt-horizontal-single",
  "dark-alt-horizontal-stacked",
  "dark-alt-vertical-single",
  "dark-alt-vertical-stacked",
  "light-horizontal-single",
  "light-horizontal-stacked",
  "light-vertical-single",
  "light-vertical-stacked",
] as const;

export type BrandLogoVariant = (typeof brandLogoVariants)[number];
