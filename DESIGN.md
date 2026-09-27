# EdgeCalc design

This document describes the design system as implemented in the source. Every
value below is taken from `src/styles/tokens.css`, `src/styles/app.css` and the
components under `src/components/` and `src/sections/`. Where a value was
confirmed in the browser, the check is recorded in `artifacts/validation.md`.

## Overview

EdgeCalc is a single-page calculator for prediction-market traders. The audience
reads numbers quickly on a phone between trades, so the interface is a dense,
quiet professional tool: neutral surfaces, one indigo accent reserved for the
single primary action and focus, and green/red used only for the sign of a
result. Everything is one column of numbered section cards; inside a card the
inputs sit on the leading side and the live results on the trailing side, then
collapse to a single column when the card is narrower than 40rem.

System-wide rules:

- Hierarchy comes from spacing and type size, not lines. Separators appear only
  above each "How it works" note and between table rows.
- Colour never carries meaning alone: every signed figure has a `+`/`−` sign,
  "No bet" is spelled out, and errors carry an icon and text.
- The theme follows `prefers-color-scheme`. There is no toggle and no stored
  preference.
- Money renders with 2 decimals and probabilities with 1 decimal, always in
  tabular figures, and never as `NaN` or `Infinity` (the formatters return an en
  dash instead).

## Colors

Defined in `src/styles/tokens.css` in `oklch()`. Two tiers: primitives named by
hue and step (`--gray-50`, `--indigo-600`, `--green-700`, `--red-700`,
`--amber-700`) are never used in components; semantic tokens named by role are
the only ones components reference. The dark block inside
`@media (prefers-color-scheme: dark)` repoints the semantic tokens; components do
not change.

| Role token | Light | Dark | Use |
| --- | --- | --- | --- |
| `--color-bg-page` | `--gray-50` oklch(97.5% 0.004 260) | `--gray-950` oklch(15.5% 0.01 260) | body background |
| `--color-bg-surface` | `--gray-0` white | `--gray-900` oklch(19% 0.012 260) | section cards, secondary buttons, selected segment |
| `--color-bg-subtle` | `--gray-100` | `--gray-850` | stat tiles, add-position form, hover fills |
| `--color-bg-inset` | `--gray-50` | `--gray-1000` | input and segmented-control wells |
| `--color-border` / `--color-border-strong` | `--gray-200` / `--gray-300` | `--gray-800` / `--gray-600` | hairlines; strong for input and button edges |
| `--color-text` | `--gray-900` | oklch(95% 0.005 260) | headings, values, input text |
| `--color-text-secondary` | `--gray-600` | oklch(74% 0.012 260) | labels, hints, notes, table headers |
| `--color-accent` / `--color-accent-hover` | `--indigo-600` / `--indigo-700` | `--indigo-500` oklch(56% 0.18 272) / `--indigo-300` | the one filled primary button per view |
| `--color-accent-text` | `--indigo-700` | `--indigo-300` | links and quiet (text) buttons |
| `--color-accent-soft` | `--indigo-100` | `--indigo-900` | text selection |
| `--color-focus` | `--indigo-600` | `--indigo-300` | every focus ring |
| `--color-positive-text` / `--color-positive-soft` | `--green-700` / `--green-100` | `--green-300` / `--green-900` | positive edge, EV, profit, YES badge |
| `--color-negative-text` / `--color-negative-soft` | `--red-700` / `--red-100` | `--red-300` / `--red-900` | negative values, losses, "No bet", errors, NO badge, destructive text buttons |
| `--color-caution-text` / `--color-caution-soft` | `--amber-700` / `--amber-100` | `--amber-300` / `--amber-900` | "fix the inputs" notices and the storage warning |

Measured contrast: 56 rendered text/background pairs (28 per theme) were read
from computed styles in Chromium and all meet WCAG 2 AA (4.5:1 for text under
24px). The lowest pairs are the dark primary button (white on `--indigo-500`,
4.87:1) and the light caution notice (5.68:1). Full list in
`artifacts/browser-check.json` under `contrast`.

Rules: add a role token rather than reusing one by value; keep new colours in
`oklch()`; do not introduce a second accent hue.

## Typography

Family: the system stack `--font-sans` (`system-ui, -apple-system, "Segoe UI",
Roboto, "Helvetica Neue", Arial, "Noto Sans", "Liberation Sans", sans-serif`).
No font files ship, so the export works offline and the rendered face depends on
the platform; weights 400, 500, 600 and 700 are requested.

Scale (`src/styles/tokens.css`):

| Token | Size | Used for |
| --- | --- | --- |
| `--text-xs` | 0.75rem | section kicker, table headers, stat notes, field hints |
| `--text-sm` | 0.875rem | labels, buttons, nav, table cells, notes, "How it works" |
| `--text-base` | 1rem | body, inputs (16px so iOS does not zoom), empty-state title |
| `--text-lg` | 1.125rem | `h3` (add-position form title) |
| `--text-xl` | 1.375rem | `h2` section titles and `.stat-value` figures |
| `--text-2xl` | 1.75rem | `h1` |

Headings use `--leading-tight` (1.15), `--tracking-heading` (−0.01em) and
`text-wrap: balance`; body uses `--leading-body` (1.5) and paragraphs get
`text-wrap: pretty`. Uppercase labels (kicker, table headers, badges) add
`--tracking-caps` (0.04em). Every changing number (`.stat-value`, `.input`,
`.positions .num`, `.results-summary`) uses `font-variant-numeric: tabular-nums`.
Long-form text is capped at `--measure` (65ch). Font smoothing is set once on
`html`.

## Layout

- Spacing steps on a 4px base: `--space-1` 0.25rem through `--space-7` 3rem.
  Within a group use `--space-1`/`--space-2`; between groups `--space-4`
  (1rem) or more; between cards `--space-5` (1.5rem).
- `.container` caps content at `--content-max` (68rem) with
  `padding-inline: clamp(1rem, 4vw, 2rem)`. Content bleeds to the edges only via
  the page background.
- Section cards (`.card`) are `container-type: inline-size`. `.section-grid`
  becomes two columns (`5fr` inputs / `7fr` results) at a container width of
  40rem and above; below that it is one column.
- `.stat-list` is `repeat(auto-fit, minmax(min(100%, 10rem), 1fr))`, so tiles
  reflow from one to three columns without a breakpoint; `data-emphasis="true"`
  spans the full row.
- The add-position form grid is `auto-fit, minmax(9rem, 1fr)` with the market
  field spanning the row until the card reaches 48rem, where it becomes a
  five-column row.
- The positions table switches to stacked cards below a container width of
  44rem: the header row is visually hidden, each row becomes a two-column grid
  and every cell prints its `data-label`. Explicit ARIA table roles keep the
  table semantics when the display type changes.
- Logical properties (`inline-size`, `padding-inline`, `margin-block-end`) are
  used throughout; nothing depends on physical left/right.
- Checked in the browser at 320, 390, 768 and 1280 CSS px with no horizontal
  overflow. The RTL mirror and native 200% zoom were not checked.

## Elevation & depth

Flat tonal layers with one shadow token. `--shadow-card` is a 1px alpha ring
plus two soft shadows (`0 1px 2px`, `0 4px 12px`) and is used only on `.card`
and the focused skip link. Inputs use an inset 1px ring in
`--color-border-strong`; buttons a 1px ring in the same token; the segmented
well a 1px ring in `--color-border`. Nothing floats above the page; there are
no overlays or modals (delete and clear use an inline undo notice instead).

## Shapes

- `--radius-sm` 0.375rem: side badges.
- `--radius-md` 0.5rem: inputs, buttons, stat tiles, notices, nav links, the
  add-position form.
- `--radius-lg` 0.875rem: section cards.
- Segmented options sit 2px inside their well and use `--radius-md − 2px` so the
  nested radii are concentric.
- Errors mark the input shell with a 2px `--color-negative-text` inset ring in
  addition to the icon and message.

## Components

- **Section** (`src/components/Section.tsx`): `<section class="card">` with a
  numbered kicker, `h2`, optional lede, body and the mandatory "How it works"
  aside (`.how`). Pass `id`, `number`, `title`, `how`.
- **NumberField / TextField** (`src/components/Field.tsx`): visible label
  (`compact` makes it screen-reader only for table cells), optional hint,
  `.input-shell` with an optional unit suffix, `inputmode="decimal"`, and an
  inline `.field-error` bound with `aria-describedby` and `aria-invalid`. Raw
  text is kept so typing is never blocked; `rule` (from `src/lib/validate.ts`)
  supplies the range and message. `showError={false}` defers messages until a
  submit.
- **Segmented** (`src/components/Segmented.tsx`): a native radio `fieldset`
  styled as a segmented control. The input covers the whole label, arrow keys
  move between options, `data-tone="yes|no"` colours the selected state, and
  `hideLegend` keeps the legend for assistive tech only.
- **Stat / StatList** (`src/components/Stat.tsx`): a `<dl>` of tiles with
  `tone` (`neutral | positive | negative | caution`) driving the soft background
  and value colour, plus a note line. `toneOf(n)` derives tone from sign.
- **Notice** (`src/components/Section.tsx`): icon + message with the same tones,
  optional `role="status"`/`alert` and trailing actions (used for undo).
- **Buttons** (classes in `src/styles/app.css`): `.btn` secondary (surface +
  1px ring), `.btn-primary` (accent fill, one per view), `.btn-quiet` (text
  only, accent or `data-danger` red). All are at least 40px tall, 44px for
  primary and secondary; press feedback is `scale: 0.96` gated by
  `prefers-reduced-motion`. The CSV import button is a `<label class="btn">`
  wrapping a hidden file input and shows the ring via `:has(:focus-visible)`.
- **Positions table** (`src/sections/PositionLog.tsx`): `.positions` with
  `.num` cells, `.side-badge`, `.pnl[data-tone]`, an inline edit row
  (`tr.editing`, keyed separately so buttons are never reused across modes) and
  a totals `tfoot`. Empty state `.empty` names the next action.
- **Focus**: every control shows a 2px `--color-focus` outline with 2px offset
  on `:focus-visible`; inputs draw it on the shell via `:focus-within`.

## Do's and don'ts

- Start a new page from `App.tsx`'s shell: header, `<main class="container">`,
  `Section` cards, footer. Keep one `h1` and one `h2` per section.
- Use `NumberField` for every numeric input and add a `RULES` entry rather than
  validating inline; never render a computed number without a `fmt*` helper.
- Fill exactly one `.btn-primary` per view; every other action is `.btn` or
  `.btn-quiet`.
- Put status meaning in text or an icon first, colour second. Reuse
  `positive`/`negative`/`caution` tones only for outcomes, warnings and errors.
- Prefer container queries on `.card` over viewport breakpoints; add a
  breakpoint only where content stops fitting.
- Do not add fonts, a theme toggle, analytics, cookies or network calls; the
  export must stay static and offline.
- Do not reuse a border token as text colour or a primitive directly in a
  component; add a semantic token in `tokens.css`.

Recipe for one more section: create `src/sections/NewThing.tsx` returning
`<Section id number title lede how>` with a `.section-grid` containing a
`.form-stack` of fields and a `.results` `StatList`; add it to `App.tsx` and a
matching entry to the `NAV` array.
