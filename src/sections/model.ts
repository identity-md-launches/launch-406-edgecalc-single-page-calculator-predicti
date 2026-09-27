import { useMemo, useState } from 'react'
import {
  breakEvenProbability,
  expectedValue,
  forSide,
  kellyFraction,
  stakePlan,
  type Side,
  type StakePlan,
} from '../lib/calc'
import { parseNumber, RULES } from '../lib/validate'

export const KELLY_OPTIONS = ['1', '0.5', '0.25', '0.1'] as const
export type KellyOption = (typeof KELLY_OPTIONS)[number]

/** Raw text for every calculator input, shared by Sections 1 and 2. */
export interface BetInputs {
  side: Side
  yesPrice: string
  probability: string
  bankroll: string
  kelly: KellyOption
  feePercent: string
}

export const DEFAULT_INPUTS: BetInputs = {
  side: 'YES',
  yesPrice: '0.55',
  probability: '62',
  bankroll: '1000',
  kelly: '0.25',
  feePercent: '0',
}

export interface BetResults {
  /** Every field parsed and in range. */
  valid: boolean
  side: Side
  /** Price and probability of the side being bought. */
  price: number
  p: number
  feeRate: number
  edge: number
  ev: number
  evNoFee: number
  fullKelly: number | null
  fullKellyNoFee: number | null
  kellyMultiplier: number
  plan: StakePlan | null
  breakEven: number
  breakEvenNoFee: number
}

export function useBetInputs() {
  const [inputs, setInputs] = useState<BetInputs>(DEFAULT_INPUTS)
  const update = <K extends keyof BetInputs>(key: K, value: BetInputs[K]) =>
    setInputs((prev) => ({ ...prev, [key]: value }))
  const results = useMemo(() => computeBet(inputs), [inputs])
  return { inputs, update, results }
}

export function computeBet(inputs: BetInputs): BetResults | null {
  const yesPrice = parseNumber(inputs.yesPrice, RULES.price())
  const prob = parseNumber(inputs.probability, RULES.probabilityPercent())
  const bankroll = parseNumber(inputs.bankroll, RULES.bankroll())
  const fee = parseNumber(inputs.feePercent, RULES.feePercent())
  if (!yesPrice.ok || !prob.ok || !bankroll.ok || !fee.ok) return null

  const { price, p } = forSide(inputs.side, yesPrice.value, prob.value / 100)
  const feeRate = fee.value / 100
  const fullKelly = kellyFraction(p, price, feeRate)
  const kellyMultiplier = Number(inputs.kelly)
  const plan = fullKelly === null ? null : stakePlan(bankroll.value, fullKelly, kellyMultiplier, price, feeRate)

  return {
    valid: true,
    side: inputs.side,
    price,
    p,
    feeRate,
    edge: p - price,
    ev: expectedValue(p, price, feeRate),
    evNoFee: expectedValue(p, price, 0),
    fullKelly,
    fullKellyNoFee: kellyFraction(p, price, 0),
    kellyMultiplier,
    plan,
    breakEven: breakEvenProbability(price, feeRate),
    breakEvenNoFee: breakEvenProbability(price, 0),
  }
}
