import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { NumberField, TextField } from '../components/Field'
import { Segmented } from '../components/Segmented'
import { Notice, Section } from '../components/Section'
import { toneOf } from '../components/Stat'
import { unrealizedPnl, type Side } from '../lib/calc'
import { fmtMoney, fmtPrice, fmtShares, fmtSignedMoney, toPlainNumber } from '../lib/format'
import {
  loadPositions,
  newId,
  positionsFromCsv,
  positionsToCsv,
  savePositions,
  type Position,
} from '../lib/positions'
import { MARKET_NAME_MAX, parseNumber, RULES, validateMarketName } from '../lib/validate'

interface Draft {
  market: string
  side: Side
  shares: string
  entryPrice: string
  currentPrice: string
}

const EMPTY_DRAFT: Draft = { market: '', side: 'YES', shares: '', entryPrice: '', currentPrice: '' }

function draftOf(p: Position): Draft {
  return {
    market: p.market,
    side: p.side,
    shares: toPlainNumber(p.shares),
    entryPrice: toPlainNumber(p.entryPrice),
    currentPrice: toPlainNumber(p.currentPrice),
  }
}

/** Validate a draft; returns the position (with the given id) or the first failing field. */
function draftToPosition(d: Draft, id: string): { ok: true; position: Position } | { ok: false; field: keyof Draft } {
  const market = validateMarketName(d.market)
  if (!market.ok) return { ok: false, field: 'market' }
  const shares = parseNumber(d.shares, RULES.shares())
  if (!shares.ok) return { ok: false, field: 'shares' }
  const entry = parseNumber(d.entryPrice, RULES.price('Entry price'))
  if (!entry.ok) return { ok: false, field: 'entryPrice' }
  const current = parseNumber(d.currentPrice, RULES.price('Current price'))
  if (!current.ok) return { ok: false, field: 'currentPrice' }
  return {
    ok: true,
    position: {
      id,
      market: market.value,
      side: d.side,
      shares: shares.value,
      entryPrice: entry.value,
      currentPrice: current.value,
    },
  }
}

function storage(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null
  } catch {
    return null
  }
}

export function PositionLog() {
  const [positions, setPositions] = useState<Position[]>(() => loadPositions(storage()))
  const [saveFailed, setSaveFailed] = useState(false)
  const [status, setStatus] = useState('')
  const [undo, setUndo] = useState<{ label: string; previous: Position[] } | null>(null)

  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT)
  const [submitted, setSubmitted] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState<Draft>(EMPTY_DRAFT)
  const [editSubmitted, setEditSubmitted] = useState(false)

  const marketRef = useRef<HTMLInputElement>(null)
  const sharesRef = useRef<HTMLInputElement>(null)
  const entryRef = useRef<HTMLInputElement>(null)
  const currentRef = useRef<HTMLInputElement>(null)
  const editRefs = {
    market: useRef<HTMLInputElement>(null),
    shares: useRef<HTMLInputElement>(null),
    entryPrice: useRef<HTMLInputElement>(null),
    currentPrice: useRef<HTMLInputElement>(null),
  }
  const editButtonRefs = useRef(new Map<string, HTMLButtonElement>())
  const undoRef = useRef<HTMLButtonElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // Persist on every change; surface a warning if the browser refuses.
  const first = useRef(true)
  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    setSaveFailed(!savePositions(storage(), positions))
  }, [positions])

  const total = useMemo(
    () => positions.reduce((sum, p) => sum + unrealizedPnl(p.shares, p.entryPrice, p.currentPrice), 0),
    [positions],
  )
  const totalCost = useMemo(() => positions.reduce((s, p) => s + p.shares * p.entryPrice, 0), [positions])

  function commit(next: Position[], message: string, undoLabel?: string) {
    setUndo(undoLabel ? { label: undoLabel, previous: positions } : null)
    setPositions(next)
    setStatus(message)
  }

  function onAdd(e: FormEvent) {
    e.preventDefault()
    setSubmitted(true)
    const result = draftToPosition(draft, newId())
    if (!result.ok) {
      const refs = { market: marketRef, shares: sharesRef, entryPrice: entryRef, currentPrice: currentRef, side: marketRef }
      refs[result.field].current?.focus()
      return
    }
    commit([...positions, result.position], `Added ${result.position.market}.`)
    setDraft(EMPTY_DRAFT)
    setSubmitted(false)
    marketRef.current?.focus()
  }

  function startEdit(p: Position) {
    setEditingId(p.id)
    setEditDraft(draftOf(p))
    setEditSubmitted(false)
    requestAnimationFrame(() => editRefs.market.current?.focus())
  }

  function cancelEdit() {
    const id = editingId
    setEditingId(null)
    if (id) requestAnimationFrame(() => editButtonRefs.current.get(id)?.focus())
  }

  function saveEdit(e: FormEvent) {
    e.preventDefault()
    if (!editingId) return
    setEditSubmitted(true)
    const result = draftToPosition(editDraft, editingId)
    if (!result.ok) {
      if (result.field !== 'side') editRefs[result.field].current?.focus()
      return
    }
    const id = editingId
    commit(
      positions.map((p) => (p.id === id ? result.position : p)),
      `Saved changes to ${result.position.market}.`,
    )
    setEditingId(null)
    requestAnimationFrame(() => editButtonRefs.current.get(id)?.focus())
  }

  function remove(p: Position) {
    commit(
      positions.filter((x) => x.id !== p.id),
      `Deleted ${p.market}.`,
      'Undo delete',
    )
    requestAnimationFrame(() => undoRef.current?.focus())
  }

  function clearAll() {
    if (positions.length === 0) return
    commit([], `Cleared ${positions.length} position${positions.length === 1 ? '' : 's'}.`, 'Undo clear')
    requestAnimationFrame(() => undoRef.current?.focus())
  }

  function doUndo() {
    if (!undo) return
    setPositions(undo.previous)
    setStatus('Restored.')
    setUndo(null)
  }

  function exportCsv() {
    const csv = positionsToCsv(positions)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    const stamp = new Date().toISOString().slice(0, 10)
    a.href = url
    a.download = `edgecalc-positions-${stamp}.csv`
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    setStatus(`Exported ${positions.length} position${positions.length === 1 ? '' : 's'} as CSV.`)
  }

  async function importCsv(file: File | undefined) {
    if (!file) return
    let text: string
    try {
      text = await file.text()
    } catch {
      setStatus('Unable to read that file. Choose a CSV file and try again.')
      return
    }
    const result = positionsFromCsv(text)
    if (result.error) {
      setStatus(`Import failed: ${result.error}`)
      return
    }
    const skipped =
      result.skipped.length > 0
        ? ` Skipped ${result.skipped.length} line${result.skipped.length === 1 ? '' : 's'}: ${result.skipped
            .slice(0, 3)
            .map((s) => `line ${s.line} (${s.reason})`)
            .join(', ')}${result.skipped.length > 3 ? ', …' : ''}.`
        : ''
    if (result.positions.length === 0) {
      setStatus(`No positions imported.${skipped}`)
      return
    }
    commit(
      [...positions, ...result.positions],
      `Imported ${result.positions.length} position${result.positions.length === 1 ? '' : 's'} from ${file.name}.${skipped}`,
      'Undo import',
    )
    if (fileRef.current) fileRef.current.value = ''
  }

  const sideOptions = [
    { value: 'YES' as Side, label: 'YES', tone: 'yes' as const },
    { value: 'NO' as Side, label: 'NO', tone: 'no' as const },
  ]

  return (
    <Section
      id="positions"
      number={4}
      title="Position log"
      lede="Track open positions and their unrealised profit or loss. Everything stays in this browser."
      how={
        <>
          Unrealised P&amp;L <code>= shares × (current price − entry price)</code>, so it is what you would gain or
          lose by selling at the current price. Positions are saved only in this browser's localStorage; export a
          CSV to back them up or move them to another device.
        </>
      }
    >
      <form className="add-form" onSubmit={onAdd} noValidate aria-labelledby="add-position-title">
        <h3 id="add-position-title">Add a position</h3>
        <div className="add-form-grid">
          <div className="field-wide">
            <TextField
              id="pos-market"
              label="Market"
              value={draft.market}
              onChange={(v) => setDraft({ ...draft, market: v })}
              error={submitted ? errorFor(validateMarketName(draft.market)) : undefined}
              placeholder="e.g. Fed cuts rates in March"
              maxLength={MARKET_NAME_MAX}
              inputRef={marketRef}
            />
          </div>
          <Segmented
            legend="Side"
            name="pos-side"
            value={draft.side}
            onChange={(v) => setDraft({ ...draft, side: v })}
            options={sideOptions}
          />
          <NumberField
            id="pos-shares"
            label="Shares"
            value={draft.shares}
            onChange={(v) => setDraft({ ...draft, shares: v })}
            rule={RULES.shares()}
            showError={submitted}
            placeholder="100"
            inputRef={sharesRef}
          />
          <NumberField
            id="pos-entry"
            label="Entry price"
            value={draft.entryPrice}
            onChange={(v) => setDraft({ ...draft, entryPrice: v })}
            rule={RULES.price('Entry price')}
            showError={submitted}
            suffix="USDC"
            placeholder="0.40"
            inputRef={entryRef}
          />
          <NumberField
            id="pos-current"
            label="Current price"
            value={draft.currentPrice}
            onChange={(v) => setDraft({ ...draft, currentPrice: v })}
            rule={RULES.price('Current price')}
            showError={submitted}
            suffix="USDC"
            placeholder="0.55"
            inputRef={currentRef}
          />
        </div>
        <div className="btn-row">
          <button type="submit" className="btn btn-primary">
            Add position
          </button>
        </div>
      </form>

      <div className="log-toolbar">
        <div className="btn-row">
          <button type="button" className="btn" onClick={exportCsv} disabled={positions.length === 0}>
            Export CSV
          </button>
          <label className="btn">
            Import CSV
            <input
              ref={fileRef}
              className="visually-hidden"
              type="file"
              accept=".csv,text/csv,text/plain"
              onChange={(e) => void importCsv(e.target.files?.[0])}
            />
          </label>
          <button
            type="button"
            className="btn btn-quiet"
            data-danger="true"
            onClick={clearAll}
            disabled={positions.length === 0}
          >
            Clear all
          </button>
        </div>
        <p className={undo ? 'visually-hidden' : 'log-status'} role="status" aria-live="polite">
          {status}
        </p>
      </div>

      {undo && (
        <div style={{ marginBlockEnd: 'var(--space-4)' }}>
          <Notice
            tone="neutral"
            actions={
              <>
                <button ref={undoRef} type="button" className="btn btn-quiet" onClick={doUndo}>
                  {undo.label}
                </button>
                <button type="button" className="btn btn-quiet" onClick={() => setUndo(null)}>
                  Dismiss
                </button>
              </>
            }
          >
            {status}
          </Notice>
        </div>
      )}

      {saveFailed && (
        <div style={{ marginBlockEnd: 'var(--space-4)' }}>
          <Notice tone="caution" role="alert">
            Unable to save positions in this browser (storage is blocked or full). They will be lost when you
            close the page; export a CSV to keep them.
          </Notice>
        </div>
      )}

      {positions.length === 0 ? (
        <div className="empty">
          <strong>No positions yet</strong>
          <span>Add a position above or import a CSV with the columns market, side, shares, entry_price, current_price.</span>
        </div>
      ) : (
        <form className="table-wrap" onSubmit={saveEdit} noValidate>
          <table className="positions" role="table">
            <caption className="visually-hidden">Open positions with unrealised profit and loss</caption>
            <thead role="rowgroup">
              <tr role="row">
                <th role="columnheader" scope="col" className="cell-market">
                  Market
                </th>
                <th role="columnheader" scope="col">
                  Side
                </th>
                <th role="columnheader" scope="col" className="num">
                  Shares
                </th>
                <th role="columnheader" scope="col" className="num">
                  Entry
                </th>
                <th role="columnheader" scope="col" className="num">
                  Current
                </th>
                <th role="columnheader" scope="col" className="num">
                  P&amp;L
                </th>
                <th role="columnheader" scope="col" className="cell-actions">
                  <span className="visually-hidden">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody role="rowgroup">
              {positions.map((p) => {
                const pnl = unrealizedPnl(p.shares, p.entryPrice, p.currentPrice)
                if (editingId === p.id) {
                  return (
                    // Distinct key so React does not reuse the Edit button's DOM node for the
                    // Save (submit) button: the browser's post-click activation would then submit.
                    <tr role="row" key={`${p.id}:edit`} className="editing">
                      <td role="cell" className="cell-market edit-cell" data-label="Market">
                        <TextField
                          compact
                          label="Market"
                          value={editDraft.market}
                          onChange={(v) => setEditDraft({ ...editDraft, market: v })}
                          error={editSubmitted ? errorFor(validateMarketName(editDraft.market)) : undefined}
                          maxLength={MARKET_NAME_MAX}
                          inputRef={editRefs.market}
                        />
                      </td>
                      <td role="cell" className="edit-cell" data-label="Side">
                        <Segmented
                          legend="Side"
                          hideLegend
                          name={`edit-side-${p.id}`}
                          value={editDraft.side}
                          onChange={(v) => setEditDraft({ ...editDraft, side: v })}
                          options={sideOptions}
                        />
                      </td>
                      <td role="cell" className="num edit-cell" data-label="Shares">
                        <NumberField
                          compact
                          label="Shares"
                          value={editDraft.shares}
                          onChange={(v) => setEditDraft({ ...editDraft, shares: v })}
                          rule={RULES.shares()}
                          showError={editSubmitted}
                          inputRef={editRefs.shares}
                        />
                      </td>
                      <td role="cell" className="num edit-cell" data-label="Entry">
                        <NumberField
                          compact
                          label="Entry price"
                          value={editDraft.entryPrice}
                          onChange={(v) => setEditDraft({ ...editDraft, entryPrice: v })}
                          rule={RULES.price('Entry price')}
                          showError={editSubmitted}
                          inputRef={editRefs.entryPrice}
                        />
                      </td>
                      <td role="cell" className="num edit-cell" data-label="Current">
                        <NumberField
                          compact
                          label="Current price"
                          value={editDraft.currentPrice}
                          onChange={(v) => setEditDraft({ ...editDraft, currentPrice: v })}
                          rule={RULES.price('Current price')}
                          showError={editSubmitted}
                          inputRef={editRefs.currentPrice}
                        />
                      </td>
                      <td role="cell" className="num pnl" data-label="P&L" data-tone={toneOf(pnl)}>
                        {fmtSignedMoney(pnl)}
                      </td>
                      <td role="cell" className="cell-actions" data-label="Actions">
                        <div className="btn-row">
                          <button type="submit" className="btn btn-quiet">
                            Save
                          </button>
                          <button type="button" className="btn btn-quiet" onClick={cancelEdit}>
                            Cancel
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                }
                return (
                  <tr role="row" key={p.id}>
                    <td role="cell" className="cell-market" data-label="Market">
                      {p.market}
                    </td>
                    <td role="cell" data-label="Side">
                      <span className="side-badge" data-side={p.side}>
                        {p.side}
                      </span>
                    </td>
                    <td role="cell" className="num" data-label="Shares">
                      {fmtShares(p.shares)}
                    </td>
                    <td role="cell" className="num" data-label="Entry">
                      {fmtPrice(p.entryPrice)}
                    </td>
                    <td role="cell" className="num" data-label="Current">
                      {fmtPrice(p.currentPrice)}
                    </td>
                    <td role="cell" className="num pnl" data-label="P&L" data-tone={toneOf(pnl)}>
                      {fmtSignedMoney(pnl)}
                    </td>
                    <td role="cell" className="cell-actions" data-label="Actions">
                      <div className="btn-row">
                        <button
                          type="button"
                          className="btn btn-quiet"
                          ref={(el) => {
                            if (el) editButtonRefs.current.set(p.id, el)
                            else editButtonRefs.current.delete(p.id)
                          }}
                          onClick={() => startEdit(p)}
                          aria-label={`Edit ${p.market}`}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="btn btn-quiet"
                          data-danger="true"
                          onClick={() => remove(p)}
                          aria-label={`Delete ${p.market}`}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot role="rowgroup">
              <tr role="row">
                <td role="cell" colSpan={2} className="total-label" data-label="Total">
                  Total across {positions.length} position{positions.length === 1 ? '' : 's'}
                </td>
                <td role="cell" className="num" data-label="Shares">
                  {fmtShares(positions.reduce((s, p) => s + p.shares, 0))}
                </td>
                <td role="cell" className="num" data-label="Cost">
                  <span className="cell-meta">Cost</span>
                  {fmtMoney(totalCost)}
                </td>
                <td role="cell" className="num" data-label="Value">
                  <span className="cell-meta">Value</span>
                  {fmtMoney(totalCost + total)}
                </td>
                <td role="cell" className="num pnl" data-label="Total P&L" data-tone={toneOf(total)}>
                  {fmtSignedMoney(total)}
                </td>
                <td role="cell" className="cell-actions" aria-hidden="true"></td>
              </tr>
            </tfoot>
          </table>
        </form>
      )}
    </Section>
  )
}

function errorFor(r: { ok: true } | { ok: false; message: string }): string | undefined {
  return r.ok ? undefined : r.message
}
