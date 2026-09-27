import { NumberField } from '../components/Field'
import { Segmented } from '../components/Segmented'
import { Notice, Section } from '../components/Section'
import { Stat, StatList, toneOf } from '../components/Stat'
import { fmtMoney, fmtPercent, fmtPrice, fmtShares, fmtSignedPoints, fmtSignedRatioPercent } from '../lib/format'
import { RULES } from '../lib/validate'
import { KELLY_OPTIONS, type BetInputs, type BetResults, type KellyOption } from './model'

interface Props {
  inputs: BetInputs
  update: <K extends keyof BetInputs>(key: K, value: BetInputs[K]) => void
  results: BetResults | null
}

const KELLY_LABELS: Record<KellyOption, string> = {
  '1': 'Full · 1',
  '0.5': 'Half · 0.5',
  '0.25': 'Quarter · 0.25',
  '0.1': 'Tenth · 0.1',
}

export function SingleBet({ inputs, update, results }: Props) {
  const r = results
  const feeNote = r && r.feeRate > 0 ? `after ${fmtPercent(r.feeRate)} fee on winnings` : undefined
  const other = inputs.side === 'YES' ? 'NO' : 'YES'

  return (
    <Section
      id="single-bet"
      number={1}
      title="Single bet"
      lede="Enter the market's YES price and your own probability. Pick the side you want to buy and EdgeCalc sizes the bet from your bankroll."
      how={
        <>
          Edge is your probability minus the price you pay. Full Kelly{' '}
          <code>f* = (p − price) ÷ (1 − price)</code> is the share of bankroll that maximises long-run growth; most
          traders stake a fraction of it because probability estimates are noisy. Buying NO uses the NO price{' '}
          <code>1 − YES price</code> and your probability that NO wins.
        </>
      }
    >
      <div className="section-grid">
        <div className="form-stack">
          <Segmented
            legend="Side to buy"
            name="side"
            value={inputs.side}
            onChange={(v) => update('side', v)}
            options={[
              { value: 'YES', label: 'YES', tone: 'yes' },
              { value: 'NO', label: 'NO', tone: 'no' },
            ]}
          />
          <NumberField
            id="yes-price"
            label="Market YES price"
            hint="Share price in USDC, 0.01 to 0.99. The NO price is 1 minus this."
            value={inputs.yesPrice}
            onChange={(v) => update('yesPrice', v)}
            rule={RULES.price('YES price')}
            suffix="USDC"
            placeholder="0.55"
          />
          <NumberField
            id="probability"
            label="My probability that YES wins"
            hint="Your own estimate, 1 to 99 percent."
            value={inputs.probability}
            onChange={(v) => update('probability', v)}
            rule={RULES.probabilityPercent('Probability')}
            suffix="%"
            placeholder="62"
          />
          <NumberField
            id="bankroll"
            label="Bankroll"
            hint="Total capital you size bets against."
            value={inputs.bankroll}
            onChange={(v) => update('bankroll', v)}
            rule={RULES.bankroll()}
            suffix="USDC"
            placeholder="1000"
          />
          <Segmented
            legend="Kelly fraction"
            hint="Share of the full Kelly stake to actually bet."
            name="kelly"
            value={inputs.kelly}
            onChange={(v) => update('kelly', v)}
            options={KELLY_OPTIONS.map((k) => ({ value: k, label: KELLY_LABELS[k] }))}
          />
        </div>

        <div className="results" aria-live="polite" aria-atomic="false">
          {!r ? (
            <Notice tone="caution">Fix the highlighted inputs to see results.</Notice>
          ) : (
            <>
              <p className="results-summary">
                Buying <strong>{r.side}</strong> at <strong>{fmtPrice(r.price)} USDC</strong> with your{' '}
                <strong>{fmtPercent(r.p)}</strong> chance that {r.side} wins.
                {r.fullKelly === null && r.edge < 0 && (
                  <>
                    {' '}
                    The {other} side has the positive edge here.
                  </>
                )}
              </p>
              <StatList label="Single bet results">
                <Stat
                  label="Edge"
                  value={fmtSignedPoints(r.edge)}
                  note="my probability − price"
                  tone={toneOf(r.edge)}
                />
                <Stat
                  label="Expected value per 1 USDC staked"
                  value={fmtSignedRatioPercent(r.ev)}
                  note={feeNote ?? 'probability ÷ price − 1'}
                  tone={toneOf(r.ev)}
                />
                <Stat
                  label="Full Kelly f*"
                  value={r.fullKelly === null ? 'No bet' : fmtPercent(r.fullKelly)}
                  note={r.fullKelly === null ? 'f* is zero or negative' : `of bankroll${feeNote ? `, ${feeNote}` : ''}`}
                  tone={r.fullKelly === null ? 'negative' : 'neutral'}
                />
                <Stat
                  label={`Suggested stake at ${r.kellyMultiplier}× Kelly`}
                  value={r.plan ? `${fmtMoney(r.plan.stake)} USDC` : 'No bet'}
                  note={r.plan ? `buys ${fmtShares(r.plan.shares)} shares at ${fmtPrice(r.price)}` : 'no positive edge to size'}
                  tone={r.plan ? 'neutral' : 'negative'}
                  emphasis
                />
                <Stat
                  label="Payout if right"
                  value={r.plan ? `${fmtMoney(r.plan.payoutIfRight)} USDC` : '–'}
                  note={r.plan ? 'stake returned plus profit' : undefined}
                />
                <Stat
                  label="Profit if right"
                  value={r.plan ? `+${fmtMoney(r.plan.profitIfRight)} USDC` : '–'}
                  note={feeNote}
                  tone={r.plan ? 'positive' : 'neutral'}
                />
                <Stat
                  label="Loss if wrong"
                  value={r.plan ? `−${fmtMoney(r.plan.lossIfWrong)} USDC` : '–'}
                  note={r.plan ? 'the whole stake' : undefined}
                  tone={r.plan ? 'negative' : 'neutral'}
                />
              </StatList>
            </>
          )}
        </div>
      </div>
    </Section>
  )
}
