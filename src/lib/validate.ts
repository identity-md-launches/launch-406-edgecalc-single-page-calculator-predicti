/**
 * Input validation. Fields hold their raw text so people can type freely;
 * `parseNumber` turns that text into a finite number or a fix-it message.
 */

export interface NumberRule {
  /** Human name used in messages, e.g. "Market price". */
  label: string
  min: number
  max: number
  /** Whether the bounds are inclusive (default true). */
  inclusive?: boolean
  /** How to describe the range in the message, e.g. "between 0.01 and 0.99". */
  rangeText: string
}

export type Parsed = { ok: true; value: number } | { ok: false; message: string }

/** Accept "1,234.5", " 0.62 ", "5%" style text and return a number or NaN. */
export function parseLooseNumber(raw: string): number {
  const cleaned = raw.trim().replace(/,/g, '').replace(/%$/, '').replace(/^\+/, '')
  if (cleaned === '' || cleaned === '-' || cleaned === '.') return Number.NaN
  if (!/^-?\d*\.?\d*(e-?\d+)?$/i.test(cleaned)) return Number.NaN
  return Number(cleaned)
}

export function parseNumber(raw: string, rule: NumberRule): Parsed {
  if (raw.trim() === '') {
    return { ok: false, message: `Enter ${lower(rule.label)} ${rule.rangeText}.` }
  }
  const n = parseLooseNumber(raw)
  if (!Number.isFinite(n)) {
    return { ok: false, message: `Enter ${lower(rule.label)} as a number ${rule.rangeText}.` }
  }
  const inclusive = rule.inclusive ?? true
  const inRange = inclusive
    ? n >= rule.min && n <= rule.max
    : n > rule.min && n < rule.max
  if (!inRange) {
    return { ok: false, message: `Use ${lower(rule.label)} ${rule.rangeText}.` }
  }
  return { ok: true, value: n }
}

function lower(label: string): string {
  // Keep acronyms such as "YES"/"NO"/"USDC" intact; lowercase the first letter otherwise.
  if (/^[A-Z]{2,}/.test(label)) return label
  return label.charAt(0).toLowerCase() + label.slice(1)
}

export const RULES = {
  price: (label = 'Market price'): NumberRule => ({
    label,
    min: 0.01,
    max: 0.99,
    rangeText: 'between 0.01 and 0.99',
  }),
  probabilityPercent: (label = 'Probability'): NumberRule => ({
    label,
    min: 1,
    max: 99,
    rangeText: 'between 1 and 99',
  }),
  bankroll: (label = 'Bankroll'): NumberRule => ({
    label,
    min: 0.01,
    max: 1_000_000_000,
    rangeText: 'of at least 0.01 USDC',
  }),
  budget: (label = 'Budget'): NumberRule => ({
    label,
    min: 0.01,
    max: 1_000_000_000,
    rangeText: 'of at least 0.01 USDC',
  }),
  feePercent: (label = 'Fee'): NumberRule => ({
    label,
    min: 0,
    max: 99,
    rangeText: 'between 0 and 99',
  }),
  shares: (label = 'Shares'): NumberRule => ({
    label,
    min: 0.000001,
    max: 1_000_000_000,
    rangeText: 'greater than 0',
  }),
} as const

export const MARKET_NAME_MAX = 120

export type ParsedText = { ok: true; value: string } | { ok: false; message: string }

export function validateMarketName(raw: string): ParsedText {
  const trimmed = raw.trim()
  if (trimmed === '') return { ok: false, message: 'Enter a market name.' }
  if (trimmed.length > MARKET_NAME_MAX) {
    return { ok: false, message: `Use a market name of at most ${MARKET_NAME_MAX} characters.` }
  }
  return { ok: true, value: trimmed }
}
