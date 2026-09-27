import { useId, type ChangeEvent, type ReactNode, type RefObject } from 'react'
import { parseNumber, type NumberRule, type Parsed } from '../lib/validate'

/** Small inline warning glyph used beside error text (redundant to color). */
export function ErrorIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path
        d="M8 1.5 15 14H1L8 1.5Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M8 6v3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="8" cy="11.75" r="0.9" fill="currentColor" />
    </svg>
  )
}

export interface NumberFieldProps {
  label: string
  value: string
  onChange: (raw: string) => void
  rule: NumberRule
  /** Unit shown inside the field, e.g. "USDC" or "%". */
  suffix?: string
  hint?: ReactNode
  placeholder?: string
  /** Override the message (e.g. show errors only after submit). */
  showError?: boolean
  inputRef?: RefObject<HTMLInputElement | null>
  autoComplete?: string
  /** Compact variant for table cells. */
  compact?: boolean
  /** Explicit id so external labels/tests can target the input. */
  id?: string
}

/**
 * Text input with `inputmode="decimal"` (so mobile keyboards show digits),
 * a visible label, a unit suffix and an inline fix-it message bound with
 * `aria-describedby`. Raw text is kept so typing is never blocked.
 */
export function NumberField(props: NumberFieldProps) {
  const autoId = useId()
  const id = props.id ?? autoId
  const parsed: Parsed = parseNumber(props.value, props.rule)
  const showError = props.showError ?? true
  const invalid = showError && !parsed.ok
  const errorId = `${id}-error`
  const hintId = `${id}-hint`
  const describedBy = [props.hint ? hintId : null, invalid ? errorId : null].filter(Boolean).join(' ')

  return (
    <div className="field">
      {props.compact ? (
        <label className="visually-hidden" htmlFor={id}>
          {props.label}
        </label>
      ) : (
        <label className="field-label" htmlFor={id}>
          {props.label}
        </label>
      )}
      {props.hint && !props.compact && (
        <p className="field-hint" id={hintId}>
          {props.hint}
        </p>
      )}
      <div className="input-shell" data-invalid={invalid ? 'true' : 'false'}>
        <input
          ref={props.inputRef}
          id={id}
          className="input"
          type="text"
          inputMode="decimal"
          autoComplete={props.autoComplete ?? 'off'}
          spellCheck={false}
          value={props.value}
          placeholder={props.placeholder}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy || undefined}
          onChange={(e: ChangeEvent<HTMLInputElement>) => props.onChange(e.target.value)}
        />
        {props.suffix && (
          <span className="input-suffix" aria-hidden="true">
            {props.suffix}
          </span>
        )}
      </div>
      {invalid && (
        <p className="field-error" id={errorId}>
          <ErrorIcon />
          <span>{parsed.message}</span>
        </p>
      )}
    </div>
  )
}

export interface TextFieldProps {
  label: string
  value: string
  onChange: (raw: string) => void
  error?: string | undefined
  hint?: ReactNode
  placeholder?: string
  maxLength?: number
  inputRef?: RefObject<HTMLInputElement | null>
  compact?: boolean
  id?: string
}

export function TextField(props: TextFieldProps) {
  const autoId = useId()
  const id = props.id ?? autoId
  const invalid = Boolean(props.error)
  const errorId = `${id}-error`
  const hintId = `${id}-hint`
  const describedBy = [props.hint ? hintId : null, invalid ? errorId : null].filter(Boolean).join(' ')
  return (
    <div className="field">
      <label className={props.compact ? 'visually-hidden' : 'field-label'} htmlFor={id}>
        {props.label}
      </label>
      {props.hint && !props.compact && (
        <p className="field-hint" id={hintId}>
          {props.hint}
        </p>
      )}
      <div className="input-shell" data-invalid={invalid ? 'true' : 'false'}>
        <input
          ref={props.inputRef}
          id={id}
          className="input"
          type="text"
          autoComplete="off"
          value={props.value}
          placeholder={props.placeholder}
          maxLength={props.maxLength}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy || undefined}
          onChange={(e) => props.onChange(e.target.value)}
        />
      </div>
      {invalid && (
        <p className="field-error" id={errorId}>
          <ErrorIcon />
          <span>{props.error}</span>
        </p>
      )}
    </div>
  )
}
