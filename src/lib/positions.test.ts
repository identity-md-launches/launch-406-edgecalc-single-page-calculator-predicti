import { describe, expect, it } from 'vitest'
import {
  loadPositions,
  parseCsv,
  positionsFromCsv,
  positionsToCsv,
  savePositions,
  STORAGE_KEY,
  type Position,
} from './positions'

const sample: Position[] = [
  { id: 'a', market: 'Fed cuts in March, "yes"?', side: 'YES', shares: 100, entryPrice: 0.4, currentPrice: 0.55 },
  { id: 'b', market: '=SUM(1,2) trick', side: 'NO', shares: 25.5, entryPrice: 0.62, currentPrice: 0.6 },
]

describe('CSV round trip', () => {
  it('exports a header and quotes fields safely', () => {
    const csv = positionsToCsv(sample)
    expect(csv.startsWith('market,side,shares,entry_price,current_price\r\n')).toBe(true)
    expect(csv).toContain('"Fed cuts in March, ""yes""?",YES,100,0.4,0.55')
    // Formula-looking names are prefixed so spreadsheets do not execute them.
    expect(csv).toContain("'=SUM(1,2) trick")
  })

  it('imports what it exported', () => {
    const back = positionsFromCsv(positionsToCsv(sample))
    expect(back.error).toBeUndefined()
    expect(back.skipped).toEqual([])
    expect(back.positions.map(({ id: _id, ...rest }) => rest)).toEqual(
      sample.map(({ id: _id, ...rest }) => rest),
    )
  })

  it('parses LF, CRLF, quotes and a BOM', () => {
    expect(parseCsv('\uFEFFa,b\n"c,d",e\r\n')).toEqual([
      ['a', 'b'],
      ['c,d', 'e'],
    ])
  })

  it('reports skipped lines with reasons and never imports bad rows', () => {
    const csv = [
      'market,side,shares,entry_price,current_price',
      'Good,YES,10,0.5,0.6',
      ',YES,10,0.5,0.6',
      'Bad side,MAYBE,10,0.5,0.6',
      'Bad shares,NO,0,0.5,0.6',
      'Bad entry,NO,10,1.5,0.6',
      'Bad current,NO,10,0.5,abc',
    ].join('\n')
    const r = positionsFromCsv(csv)
    expect(r.positions).toHaveLength(1)
    expect(r.skipped.map((s) => s.line)).toEqual([3, 4, 5, 6, 7])
  })

  it('rejects files without the expected columns', () => {
    const r = positionsFromCsv('foo,bar\n1,2')
    expect(r.error).toMatch(/Missing column/)
    expect(r.positions).toEqual([])
  })

  it('accepts common header aliases', () => {
    const r = positionsFromCsv('Name,Side,Qty,Entry,Price\nX,no,3,0.2,0.3')
    expect(r.positions).toHaveLength(1)
    expect(r.positions[0]?.side).toBe('NO')
  })
})

describe('localStorage persistence', () => {
  function memoryStorage() {
    const map = new Map<string, string>()
    return {
      getItem: (k: string) => map.get(k) ?? null,
      setItem: (k: string, v: string) => void map.set(k, v),
      map,
    }
  }

  it('saves and loads positions', () => {
    const s = memoryStorage()
    expect(savePositions(s, sample)).toBe(true)
    expect(loadPositions(s)).toEqual(sample)
  })

  it('drops corrupt entries instead of crashing', () => {
    const s = memoryStorage()
    s.map.set(STORAGE_KEY, JSON.stringify([sample[0], { id: 'x', market: '', side: 'YES' }, 42]))
    expect(loadPositions(s)).toEqual([sample[0]])
    s.map.set(STORAGE_KEY, '{not json')
    expect(loadPositions(s)).toEqual([])
    expect(loadPositions(null)).toEqual([])
  })

  it('returns false when storage throws (quota or blocked)', () => {
    const throwing = {
      setItem: () => {
        throw new Error('quota')
      },
    }
    expect(savePositions(throwing, sample)).toBe(false)
  })
})
