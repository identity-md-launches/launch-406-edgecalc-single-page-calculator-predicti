import { NumberField } from '../components/Field'
import { Notice, Section } from '../components/Section'
import { Stat, StatList, toneOf } from '../components/Stat'
import { fmtPercent, fmtPrice, fmtSignedRatioPercent } from '../lib/format'
import { RULES } from '../lib/validate'
import type { BetInputs, BetResults } from './model'

interface Props {
  inputs: BetInputs
  update: <K extends keyof BetInputs>(key: K, value: BetInputs[K]) => void
  results: BetResults | null
}

export function Fees({ inputs, update, results }: Props) {
  const r = results
  const hasFee = r !== null && r.feeRate > 0
  return (
    <Section
      id="break-even"
      number={2}
      title="Break-even and fees"
      lede="Some venues take a cut of winnings. Enter that fee to see the probability you must beat, and how much it trims the numbers in Section 1."
      how={
        <>
          A fee on winnings shrinks the profit when you are right but not the loss when you are wrong. Break-even
          probability <code>= price ÷ (price + (1 − price) × (1 − fee))</code>; your estimate must exceed it for
          positive expected value. Section 1's EV, Kelly and profit figures already include this fee.
        </>
      }
    >
      <div className="section-grid">
        <div className="form-stack">
          <NumberField
            id="fee"
            label="Fee on winnings"
            hint="Percent of profit kept by the venue, 0 to 99. Default 0."
            value={inputs.feePercent}
            onChange={(v) => update('feePercent', v)}
            rule={RULES.feePercent()}
            suffix="%"
            placeholder="0"
          />
        </div>
        <div className="results" aria-live="polite">
          {!r ? (
            <Notice tone="caution">Fix the highlighted inputs in Sections 1 and 2 to see results.</Notice>
          ) : (
            <>
              <p className="results-summary">
                For <strong>{r.side}</strong> at <strong>{fmtPrice(r.price)} USDC</strong>
                {hasFee ? (
                  <>
                    {' '}
                    with a <strong>{fmtPercent(r.feeRate)}</strong> fee on winnings.
                  </>
                ) : (
                  <> with no fee.</>
                )}
              </p>
              <StatList label="Break-even and fee-adjusted results">
                <Stat
                  label="Break-even probability"
                  value={fmtPercent(r.breakEven)}
                  note={
                    hasFee
                      ? `${fmtPercent(r.breakEvenNoFee)} without the fee`
                      : 'equals the price when there is no fee'
                  }
                  tone={r.p > r.breakEven ? 'positive' : r.p < r.breakEven ? 'negative' : 'neutral'}
                  emphasis
                />
                <Stat
                  label="EV per 1 USDC staked, after fee"
                  value={fmtSignedRatioPercent(r.ev)}
                  note={hasFee ? `${fmtSignedRatioPercent(r.evNoFee)} without the fee` : 'no fee applied'}
                  tone={toneOf(r.ev)}
                />
                <Stat
                  label="Full Kelly f*, after fee"
                  value={r.fullKelly === null ? 'No bet' : fmtPercent(r.fullKelly)}
                  note={
                    hasFee
                      ? r.fullKellyNoFee === null
                        ? 'No bet without the fee either'
                        : `${fmtPercent(r.fullKellyNoFee)} without the fee`
                      : 'no fee applied'
                  }
                  tone={r.fullKelly === null ? 'negative' : 'neutral'}
                />
              </StatList>
              <p className="results-summary">
                Your estimate of <strong>{fmtPercent(r.p)}</strong> is{' '}
                {r.p > r.breakEven ? 'above' : r.p < r.breakEven ? 'below' : 'exactly at'} break-even.
              </p>
            </>
          )}
        </div>
      </div>
    </Section>
  )
}
