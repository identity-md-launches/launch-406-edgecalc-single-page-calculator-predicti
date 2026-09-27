import { describe, expect, it } from 'vitest'
import {
  arbitrage,
  breakEvenProbability,
  edge,
  expectedValue,
  forSide,
  kellyFraction,
  stakePlan,
  unrealizedPnl,
} from './calc'

const close = (a: number, b: number) => expect(a).toBeCloseTo(b, 9)

describe('single bet', () => {
  it('computes edge as p - price', () => {
    close(edge(0.62, 0.55), 0.07)
    close(edge(0.4, 0.55), -0.15)
  })

  it('EV per $1 staked matches p / price - 1 without fee', () => {
    close(expectedValue(0.62, 0.55), 0.62 / 0.55 - 1)
    close(expectedValue(0.5, 0.5), 0)
  })

  it('full Kelly matches (p - price) / (1 - price) without fee', () => {
    close(kellyFraction(0.62, 0.55)!, (0.62 - 0.55) / (1 - 0.55))
  })

  it('returns null (No bet) when edge is zero or negative', () => {
    expect(kellyFraction(0.55, 0.55)).toBeNull()
    expect(kellyFraction(0.4, 0.55)).toBeNull()
  })

  it('flips price and probability for the NO side', () => {
    expect(forSide('YES', 0.62, 0.5)).toEqual({ price: 0.62, p: 0.5 })
    const no = forSide('NO', 0.62, 0.5)
    close(no.price, 0.38)
    close(no.p, 0.5)
  })

  it('sizes the stake and derives shares and outcomes', () => {
    const f = kellyFraction(0.62, 0.55)!
    const plan = stakePlan(1000, f, 0.25, 0.55)
    close(plan.stake, 1000 * f * 0.25)
    close(plan.shares, plan.stake / 0.55)
    close(plan.payoutIfRight, plan.shares)
    close(plan.profitIfRight, plan.shares - plan.stake)
    close(plan.lossIfWrong, plan.stake)
  })
})

describe('fees', () => {
  it('break-even equals the price with no fee', () => {
    close(breakEvenProbability(0.55), 0.55)
    close(breakEvenProbability(0.2), 0.2)
  })

  it('break-even rises with a fee on winnings', () => {
    const be = breakEvenProbability(0.55, 0.02)
    expect(be).toBeGreaterThan(0.55)
    // EV is zero exactly at the break-even probability.
    close(expectedValue(be, 0.55, 0.02), 0)
  })

  it('fee reduces EV, Kelly and profit if right', () => {
    expect(expectedValue(0.62, 0.55, 0.02)).toBeLessThan(expectedValue(0.62, 0.55))
    expect(kellyFraction(0.62, 0.55, 0.02)!).toBeLessThan(kellyFraction(0.62, 0.55)!)
    const plain = stakePlan(1000, 0.1, 1, 0.55)
    const fee = stakePlan(1000, 0.1, 1, 0.55, 0.02)
    close(fee.profitIfRight, plain.profitIfRight * 0.98)
    close(fee.lossIfWrong, plain.lossIfWrong)
  })

  it('a large fee can turn a positive edge into No bet', () => {
    expect(kellyFraction(0.56, 0.55, 0.5)).toBeNull()
  })
})

describe('arbitrage', () => {
  it('finds no arbitrage when YES + NO >= 1', () => {
    expect(arbitrage(0.55, 0.45, 100).exists).toBe(false)
    expect(arbitrage(0.6, 0.45, 100).exists).toBe(false)
  })

  it('computes guaranteed profit and allocation when YES + NO < 1', () => {
    const r = arbitrage(0.48, 0.49, 970)
    expect(r.exists).toBe(true)
    close(r.profitPerDollarPayout, 0.03)
    close(r.sets, 1000)
    close(r.spendYes, 480)
    close(r.spendNo, 490)
    close(r.guaranteedPayout, 1000)
    close(r.guaranteedProfit, 30)
    close(r.returnOnCost, 0.03 / 0.97)
  })
})

describe('positions', () => {
  it('unrealised P&L is shares * (current - entry)', () => {
    close(unrealizedPnl(100, 0.4, 0.55), 15)
    close(unrealizedPnl(100, 0.6, 0.55), -5)
  })
})
