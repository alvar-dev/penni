/**
 * Colours are the S Group design-system values read from S-Pankki's public
 * stylesheet (the --sds-brand-color-* tokens). The typeface is the platform
 * system font: S Bonus UX is proprietary and is not bundled here.
 */
export const colors = {
  bg: '#FFFFFF',
  surface: '#F5F5F5',
  surfaceSoft: '#FAFAFA',
  border: '#E6E6E6',

  text: '#1F1F1F',
  textSecondary: '#666666',
  textTertiary: '#949494',

  green900: '#004628',
  green700: '#007841',
  green500: '#00AA46',
  green400: '#00EB5A',
  green300: '#99D59F',
  green200: '#91FA9B',
  green100: '#D2FCD5',
  greenTint: '#EBF7EC',

  danger: '#B70000',
} as const;

/**
 * The three spending baskets, in S-Pankki's own greens from dark to light: fixed
 * costs are the heaviest, discretionary spending the lightest.
 * An ordered ramp (lightness rises step by step), so the steps stay apart for
 * colour-blind readers too. The mint is faint on white, so every mark that uses
 * it carries its name and amount next to it.
 */
export const basketColors = {
  regular: '#004628',
  irregular: '#00AA46',
  everyday: '#91FA9B',
} as const;

export type Basket = keyof typeof basketColors;

export const type = {
  hero: { fontSize: 48, lineHeight: 54, fontWeight: '600' as const, letterSpacing: -0.8 },
  title: { fontSize: 28, lineHeight: 34, fontWeight: '600' as const, letterSpacing: -0.4 },
  body: { fontSize: 17, lineHeight: 25, fontWeight: '400' as const },
  bodyStrong: { fontSize: 17, lineHeight: 25, fontWeight: '600' as const },
  label: { fontSize: 15, lineHeight: 20, fontWeight: '500' as const },
  caption: { fontSize: 13, lineHeight: 18, fontWeight: '400' as const },
};

/** 1234.5 -> "1 234,50" (no sign; non-breaking spaces). */
export function formatNumber(value: number, decimals = 2): string {
  const [whole, fraction] = Math.abs(value).toFixed(decimals).split('.');
  return `${whole.replace(/\B(?=(\d{3})+(?!\d))/g, '\u00A0')}${fraction ? ',' + fraction : ''}`;
}

/** 1234.5 -> "1 234,50 €", -67 -> "−67 €" (Finnish formatting). */
export function formatEur(value: number, decimals = 2): string {
  return `${value < 0 ? '\u2212' : ''}${formatNumber(value, decimals)}\u00A0€`;
}
