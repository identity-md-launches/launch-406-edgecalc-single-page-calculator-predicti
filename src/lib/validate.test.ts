import { describe, expect, it } from 'vitest'
import { parseLooseNumber, parseNumber, RULES, validateMarketName } from './validate'

describe('parseLooseNumber', () => {
  it('accepts common typed forms', () => {
    expect(parseLooseNumber(' 0.62 ')).toBe(0.62)
    expect(parseLooseNumber('1,000.5')).toBe(1000.5)
    expect(parseLooseNumber('55%')).toBe(55)
    expect(parseLooseNumber('+3')).toBe(3)
    expect(parseLooseNumber('.5')).toBe(0.5)
  })

  it('rejects garbage', () => {
    for (const s of ['', '-', '.', 'abc', '1..2', '1e', 'Infinity', 'NaN', '0x10']) {
      expect(Number.isFinite(parseLooseNumber(s))).toBe(false)
    }
  })
})

describe('parseNumber with rules', () => {
  it('gives a fix-it message for empty, non-numeric and out-of-range text', () => {
    const rule = RULES.price()
    expect(parseNumber('', rule)).toEqual({ ok: false, message: 'Enter market price between 0.01 and 0.99.' })
    expect(parseNumber('x', rule)).toEqual({
      ok: false,
      message: 'Enter market price as a number between 0.01 and 0.99.',
    })
    expect(parseNumber('1.2', rule)).toEqual({ ok: false, message: 'Use market price between 0.01 and 0.99.' })
    expect(parseNumber('0', rule).ok).toBe(false)
    expect(parseNumber('0.01', rule)).toEqual({ ok: true, value: 0.01 })
    expect(parseNumber('0.99', rule)).toEqual({ ok: true, value: 0.99 })
  })

  it('keeps acronym labels intact in messages', () => {
    const r = parseNumber('2', RULES.price('YES price'))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.message).toBe('Use YES price between 0.01 and 0.99.')
  })

  it('validates probability, bankroll and fee ranges', () => {
    expect(parseNumber('100', RULES.probabilityPercent()).ok).toBe(false)
    expect(parseNumber('99', RULES.probabilityPercent()).ok).toBe(true)
    expect(parseNumber('0', RULES.bankroll()).ok).toBe(false)
    expect(parseNumber('0', RULES.feePercent()).ok).toBe(true)
    expect(parseNumber('100', RULES.feePercent()).ok).toBe(false)
  })
})

describe('validateMarketName', () => {
  it('trims and bounds the name', () => {
    expect(validateMarketName('  Fed cuts  ')).toEqual({ ok: true, value: 'Fed cuts' })
    expect(validateMarketName('   ').ok).toBe(false)
    expect(validateMarketName('x'.repeat(121)).ok).toBe(false)
  })
})
