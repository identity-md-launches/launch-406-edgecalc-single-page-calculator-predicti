import type { Side } from './calc'
import { parseLooseNumber } from './validate'

export interface Position {
  id: string
  market: string
  side: Side
  shares: number
  entryPrice: number
  currentPrice: number
}

export const STORAGE_KEY = 'edgecalc.positions.v1'

export function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

/** Type guard used both for localStorage and CSV import. */
export function isValidPosition(p: unknown): p is Position {
  if (!p || typeof p !== 'object') return false
  const o = p as Record<string, unknown>
  return (
    typeof o.id === 'string' &&
    typeof o.market === 'string' &&
    o.market.trim() !== '' &&
    (o.side === 'YES' || o.side === 'NO') &&
    isFiniteIn(o.shares, 0, 1e9, false) &&
    isFiniteIn(o.entryPrice, 0, 1, false) &&
    isFiniteIn(o.currentPrice, 0, 1, false)
  )
}

function isFiniteIn(v: unknown, min: number, max: number, inclusive: boolean): v is number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return false
  return inclusive ? v >= min && v <= max : v > min && v < max
}

export function loadPositions(storage: Pick<Storage, 'getItem'> | null): Position[] {
  if (!storage) return []
  try {
    const raw = storage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isValidPosition)
  } catch {
    return []
  }
}

export function savePositions(storage: Pick<Storage, 'setItem'> | null, positions: Position[]): boolean {
  if (!storage) return false
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(positions))
    return true
  } catch {
    return false
  }
}

/* ---------------------------------------------------------------- CSV */

export const CSV_HEADER = ['market', 'side', 'shares', 'entry_price', 'current_price'] as const

function csvEscape(value: string): string {
  // Neutralise spreadsheet formula injection, then quote when needed.
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}

export function positionsToCsv(positions: Position[]): string {
  const lines = [CSV_HEADER.join(',')]
  for (const p of positions) {
    lines.push(
      [
        csvEscape(p.market),
        p.side,
        String(p.shares),
        String(p.entryPrice),
        String(p.currentPrice),
      ].join(','),
    )
  }
  return `${lines.join('\r\n')}\r\n`
}

/** RFC 4180-style parser: quoted fields, doubled quotes, CRLF or LF. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  const src = text.startsWith('\uFEFF') ? text.slice(1) : text
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += ch
      }
      continue
    }
    if (ch === '"') {
      inQuotes = true
    } else if (ch === ',') {
      row.push(field)
      field = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else {
      field += ch
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  return rows.filter((r) => !(r.length === 1 && r[0] === ''))
}

export interface CsvImportResult {
  positions: Position[]
  /** 1-based line numbers (in the file) that were skipped, with a reason. */
  skipped: { line: number; reason: string }[]
  /** Set when the file could not be read as a positions CSV at all. */
  error?: string
}

export function positionsFromCsv(text: string): CsvImportResult {
  const rows = parseCsv(text)
  if (rows.length === 0) return { positions: [], skipped: [], error: 'The file is empty.' }

  const header = (rows[0] ?? []).map((h) => h.trim().toLowerCase().replace(/\s+/g, '_'))
  const idx = (names: string[]) => header.findIndex((h) => names.includes(h))
  const col = {
    market: idx(['market', 'market_name', 'name']),
    side: idx(['side']),
    shares: idx(['shares', 'quantity', 'qty']),
    entry: idx(['entry_price', 'entry', 'avg_price', 'average_price']),
    current: idx(['current_price', 'current', 'price', 'mark']),
  }
  const missing = Object.entries(col)
    .filter(([, i]) => i < 0)
    .map(([k]) => k)
  if (missing.length > 0) {
    return {
      positions: [],
      skipped: [],
      error: `Missing column${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}. Expected header: ${CSV_HEADER.join(',')}.`,
    }
  }

  const positions: Position[] = []
  const skipped: CsvImportResult['skipped'] = []
  rows.slice(1).forEach((r, i) => {
    const line = i + 2
    const market = (r[col.market] ?? '').trim().replace(/^'/, '')
    const sideRaw = (r[col.side] ?? '').trim().toUpperCase()
    const shares = parseLooseNumber(r[col.shares] ?? '')
    const entryPrice = parseLooseNumber(r[col.entry] ?? '')
    const currentPrice = parseLooseNumber(r[col.current] ?? '')
    const candidate = {
      id: newId(),
      market,
      side: sideRaw as Side,
      shares,
      entryPrice,
      currentPrice,
    }
    if (market === '') skipped.push({ line, reason: 'market name is empty' })
    else if (sideRaw !== 'YES' && sideRaw !== 'NO') skipped.push({ line, reason: 'side must be YES or NO' })
    else if (!Number.isFinite(shares) || shares <= 0) skipped.push({ line, reason: 'shares must be greater than 0' })
    else if (!Number.isFinite(entryPrice) || entryPrice <= 0 || entryPrice >= 1)
      skipped.push({ line, reason: 'entry price must be between 0 and 1' })
    else if (!Number.isFinite(currentPrice) || currentPrice <= 0 || currentPrice >= 1)
      skipped.push({ line, reason: 'current price must be between 0 and 1' })
    else if (isValidPosition(candidate)) positions.push(candidate)
    else skipped.push({ line, reason: 'row is not a valid position' })
  })
  return { positions, skipped }
}
