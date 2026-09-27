import { useId } from 'react'

export interface SegmentedOption<T extends string> {
  value: T
  label: string
  /** Optional colour tone for the selected state (YES/NO). */
  tone?: 'yes' | 'no'
}

export interface SegmentedProps<T extends string> {
  legend: string
  name: string
  value: T
  options: readonly SegmentedOption<T>[]
  onChange: (value: T) => void
  hint?: string
  /** Keep the legend for assistive tech only (e.g. inside a table cell with a column header). */
  hideLegend?: boolean
}

/**
 * A native radio group styled as a segmented control. Arrow keys move
 * between options, the selected option is announced as "checked", and the
 * ring is drawn on the label via :has(:focus-visible).
 */
export function Segmented<T extends string>(props: SegmentedProps<T>) {
  const id = useId()
  return (
    <fieldset className="segmented">
      <legend className={props.hideLegend ? 'visually-hidden' : undefined}>{props.legend}</legend>
      {props.hint && (
        <p className="field-hint" id={`${id}-hint`}>
          {props.hint}
        </p>
      )}
      <div className="segmented-options">
        {props.options.map((opt) => (
          <label key={opt.value} className="segmented-option" data-tone={opt.tone}>
            <input
              type="radio"
              name={props.name}
              value={opt.value}
              checked={props.value === opt.value}
              onChange={() => props.onChange(opt.value)}
              aria-describedby={props.hint ? `${id}-hint` : undefined}
            />
            {opt.label}
          </label>
        ))}
      </div>
    </fieldset>
  )
}
