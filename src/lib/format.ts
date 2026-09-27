/**
 * Formatting helpers. Every formatter returns the placeholder (an en dash)
 * for a non-finite input so NaN or Infinity can never reach the screen.
 */

export const PLACEHOLDER = '–'

function finite(n: number | null | undefined): n is number {
  return typeof n === 'number' && Number.isFinite(n)
}

/** Round half away from zero to `digits` decimals, avoiding float drift. */
export function round(n: number, digits: number): number {
  const factor = 10 ** digits
  const scaled = Math.abs(n) * factor
  // Nudge by a tiny epsilon so 1.005 style values round as people expect.
  const rounded = Math.round(scaled + 1e-9) / factor
  return n < 0 ? -rounded : rounded
}

const money = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

/** Money in USDC to 2 decimals, e.g. "1,234.50". */
export function fmtMoney(n: number | null | undefined): string {
  if (!finite(n)) return PLACEHOLDER
  const r = round(n, 2)
  return money.format(Object.is(r, -0) ? 0 : r)
}

/** Money with an explicit sign for gains and losses, e.g. "+12.00" / "−3.50". */
export function fmtSignedMoney(n: number | null | undefined): string {
  if (!finite(n)) return PLACEHOLDER
  const r = round(n, 2)
  if (r > 0) return `+${money.format(r)}`
  if (r < 0) return `−${money.format(Math.abs(r))}`
  return money.format(0)
}

const oneDecimal = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
})

/** Probability (0–1) as a percentage to 1 decimal, e.g. "62.5%". */
export function fmtPercent(p: number | null | undefined): string {
  if (!finite(p)) return PLACEHOLDER
  const r = round(p * 100, 1)
  return `${oneDecimal.format(Object.is(r, -0) ? 0 : r)}%`
}

/** Percentage points with a sign, e.g. "+7.0 pp" / "−3.2 pp". */
export function fmtSignedPoints(p: number | null | undefined): string {
  if (!finite(p)) return PLACEHOLDER
  const r = round(p * 100, 1)
  if (r > 0) return `+${oneDecimal.format(r)} pp`
  if (r < 0) return `−${oneDecimal.format(Math.abs(r))} pp`
  return `${oneDecimal.format(0)} pp`
}

/** Ratio as a signed percentage to 1 decimal, e.g. EV "+12.5%". */
export function fmtSignedRatioPercent(r: number | null | undefined): string {
  if (!finite(r)) return PLACEHOLDER
  const v = round(r * 100, 1)
  if (v > 0) return `+${oneDecimal.format(v)}%`
  if (v < 0) return `−${oneDecimal.format(Math.abs(v))}%`
  return `${oneDecimal.format(0)}%`
}

/** Share price shown as USDC to 2 decimals. */
export function fmtPrice(n: number | null | undefined): string {
  return fmtMoney(n)
}

const shares = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
})

/** Share counts to at most 2 decimals. */
export function fmtShares(n: number | null | undefined): string {
  if (!finite(n)) return PLACEHOLDER
  return shares.format(round(n, 2))
}

/** Plain number for CSV or editing fields: no grouping, up to 6 decimals. */
export function toPlainNumber(n: number): string {
  if (!finite(n)) return ''
  return String(round(n, 6))
}
