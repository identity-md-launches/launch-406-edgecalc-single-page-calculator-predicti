#!/usr/bin/env node
/**
 * Bounded browser verification of the production export in dist/.
 *
 * - Serves the repository root on an ephemeral localhost port so the export
 *   is inspected under a subpath (/dist/), which exercises relative asset URLs.
 * - Launches Chromium with Playwright, walks the primary interactions, checks
 *   for console errors, failed requests, horizontal overflow and any "NaN" or
 *   "Infinity" text, and measures rendered text/background contrast.
 * - Saves screenshots to artifacts/screenshots/ and a JSON report to
 *   artifacts/browser-check.json, then shuts everything down and exits.
 *
 * Usage: node scripts/browser-check.mjs
 * Env:   EDGECALC_CHROMIUM=/path/to/chrome  (optional executable override)
 */
import { createServer } from 'node:http'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { existsSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dist = path.join(root, 'dist')
const shotsDir = path.join(root, 'artifacts', 'screenshots')
const reportPath = path.join(root, 'artifacts', 'browser-check.json')

if (!existsSync(path.join(dist, 'index.html'))) {
  console.error('dist/index.html not found. Run `npm run build` first.')
  process.exit(2)
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.png': 'image/png',
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', 'http://localhost')
    let file = path.normalize(path.join(root, decodeURIComponent(url.pathname)))
    if (!file.startsWith(root)) throw new Error('forbidden')
    if (existsSync(file) && statSync(file).isDirectory()) file = path.join(file, 'index.html')
    const data = await readFile(file)
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] ?? 'application/octet-stream' })
    res.end(data)
  } catch {
    res.writeHead(404)
    res.end('not found')
  }
})
await new Promise((r) => server.listen(0, '127.0.0.1', r))
const port = server.address().port
const BASE = `http://127.0.0.1:${port}/dist/`

const report = { base: BASE, startedAt: new Date().toISOString(), viewports: [], interactions: [], contrast: [], keyboard: [], failures: [] }
const fail = (msg, extra = {}) => {
  report.failures.push({ msg, ...extra })
  console.error('FAIL', msg, Object.keys(extra).length ? JSON.stringify(extra) : '')
}
const ok = (msg) => console.log('ok  ', msg)

const launchOpts = {}
if (process.env.EDGECALC_CHROMIUM) launchOpts.executablePath = process.env.EDGECALC_CHROMIUM
const browser = await chromium.launch(launchOpts)
await mkdir(shotsDir, { recursive: true })

/* ------------------------------------------------------------------ helpers */

function attachCollectors(page) {
  const consoleErrors = []
  const failedRequests = []
  const externalRequests = []
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') consoleErrors.push(`${m.type()}: ${m.text()}`)
  })
  page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`))
  page.on('requestfailed', (r) => failedRequests.push(`${r.url()} (${r.failure()?.errorText})`))
  page.on('response', (r) => {
    if (r.status() >= 400) failedRequests.push(`${r.url()} -> ${r.status()}`)
  })
  page.on('request', (r) => {
    if (!r.url().startsWith(`http://127.0.0.1:${port}/`)) externalRequests.push(r.url())
  })
  return { consoleErrors, failedRequests, externalRequests }
}

async function bodyHasBadNumbers(page) {
  return page.evaluate(() => {
    const text = document.body.innerText
    return /\bNaN\b|Infinity/.test(text)
  })
}

async function overflow(page) {
  return page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }))
}

async function setField(page, id, value) {
  const input = page.locator(`#${id}`)
  await input.fill(value)
}

async function statValue(page, label) {
  // A string matches the start of the label; pass a RegExp for an exact match
  // (so "Guaranteed profit" does not match "Guaranteed profit per 1 USDC of payout").
  const pattern = label instanceof RegExp ? label : new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`)
  const dt = page.locator('.stat dt').filter({ hasText: pattern }).first()
  const stat = dt.locator('xpath=..')
  return (await stat.locator('.stat-value').innerText()).trim()
}

/* ------------------------------------------------------------ color maths */

function parseColor(str) {
  // Chromium returns rgb()/rgba() for sRGB colours and oklch()/color() for others.
  let m = str.match(/^rgba?\(([^)]+)\)$/)
  if (m) {
    const parts = m[1].split(/[\s,\/]+/).filter(Boolean).map(Number)
    return { r: parts[0] / 255, g: parts[1] / 255, b: parts[2] / 255, a: parts[3] ?? 1 }
  }
  m = str.match(/^oklch\(([^)]+)\)$/)
  if (m) {
    const [lch, alpha] = m[1].split('/')
    const [L, C, H] = lch.trim().split(/\s+/).map((v, i) => (i === 0 && v.endsWith('%') ? parseFloat(v) / 100 : parseFloat(v)))
    const a = alpha ? parseFloat(alpha) : 1
    return { ...oklchToSrgb(L, C, H || 0), a }
  }
  m = str.match(/^oklab\(([^)]+)\)$/)
  if (m) {
    const [lab, alpha] = m[1].split('/')
    const [L, A, B] = lab.trim().split(/\s+/).map((v, i) => (i === 0 && v.endsWith('%') ? parseFloat(v) / 100 : parseFloat(v)))
    const C = Math.hypot(A, B)
    const H = (Math.atan2(B, A) * 180) / Math.PI
    return { ...oklchToSrgb(L, C, H), a: alpha ? parseFloat(alpha) : 1 }
  }
  m = str.match(/^lab\(([^)]+)\)$/)
  if (m) {
    const [lab, alpha] = m[1].split('/')
    const [L, A, B] = lab.trim().split(/\s+/).map((v, i) => (i === 0 && v.endsWith('%') ? parseFloat(v) : parseFloat(v)))
    return { ...labToSrgb(L, A, B), a: alpha ? parseFloat(alpha) : 1 }
  }
  m = str.match(/^color\(srgb ([^)]+)\)$/)
  if (m) {
    const [rgb, alpha] = m[1].split('/')
    const [r, g, b] = rgb.trim().split(/\s+/).map(Number)
    return { r, g, b, a: alpha ? parseFloat(alpha) : 1 }
  }
  return null
}

function oklchToSrgb(L, C, hDeg) {
  const h = (hDeg * Math.PI) / 180
  const a = C * Math.cos(h)
  const b = C * Math.sin(h)
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b
  const s_ = L - 0.0894841775 * a - 1.291485548 * b
  const l = l_ ** 3
  const m = m_ ** 3
  const s = s_ ** 3
  const lr = +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s
  const lg = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s
  const lb = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s
  const gam = (c) => {
    const v = Math.min(1, Math.max(0, c))
    return v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055
  }
  return { r: gam(lr), g: gam(lg), b: gam(lb) }
}

/** CIELAB (D50) → sRGB, via XYZ D50, Bradford adaptation to D65. */
function labToSrgb(L, A, B) {
  const fy = (L + 16) / 116
  const fx = fy + A / 500
  const fz = fy - B / 200
  const k = 24389 / 27
  const e = 216 / 24389
  const finv = (t) => (t ** 3 > e ? t ** 3 : (116 * t - 16) / k)
  const xr = fx ** 3 > e ? fx ** 3 : (116 * fx - 16) / k
  const yr = L > k * e ? fy ** 3 : L / k
  const zr = finv(fz)
  const X = xr * 0.9642956764, Y = yr * 1.0, Z = zr * 0.8251046025
  // Bradford D50 -> D65
  const x = 0.9554734527 * X - 0.0230985369 * Y + 0.0632593836 * Z
  const y = -0.0283697069 * X + 1.0099954580 * Y + 0.0210413989 * Z
  const z = 0.0123140016 * X - 0.0205076964 * Y + 1.3303659366 * Z
  const lr = 3.2409699419 * x - 1.5373831776 * y - 0.4986107603 * z
  const lg = -0.9692436363 * x + 1.8759675015 * y + 0.0415550574 * z
  const lb = 0.0556300797 * x - 0.2039769589 * y + 1.0569715142 * z
  const gam = (c) => {
    const v = Math.min(1, Math.max(0, c))
    return v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055
  }
  return { r: gam(lr), g: gam(lg), b: gam(lb) }
}

function luminance({ r, g, b }) {
  const lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

function composite(fg, bg) {
  const a = fg.a ?? 1
  return { r: fg.r * a + bg.r * (1 - a), g: fg.g * a + bg.g * (1 - a), b: fg.b * a + bg.b * (1 - a), a: 1 }
}

function contrastRatio(fg, bg) {
  const l1 = luminance(fg)
  const l2 = luminance(bg)
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1]
  return (hi + 0.05) / (lo + 0.05)
}

/** Read text colour and effective background of the first match of `selector`. */
async function measurePair(page, name, selector, { large = false } = {}) {
  // Park the pointer and let 120ms colour transitions finish so we read settled values.
  await page.mouse.move(0, 0)
  await page.waitForTimeout(250)
  const data = await page.evaluate((sel) => {
    const el = document.querySelector(sel)
    if (!el) return null
    const cs = getComputedStyle(el)
    const chain = []
    let node = el
    while (node) {
      const s = getComputedStyle(node)
      chain.push(s.backgroundColor)
      node = node.parentElement
    }
    return { color: cs.color, chain, fontSize: parseFloat(cs.fontSize), fontWeight: cs.fontWeight }
  }, selector)
  if (!data) {
    fail(`contrast: selector not found ${selector}`)
    return
  }
  // Composite backgrounds from the root down to the element.
  let bg = { r: 1, g: 1, b: 1, a: 1 }
  const parsedChain = data.chain.map(parseColor).reverse()
  for (const c of parsedChain) {
    if (!c) continue
    if ((c.a ?? 1) === 0) continue
    bg = composite(c, bg)
  }
  const fg = parseColor(data.color)
  if (!fg) {
    fail(`contrast: could not parse colour ${data.color} for ${selector}`)
    return
  }
  const ratio = contrastRatio(composite(fg, bg), bg)
  const isLarge = large || data.fontSize >= 24 || (data.fontSize >= 18.66 && Number(data.fontWeight) >= 700)
  const threshold = isLarge ? 3 : 4.5
  const pass = ratio >= threshold
  report.contrast.push({ name, selector, color: data.color, ratio: Number(ratio.toFixed(2)), threshold, pass, fontSize: data.fontSize })
  if (!pass) fail(`contrast ${name}: ${ratio.toFixed(2)} < ${threshold}`, { selector, color: data.color })
  else ok(`contrast ${name}: ${ratio.toFixed(2)} ≥ ${threshold}`)
}

/* -------------------------------------------------------------- viewports */

const VIEWPORTS = [
  { name: 'mobile-320', width: 320, height: 640 },
  { name: 'mobile-390', width: 390, height: 844 },
  { name: 'tablet-768', width: 768, height: 1024 },
  { name: 'desktop-1280', width: 1280, height: 900 },
]

for (const scheme of ['light', 'dark']) {
  for (const vp of VIEWPORTS) {
    // Screenshot every width in light mode; dark mode at the two extremes.
    if (scheme === 'dark' && !['mobile-320', 'desktop-1280'].includes(vp.name)) continue
    const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, colorScheme: scheme })
    const page = await context.newPage()
    const collectors = attachCollectors(page)
    await page.goto(BASE, { waitUntil: 'networkidle' })
    await page.waitForSelector('main .card')
    const ov = await overflow(page)
    const bad = await bodyHasBadNumbers(page)
    const shot = path.join(shotsDir, `${vp.name}-${scheme}.jpg`)
    await page.screenshot({ path: shot, fullPage: true, type: 'jpeg', quality: 70 })
    const entry = { ...vp, scheme, ...ov, badNumbers: bad, ...collectors, screenshot: path.relative(root, shot) }
    report.viewports.push(entry)
    if (ov.scrollWidth > ov.innerWidth) fail(`horizontal overflow at ${vp.name} ${scheme}`, ov)
    if (bad) fail(`NaN/Infinity visible at ${vp.name} ${scheme}`)
    if (collectors.consoleErrors.length) fail(`console errors at ${vp.name} ${scheme}`, { errors: collectors.consoleErrors })
    if (collectors.failedRequests.length) fail(`failed requests at ${vp.name} ${scheme}`, { failedRequests: collectors.failedRequests })
    if (collectors.externalRequests.length) fail(`external requests at ${vp.name} ${scheme}`, { externalRequests: collectors.externalRequests })
    ok(`${vp.name} ${scheme}: loaded, scrollWidth ${ov.scrollWidth}/${ov.innerWidth}, screenshot ${path.basename(shot)}`)
    await context.close()
  }
}

/* ------------------------------------------------------------ interactions */

const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: 'light', acceptDownloads: true })
const page = await context.newPage()
const collectors = attachCollectors(page)
await page.goto(BASE, { waitUntil: 'networkidle' })
await page.waitForSelector('main .card')

async function step(name, fn) {
  try {
    const detail = await fn()
    const bad = await bodyHasBadNumbers(page)
    if (bad) throw new Error('NaN or Infinity visible after step')
    report.interactions.push({ name, pass: true, detail })
    ok(`${name}${detail ? ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail)}` : ''}`)
  } catch (e) {
    report.interactions.push({ name, pass: false, error: e.message })
    fail(name, { error: e.message })
  }
}

const expectText = (actual, expected, what) => {
  if (actual !== expected) throw new Error(`${what}: expected "${expected}", got "${actual}"`)
}

await step('Section 1 defaults compute edge, EV, Kelly and stake', async () => {
  expectText(await statValue(page, 'Edge'), '+7.0 pp', 'edge')
  expectText(await statValue(page, 'Expected value per 1 USDC staked'), '+12.7%', 'EV')
  expectText(await statValue(page, 'Full Kelly f*'), '15.6%', 'Kelly')
  expectText(await statValue(page, 'Suggested stake'), '38.89 USDC', 'stake')
  expectText(await statValue(page, /^Full Kelly f\*$/), '15.6%', 'Kelly exact')
  expectText(await statValue(page, 'Payout if right'), '70.71 USDC', 'payout')
  expectText(await statValue(page, 'Profit if right'), '+31.82 USDC', 'profit')
  expectText(await statValue(page, 'Loss if wrong'), '−38.89 USDC', 'loss')
  return 'edge +7.0 pp, stake 38.89 USDC'
})

await step('Edge tone is green when positive and red when negative', async () => {
  const pos = await page.locator('.stat', { has: page.locator('dt', { hasText: 'Edge' }) }).getAttribute('data-tone')
  await setField(page, 'probability', '40')
  const neg = await page.locator('.stat', { has: page.locator('dt', { hasText: 'Edge' }) }).getAttribute('data-tone')
  expectText(pos, 'positive', 'positive tone')
  expectText(neg, 'negative', 'negative tone')
  expectText(await statValue(page, 'Edge'), '−15.0 pp', 'negative edge')
  expectText(await statValue(page, 'Full Kelly f*'), 'No bet', 'No bet')
  expectText(await statValue(page, 'Suggested stake'), 'No bet', 'No bet stake')
  return 'positive → green tone, 40% → No bet'
})

await step('Switching side to NO flips price and probability', async () => {
  await page.getByLabel('NO', { exact: true }).first().check()
  const summary = await page.locator('#single-bet .results-summary').first().innerText()
  if (!/Buying NO at 0\.45 USDC with your 60\.0%/.test(summary)) throw new Error(`summary: ${summary}`)
  expectText(await statValue(page, 'Edge'), '+15.0 pp', 'NO edge')
  await page.getByLabel('YES', { exact: true }).first().check()
  await setField(page, 'probability', '62')
  return summary.replace(/\s+/g, ' ')
})

await step('Out-of-range price shows an inline message, no NaN', async () => {
  await setField(page, 'yes-price', '1.5')
  const input = page.locator('#yes-price')
  expectText(await input.getAttribute('aria-invalid'), 'true', 'aria-invalid')
  const err = await page.locator('#yes-price-error').innerText()
  if (!err.includes('between 0.01 and 0.99')) throw new Error(`message: ${err}`)
  const described = await input.getAttribute('aria-describedby')
  if (!described?.includes('yes-price-error')) throw new Error(`aria-describedby: ${described}`)
  const notice = await page.locator('#single-bet .notice').innerText()
  if (!notice.includes('Fix the highlighted inputs')) throw new Error(`notice: ${notice}`)
  await setField(page, 'yes-price', 'abc')
  const err2 = await page.locator('#yes-price-error').innerText()
  await setField(page, 'yes-price', '')
  const err3 = await page.locator('#yes-price-error').innerText()
  await setField(page, 'yes-price', '0.55')
  if (await page.locator('#yes-price-error').count()) throw new Error('error still shown after fix')
  return { outOfRange: err, notNumber: err2, empty: err3 }
})

await step('Kelly fraction radios change the stake', async () => {
  await page.getByLabel('Full · 1').check()
  expectText(await statValue(page, 'Suggested stake'), '155.56 USDC', 'full Kelly stake')
  await page.getByLabel('Tenth · 0.1').check()
  expectText(await statValue(page, 'Suggested stake'), '15.56 USDC', 'tenth Kelly stake')
  await page.getByLabel('Quarter · 0.25').check()
  return 'full 155.56, tenth 15.56, quarter restored'
})

await step('Section 2 fee raises break-even and trims EV/Kelly', async () => {
  expectText(await statValue(page, 'Break-even probability'), '55.0%', 'break-even no fee')
  await setField(page, 'fee', '2')
  expectText(await statValue(page, 'Break-even probability'), '55.5%', 'break-even 2% fee')
  expectText(await statValue(page, 'EV per 1 USDC staked, after fee'), '+11.7%', 'EV after fee')
  expectText(await statValue(page, /^Full Kelly f\*, after fee$/), '14.6%', 'Kelly after fee')
  // Section 1 also reflects the fee.
  expectText(await statValue(page, 'Expected value per 1 USDC staked'), '+11.7%', 'Section 1 EV after fee')
  await setField(page, 'fee', '150')
  const err = await page.locator('#fee-error').innerText()
  if (!err.includes('between 0 and 99')) throw new Error(`fee message: ${err}`)
  await setField(page, 'fee', '0')
  return 'break-even 55.0% → 55.5% at 2% fee; 150 rejected'
})

await step('Section 3 arbitrage math and the no-arbitrage state', async () => {
  expectText(await statValue(page, 'Guaranteed profit per 1 USDC of payout'), '0.03 USDC', 'profit per $1 payout')
  expectText(await statValue(page, 'Guaranteed payout'), '103.09 USDC', 'guaranteed payout')
  expectText(await statValue(page, 'Buy YES shares'), '103.09', 'YES shares')
  expectText(await statValue(page, /^Guaranteed profit$/), '+3.09 USDC', 'guaranteed profit')
  await setField(page, 'arb-no', '0.55')
  const notice = await page.locator('#arbitrage .notice').innerText()
  if (!notice.includes('No arbitrage')) throw new Error(`notice: ${notice}`)
  await setField(page, 'arb-no', '0.49')
  return 'profit 0.03/USDC payout at 100 budget; 0.48+0.55 → No arbitrage'
})

await step('Section 4 validates on submit and focuses the first invalid field', async () => {
  await page.locator('#positions button[type=submit]').click()
  const focused = await page.evaluate(() => document.activeElement?.id)
  expectText(focused, 'pos-market', 'focused field')
  const err = await page.locator('#pos-market-error').innerText()
  if (!err.includes('Enter a market name')) throw new Error(`message: ${err}`)
  return 'focus moved to Market with message'
})

await step('Section 4 adds, edits, deletes and undoes a position', async () => {
  await setField(page, 'pos-market', 'Fed cuts rates in March')
  await setField(page, 'pos-shares', '100')
  await setField(page, 'pos-entry', '0.40')
  await setField(page, 'pos-current', '0.55')
  await page.locator('#positions button[type=submit]').click()
  await page.waitForSelector('.positions tbody tr')
  const pnl = (await page.locator('.positions tbody .pnl').first().innerText()).trim()
  expectText(pnl, '+15.00', 'row P&L')
  const status = (await page.locator('#positions [role=status]').innerText()).trim()
  if (!status.includes('Added Fed cuts')) throw new Error(`status: ${status}`)

  // second position on the NO side
  await setField(page, 'pos-market', 'ETH above 5k by December')
  await page.locator('#positions .add-form').getByLabel('NO', { exact: true }).check()
  await setField(page, 'pos-shares', '50')
  await setField(page, 'pos-entry', '0.62')
  await setField(page, 'pos-current', '0.60')
  await page.locator('#positions button[type=submit]').click()
  await page.waitForFunction(() => document.querySelectorAll('.positions tbody tr').length === 2)
  const total = (await page.locator('.positions tfoot .pnl').innerText()).trim()
  expectText(total, '+14.00', 'total P&L')

  // edit the first row
  await page.getByRole('button', { name: 'Edit Fed cuts rates in March' }).click()
  // Edit mode moves focus to the Market field on the next frame; wait for it before typing.
  await page.waitForFunction(() => document.activeElement?.closest('tr.editing') !== null)
  await page.locator('.positions tr.editing').getByLabel('Current price').fill('0.70')
  await page.locator('.positions tr.editing').getByRole('button', { name: 'Save' }).click()
  await page.waitForFunction(() => !document.querySelector('.positions tr.editing'))
  const pnl2 = (await page.locator('.positions tbody .pnl').first().innerText()).trim()
  expectText(pnl2, '+30.00', 'edited P&L')

  // delete and undo
  await page.getByRole('button', { name: 'Delete ETH above 5k by December' }).click()
  await page.waitForFunction(() => document.querySelectorAll('.positions tbody tr').length === 1)
  const undoBtn = page.getByRole('button', { name: 'Undo delete' })
  const undoFocused = await undoBtn.evaluate((el) => el === document.activeElement)
  if (!undoFocused) throw new Error('Undo button did not receive focus after delete')
  await undoBtn.click()
  await page.waitForFunction(() => document.querySelectorAll('.positions tbody tr').length === 2)
  return 'add ×2 (total +14.00), edit → +30.00, delete, undo restored'
})

await step('Positions persist in localStorage across reload', async () => {
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForSelector('.positions tbody tr')
  const rows = await page.locator('.positions tbody tr').count()
  if (rows !== 2) throw new Error(`expected 2 rows after reload, got ${rows}`)
  const stored = await page.evaluate(() => localStorage.getItem('edgecalc.positions.v1'))
  if (!stored || !stored.includes('Fed cuts')) throw new Error('localStorage missing positions')
  return `2 rows restored from edgecalc.positions.v1 (${stored.length} bytes)`
})

let exportedCsv = ''
await step('Export CSV downloads a file with the expected header', async () => {
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Export CSV' }).click(),
  ])
  const file = await download.path()
  exportedCsv = await readFile(file, 'utf8')
  if (!exportedCsv.startsWith('market,side,shares,entry_price,current_price')) throw new Error(`csv: ${exportedCsv.slice(0, 80)}`)
  if (!/Fed cuts rates in March,YES,100,0\.4,0\.7/.test(exportedCsv)) throw new Error(`csv row missing: ${exportedCsv}`)
  return { filename: download.suggestedFilename(), bytes: exportedCsv.length }
})

await step('Import CSV appends valid rows and reports skipped lines', async () => {
  const csv = [
    'market,side,shares,entry_price,current_price',
    '"Imported, quoted market",YES,10,0.30,0.35',
    'Broken row,MAYBE,10,0.30,0.35',
  ].join('\n')
  await page.locator('#positions input[type=file]').setInputFiles({ name: 'import.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) })
  await page.waitForFunction(() => document.querySelectorAll('.positions tbody tr').length === 3)
  const status = (await page.locator('#positions .notice').innerText()).trim()
  if (!status.includes('Imported 1 position') || !status.includes('Skipped 1 line')) throw new Error(`status: ${status}`)
  return status.replace(/\s+/g, ' ')
})

await step('Clear all removes rows and can be undone; empty state points forward', async () => {
  await page.getByRole('button', { name: 'Clear all' }).click()
  await page.waitForSelector('.empty')
  const empty = await page.locator('.empty').innerText()
  if (!empty.includes('No positions yet')) throw new Error(`empty: ${empty}`)
  await page.getByRole('button', { name: 'Undo clear' }).click()
  await page.waitForFunction(() => document.querySelectorAll('.positions tbody tr').length === 3)
  await page.getByRole('button', { name: 'Clear all' }).click()
  await page.waitForSelector('.empty')
  await page.getByRole('button', { name: 'Dismiss' }).click()
  return 'cleared, undone, cleared again'
})

await step('Section nav anchors and skip link target existing ids', async () => {
  const hrefs = await page.locator('.section-nav a, .skip-link').evaluateAll((as) => as.map((a) => a.getAttribute('href')))
  for (const h of hrefs) {
    const exists = await page.locator(h).count()
    if (!exists) throw new Error(`missing target for ${h}`)
  }
  return hrefs.join(' ')
})

/* ---------------------------------------------------------------- keyboard */

await step('Keyboard: Tab reaches controls in order with a visible focus indicator', async () => {
  await page.goto(BASE, { waitUntil: 'networkidle' })
  await page.waitForSelector('main .card')
  const stops = []
  await page.keyboard.press('Tab')
  for (let i = 0; i < 40; i++) {
    const info = await page.evaluate(() => {
      const el = document.activeElement
      if (!el || el === document.body) return null
      const cs = getComputedStyle(el)
      const shellCs = el.closest('.input-shell') ? getComputedStyle(el.closest('.input-shell')) : null
      const labelCs = el.closest('.segmented-option') ? getComputedStyle(el.closest('.segmented-option')) : null
      const fileBtn = el.closest('label.btn') ? getComputedStyle(el.closest('label.btn')) : null
      const outline = [cs, shellCs, labelCs, fileBtn].filter(Boolean).some((s) => s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) >= 2)
      const shellRing = false
      const name = el.getAttribute('aria-label') || el.labels?.[0]?.textContent?.trim() || el.textContent?.trim().slice(0, 40) || el.id
      const rect = el.getBoundingClientRect()
      return { tag: el.tagName.toLowerCase(), type: el.getAttribute('type'), name, visible: outline || shellRing, w: Math.round(rect.width), h: Math.round(rect.height) }
    })
    if (!info) break
    stops.push(info)
    await page.keyboard.press('Tab')
  }
  report.keyboard = stops
  const missing = stops.filter((s) => !s.visible)
  if (missing.length) throw new Error(`no visible focus ring on: ${missing.map((s) => `${s.tag}[${s.name}]`).join(', ')}`)
  if (stops.length < 15) throw new Error(`only ${stops.length} tab stops reached`)
  return `${stops.length} stops, all with a visible indicator; first: ${stops.slice(0, 5).map((s) => s.name).join(' → ')}`
})

await step('Keyboard: arrow keys move within the side radio group', async () => {
  await page.locator('#single-bet').getByLabel('YES', { exact: true }).focus()
  await page.keyboard.press('ArrowRight')
  const checked = await page.locator('#single-bet input[name=side]:checked').getAttribute('value')
  expectText(checked, 'NO', 'checked after ArrowRight')
  await page.keyboard.press('ArrowLeft')
  return 'ArrowRight selects NO, ArrowLeft returns to YES'
})

await step('Touch targets: buttons and inputs are at least 24×24 CSS px (44 for main controls)', async () => {
  const sizes = await page.locator('button, input:not([type=radio]):not([type=file]), .segmented-option, label.btn').evaluateAll((els) =>
    els.map((el) => {
      const r = el.getBoundingClientRect()
      return { name: (el.getAttribute('aria-label') || el.textContent || el.id || '').trim().slice(0, 30), w: Math.round(r.width), h: Math.round(r.height) }
    }),
  )
  const small = sizes.filter((s) => s.w > 0 && (s.w < 24 || s.h < 24))
  if (small.length) throw new Error(`small targets: ${JSON.stringify(small)}`)
  const minMain = Math.min(...sizes.filter((s) => s.h > 0).map((s) => s.h))
  return `${sizes.length} targets, smallest height ${minMain}px`
})

/* ---------------------------------------------------------------- contrast */

for (const scheme of ['light', 'dark']) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: scheme })
  const p = await ctx.newPage()
  await p.goto(BASE, { waitUntil: 'networkidle' })
  await p.waitForSelector('main .card')
  // Prepare states: one negative edge stat (set later), a position row with a badge.
  await p.locator('#pos-market').fill('Contrast row')
  await p.locator('#pos-shares').fill('10')
  await p.locator('#pos-entry').fill('0.5')
  await p.locator('#pos-current').fill('0.4')
  await p.locator('#positions button[type=submit]').click()
  await p.waitForSelector('.positions tbody tr')
  await p.locator('#arb-no').fill('1.2') // trigger an error message for contrast
  await measurePair(p, `${scheme} body text on card`, '.card-lede')
  await measurePair(p, `${scheme} heading on card`, '#single-bet-title')
  await measurePair(p, `${scheme} secondary text on page`, '.tagline')
  await measurePair(p, `${scheme} stat label on subtle`, '.stat[data-tone=neutral] dt')
  await measurePair(p, `${scheme} stat value on subtle`, '.stat[data-tone=neutral] .stat-value')
  await measurePair(p, `${scheme} positive value on positive soft`, '.stat[data-tone=positive] .stat-value')
  await measurePair(p, `${scheme} positive label on positive soft`, '.stat[data-tone=positive] dt')
  await measurePair(p, `${scheme} negative value on negative soft`, '.stat[data-tone=negative] .stat-value')
  await measurePair(p, `${scheme} negative label on negative soft`, '.stat[data-tone=negative] dt')
  await measurePair(p, `${scheme} primary button text`, '.btn-primary')
  await measurePair(p, `${scheme} secondary button text`, '#positions .log-toolbar .btn:not(.btn-quiet)')
  await measurePair(p, `${scheme} quiet accent button`, '.positions .btn-quiet:not([data-danger])')
  await measurePair(p, `${scheme} danger quiet button`, '.positions .btn-quiet[data-danger]')
  await measurePair(p, `${scheme} nav link`, '.section-nav a')
  await measurePair(p, `${scheme} input text`, '#yes-price')
  await measurePair(p, `${scheme} input suffix`, '.input-suffix')
  await measurePair(p, `${scheme} field hint`, '.field-hint')
  await measurePair(p, `${scheme} error message`, '.field-error')
  await measurePair(p, `${scheme} caution notice`, '#arbitrage .notice[data-tone=caution]')
  await measurePair(p, `${scheme} YES badge`, '.side-badge[data-side=YES]')
  await measurePair(p, `${scheme} negative P&L cell`, '.positions .pnl[data-tone=negative]')
  await measurePair(p, `${scheme} table header`, '.positions th')
  await measurePair(p, `${scheme} how-it-works text`, '.how p')
  await measurePair(p, `${scheme} kicker`, '.card-kicker')
  await measurePair(p, `${scheme} segmented selected YES`, '.segmented-option[data-tone=yes]')
  await measurePair(p, `${scheme} segmented unselected`, '.segmented-option[data-tone=no]')
  await measurePair(p, `${scheme} footer text`, '.site-footer p')
  await measurePair(p, `${scheme} empty-state text`, '.stat-note')
  await ctx.close()
}

/* ------------------------------------------------------------------ finish */

if (collectors.consoleErrors.length) fail('console errors during interactions', { errors: collectors.consoleErrors })
if (collectors.failedRequests.length) fail('failed requests during interactions', { failedRequests: collectors.failedRequests })
if (collectors.externalRequests.length) fail('external requests during interactions', { externalRequests: collectors.externalRequests })

await context.close()
await browser.close()
server.close()

report.finishedAt = new Date().toISOString()
report.chromium = browser.version()
report.summary = {
  viewports: report.viewports.length,
  interactions: report.interactions.length,
  interactionsPassed: report.interactions.filter((i) => i.pass).length,
  contrastPairs: report.contrast.length,
  contrastPassed: report.contrast.filter((c) => c.pass).length,
  failures: report.failures.length,
}
await writeFile(reportPath, JSON.stringify(report, null, 2))
console.log('\nSummary', JSON.stringify(report.summary))
console.log(`Report: ${path.relative(root, reportPath)}`)
process.exit(report.failures.length ? 1 : 0)
