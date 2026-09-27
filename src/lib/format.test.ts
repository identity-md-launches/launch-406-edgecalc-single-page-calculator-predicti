import { describe, expect, it } from 'vitest'
import {
  PLACEHOLDER,
  fmtMoney,
  fmtPercent,
  fmtShares,
  fmtSignedMoney,
  fmtSignedPoints,
  fmtSignedRatioPercent,
  round,
} from './format'

describe('formatters never show NaN or Infinity', () => {
  const bad = [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, null, undefined]
  const fns = [fmtMoney, fmtSignedMoney, fmtPercent, fmtSignedPoints, fmtSignedRatioPercent, fmtShares]
  for (const fn of fns) {
    for (const v of bad) {
      it(`${fn.name}(${String(v)}) is the placeholder`, () => {
        expect(fn(v)).toBe(PLACEHOLDER)
      })
    }
  }
})

describe('rounding rules', () => {
  it('rounds money to 2 decimals', () => {
    expect(fmtMoney(1234.5)).toBe('1,234.50')
    expect(fmtMoney(0.005)).toBe('0.01')
    expect(fmtMoney(-0.004)).toBe('0.00')
    expect(fmtSignedMoney(12)).toBe('+12.00')
    expect(fmtSignedMoney(-3.456)).toBe('−3.46')
    expect(fmtSignedMoney(0)).toBe('0.00')
  })

  it('rounds probabilities to 1 decimal', () => {
    expect(fmtPercent(0.62)).toBe('62.0%')
    expect(fmtPercent(0.55555)).toBe('55.6%')
    expect(fmtSignedPoints(0.07)).toBe('+7.0 pp')
    expect(fmtSignedPoints(-0.15)).toBe('−15.0 pp')
    expect(fmtSignedRatioPercent(0.12727)).toBe('+12.7%')
  })

  it('round() is stable on common float cases', () => {
    expect(round(1.005, 2)).toBe(1.01)
    expect(round(2.675, 2)).toBe(2.68)
    expect(round(-1.005, 2)).toBe(-1.01)
  })
})
