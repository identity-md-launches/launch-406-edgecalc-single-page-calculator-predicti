import { useMemo, useState } from 'react'
import { NumberField } from '../components/Field'
import { Notice, Section } from '../components/Section'
import { Stat, StatList } from '../components/Stat'
import { arbitrage } from '../lib/calc'
import { fmtMoney, fmtPrice, fmtShares, fmtSignedRatioPercent } from '../lib/format'
import { parseNumber, RULES } from '../lib/validate'

export function Arbitrage() {
  const [yes, setYes] = useState('0.48')
  const [no, setNo] = useState('0.49')
  const [budget, setBudget] = useState('100')

  const result = useMemo(() => {
    const y = parseNumber(yes, RULES.price('YES price'))
    const n = parseNumber(no, RULES.price('NO price'))
    const b = parseNumber(budget, RULES.budget())
    if (!y.ok || !n.ok || !b.ok) return null
    return { ...arbitrage(y.value, n.value, b.value), budget: b.value }
  }, [yes, no, budget])

  return (
    <Section
      id="arbitrage"
      number={3}
      title="Arbitrage check"
      lede="Enter the YES and NO prices quoted on the same market. If they add up to less than 1, buying both locks in a profit."
      how={
        <>
          One YES share and one NO share on the same market always pay exactly 1 USDC together. When they cost
          less than 1 combined, buying equal numbers of each guarantees <code>1 − (YES + NO)</code> profit per 1 USDC
          of payout, before any fees or slippage.
        </>
      }
    >
      <div className="section-grid">
        <div className="form-stack">
          <NumberField
            id="arb-yes"
            label="YES price"
            value={yes}
            onChange={setYes}
            rule={RULES.price('YES price')}
            suffix="USDC"
            placeholder="0.48"
          />
          <NumberField
            id="arb-no"
            label="NO price"
            value={no}
            onChange={setNo}
            rule={RULES.price('NO price')}
            suffix="USDC"
            placeholder="0.49"
          />
          <NumberField
            id="arb-budget"
            label="Budget"
            hint="Total USDC to split across both sides."
            value={budget}
            onChange={setBudget}
            rule={RULES.budget()}
            suffix="USDC"
            placeholder="100"
          />
        </div>
        <div className="results" aria-live="polite">
          {!result ? (
            <Notice tone="caution">Fix the highlighted inputs to see results.</Notice>
          ) : !result.exists ? (
            <Notice tone="neutral" role="status">
              <strong>No arbitrage.</strong> YES + NO = {fmtPrice(result.combined)} USDC, which is not below 1.
              Buying both sides would {result.combined > 1 ? 'lose' : 'return exactly'} money before fees.
            </Notice>
          ) : (
            <>
              <p className="results-summary">
                YES + NO = <strong>{fmtPrice(result.combined)} USDC</strong>, below 1. Each YES + NO pair pays 1 USDC.
              </p>
              <StatList label="Arbitrage results">
                <Stat
                  label="Guaranteed profit per 1 USDC of payout"
                  value={`${fmtMoney(result.profitPerDollarPayout)} USDC`}
                  note={`${fmtSignedRatioPercent(result.returnOnCost)} return on the money spent`}
                  tone="positive"
                  emphasis
                />
                <Stat
                  label="Buy YES shares"
                  value={fmtShares(result.sets)}
                  note={`costs ${fmtMoney(result.spendYes)} USDC at ${fmtPrice(result.spendYes / result.sets)}`}
                />
                <Stat
                  label="Buy NO shares"
                  value={fmtShares(result.sets)}
                  note={`costs ${fmtMoney(result.spendNo)} USDC at ${fmtPrice(result.spendNo / result.sets)}`}
                />
                <Stat
                  label="Guaranteed payout"
                  value={`${fmtMoney(result.guaranteedPayout)} USDC`}
                  note={`for ${fmtMoney(result.budget)} USDC spent`}
                />
                <Stat
                  label="Guaranteed profit"
                  value={`+${fmtMoney(result.guaranteedProfit)} USDC`}
                  note="whichever side resolves"
                  tone="positive"
                />
              </StatList>
            </>
          )}
        </div>
      </div>
    </Section>
  )
}
