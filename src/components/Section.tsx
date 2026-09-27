import type { ReactNode } from 'react'

export interface SectionProps {
  id: string
  number: number
  title: string
  lede?: ReactNode
  children: ReactNode
  /** One or two sentences explaining the formula. */
  how: ReactNode
}

/** A section card with a numbered kicker, heading, body and "How it works" note. */
export function Section({ id, number, title, lede, children, how }: SectionProps) {
  const headingId = `${id}-title`
  return (
    <section className="card" id={id} aria-labelledby={headingId}>
      <header className="card-header">
        <p className="card-kicker">Section {number}</p>
        <h2 id={headingId}>{title}</h2>
        {lede && <p className="card-lede">{lede}</p>}
      </header>
      {children}
      <aside className="how" aria-labelledby={`${id}-how`}>
        <h3 id={`${id}-how`}>How it works</h3>
        <p>{how}</p>
      </aside>
    </section>
  )
}

export function InfoIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8 7v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="8" cy="4.75" r="0.9" fill="currentColor" />
    </svg>
  )
}

export function Notice({
  tone = 'neutral',
  children,
  role,
  actions,
}: {
  tone?: 'neutral' | 'caution' | 'negative' | 'positive'
  children: ReactNode
  role?: 'status' | 'alert'
  actions?: ReactNode
}) {
  return (
    <div className="notice" data-tone={tone} role={role}>
      <InfoIcon />
      <div>{children}</div>
      {actions && <div className="btn-row">{actions}</div>}
    </div>
  )
}
