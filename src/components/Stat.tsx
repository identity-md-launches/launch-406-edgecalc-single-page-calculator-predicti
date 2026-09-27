import type { ReactNode } from 'react'

export type Tone = 'neutral' | 'positive' | 'negative' | 'caution'

export interface StatProps {
  label: string
  value: ReactNode
  note?: ReactNode
  tone?: Tone
  /** Span the full row of the stat grid. */
  emphasis?: boolean
}

/** One labelled figure. Render inside <StatList> (a <dl>). */
export function Stat({ label, value, note, tone = 'neutral', emphasis }: StatProps) {
  return (
    <div className="stat" data-tone={tone} data-emphasis={emphasis ? 'true' : undefined}>
      <dt>{label}</dt>
      <dd>
        <span className="stat-value">{value}</span>
        {note && <span className="stat-note">{note}</span>}
      </dd>
    </div>
  )
}

export function StatList({ children, label }: { children: ReactNode; label: string }) {
  return (
    <dl className="stat-list" aria-label={label}>
      {children}
    </dl>
  )
}

/** Sign-aware tone: positive/negative/neutral by the number's sign. */
export function toneOf(n: number | null | undefined): Tone {
  if (typeof n !== 'number' || !Number.isFinite(n) || n === 0) return 'neutral'
  return n > 0 ? 'positive' : 'negative'
}
