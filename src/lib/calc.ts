/**
 * Pure math for EdgeCalc. Every function takes validated, finite numbers and
 * returns finite numbers (or `null` where a value is undefined, e.g. "No bet").
 * Prices are share prices in USDC on a 0–1 scale; probabilities are 0–1.
 */

export type Side = 'YES' | 'NO'

/** Convert a YES-anchored view (YES price, P(YES)) to the side being bought. */
export function forSide(side: Side, yesPrice: number, pYes: number) {
  if (side === 'YES') return { price: yesPrice, p: pYes }
  return { price: 1 - yesPrice, p: 1 - pYes }
}

/** Edge in probability units (multiply by 100 for percentage points). */
export function edge(p: number, price: number): number {
  return p - price
}

/**
 * Net odds `b` per $1 staked when buying a share at `price`. A winning share
 * pays 1, so gross profit per share is (1 - price); a fee on winnings scales
 * that down. Returned per $1 staked (divide by price).
 */
export function netOdds(price: number, feeRate = 0): number {
  return ((1 - price) * (1 - feeRate)) / price
}

/**
 * Expected value per $1 staked. With no fee this is p / price - 1.
 * With a fee on winnings: p * b - (1 - p).
 */
export function expectedValue(p: number, price: number, feeRate = 0): number {
  const b = netOdds(price, feeRate)
  return p * b - (1 - p)
}

/**
 * Full Kelly fraction f* = (p*b - q) / b. With no fee this simplifies to
 * (p - price) / (1 - price). Returns `null` when f* <= 0 (no bet).
 */
export function kellyFraction(p: number, price: number, feeRate = 0): number | null {
  const b = netOdds(price, feeRate)
  if (b <= 0) return null
  const f = (p * b - (1 - p)) / b
  return f > 0 ? f : null
}

/** Probability at which EV is zero for this price and fee. */
export function breakEvenProbability(price: number, feeRate = 0): number {
  return price / (price + (1 - price) * (1 - feeRate))
}

export interface StakePlan {
  stake: number
  shares: number
  payoutIfRight: number
  profitIfRight: number
  lossIfWrong: number
}

/** Size a bet from bankroll, full Kelly f* and the chosen Kelly multiplier. */
export function stakePlan(
  bankroll: number,
  fullKelly: number,
  kellyMultiplier: number,
  price: number,
  feeRate = 0,
): StakePlan {
  const stake = bankroll * fullKelly * kellyMultiplier
  const shares = stake / price
  const grossProfit = shares * (1 - price)
  const profitIfRight = grossProfit * (1 - feeRate)
  return {
    stake,
    shares,
    payoutIfRight: stake + profitIfRight,
    profitIfRight,
    lossIfWrong: stake,
  }
}

export interface ArbitrageResult {
  exists: boolean
  /** YES + NO */
  combined: number
  /** Guaranteed profit per $1 of payout, i.e. 1 - (YES + NO). */
  profitPerDollarPayout: number
  /** Return on the money spent: profit / cost. */
  returnOnCost: number
  /** Number of YES/NO pairs the budget buys (each pair pays exactly 1). */
  sets: number
  spendYes: number
  spendNo: number
  guaranteedPayout: number
  guaranteedProfit: number
}

export function arbitrage(yesPrice: number, noPrice: number, budget: number): ArbitrageResult {
  const combined = yesPrice + noPrice
  const exists = combined < 1
  if (!exists) {
    return {
      exists,
      combined,
      profitPerDollarPayout: 0,
      returnOnCost: 0,
      sets: 0,
      spendYes: 0,
      spendNo: 0,
      guaranteedPayout: 0,
      guaranteedProfit: 0,
    }
  }
  const sets = budget / combined
  return {
    exists,
    combined,
    profitPerDollarPayout: 1 - combined,
    returnOnCost: (1 - combined) / combined,
    sets,
    spendYes: sets * yesPrice,
    spendNo: sets * noPrice,
    guaranteedPayout: sets,
    guaranteedProfit: sets - budget,
  }
}

/** Unrealised P&L of a position: shares * (current - entry). */
export function unrealizedPnl(shares: number, entryPrice: number, currentPrice: number): number {
  return shares * (currentPrice - entryPrice)
}

export function positionCost(shares: number, entryPrice: number): number {
  return shares * entryPrice
}

export function positionValue(shares: number, currentPrice: number): number {
  return shares * currentPrice
}
