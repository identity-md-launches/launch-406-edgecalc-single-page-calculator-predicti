# EdgeCalc

A single-page calculator for prediction-market traders who buy YES/NO shares
priced 0–1 USDC (Polymarket style). It is pure client-side: no backend, no
wallet, no external requests after load, no cookies and no analytics. It works
offline once loaded, fits phones, and follows the system light/dark setting.

Sections:

1. **Single bet**: side (YES/NO), market YES price, your probability, bankroll
   and Kelly fraction (1, 0.5, 0.25 default, 0.1). Live edge, expected value per
   1 USDC staked, full Kelly `f*` (or "No bet"), suggested stake and shares,
   payout, profit and loss.
2. **Break-even and fees**: a fee on winnings (default 0) that raises the
   break-even probability and adjusts the EV, Kelly and profit figures in
   Section 1.
3. **Arbitrage check**: YES and NO prices on one market plus a budget. When
   YES + NO < 1 it shows the guaranteed profit per 1 USDC of payout and how many
   shares of each side to buy; otherwise it says no arbitrage exists.
4. **Position log**: add, edit and delete positions (market, side, shares, entry
   and current price) with unrealised P&L per row and in total. Rows are saved in
   the browser's localStorage and can be exported and imported as CSV. Delete,
   clear and import can be undone.

Every input is validated with an inline message; money is rounded to 2 decimals
and probabilities to 1; `NaN`/`Infinity` can never render. Each section ends
with a short "How it works" note.

## Stack

Vite 8, React 19, TypeScript 5.9, plain CSS with `oklch()` design tokens
(`src/styles/tokens.css`). Unit tests use Vitest; browser checks use Playwright.
The design system is documented in [DESIGN.md](DESIGN.md).

```
src/lib/          pure math, formatting, validation, CSV and storage (+ tests)
src/components/   Field, Segmented, Stat, Section, Notice
src/sections/     SingleBet, Fees, Arbitrage, PositionLog, shared model
src/styles/       tokens.css (colour/type/space tokens), app.css (layout, components)
scripts/          browser-check.mjs (bounded Playwright verification of dist/)
dist/             committed production export (relative asset URLs)
```

## Install

Requires Node 20+ (built with Node 24.9 and npm 11.6).

```sh
npm ci
```

## Preview

Serve the source with hot reload:

```sh
npm run dev
```

Serve the committed production export:

```sh
npm run preview          # Vite's static preview of dist/
# or any static server, e.g.
python3 -m http.server 8080 -d dist
```

## Rebuild

```sh
npm run typecheck        # tsc --noEmit for src/ and the config files
npm test                 # vitest: 61 unit tests for the math, formatting, validation, CSV and storage
npm run build            # vite build -> dist/ (base './')
npm run check:browser    # Playwright: viewports, interactions, keyboard, contrast; writes artifacts/
npm run check            # all of the above in order
```

`npm run check:browser` needs a Chromium. Install one with
`npx playwright install chromium`, or point at an existing binary with
`EDGECALC_CHROMIUM=/path/to/chrome`. The script starts its own local server on
an ephemeral port, inspects `dist/` under a `/dist/` subpath, saves screenshots
to `artifacts/screenshots/` and a report to `artifacts/browser-check.json`, then
exits; nothing keeps running.

Rebuild `dist/` and commit it after every source change. The publisher serves
the committed export and does not rebuild.

## Publish

`dist/` is a self-contained static site: `index.html`, `favicon.svg` and
`assets/` (one JS and one CSS file) referenced with `./` relative URLs. Upload
the folder as-is to any static host, an IPFS gateway subpath, an ENS content
hash or a plain web server directory. No server-side routing, environment
variables or rewrites are needed. Because there are no external requests, a
strict `Content-Security-Policy` such as
`default-src 'self'; style-src 'self' 'unsafe-inline'` is compatible.

## Validation record

Commands run on 2026-09-27 against the final source, on Linux with Node 24.9:

| Command | Result |
| --- | --- |
| `npm run typecheck` | passed, no output (both tsconfig projects) |
| `npm test` | 4 files, 61 tests passed |
| `npm run build` | `dist/index.html` 0.98 kB, `assets/index-*.css` 19.29 kB, `assets/index-*.js` 252.76 kB (78.11 kB gzip) |
| `npm run check:browser` | 6 viewport loads, 17 interaction steps and 56 contrast pairs passed, 0 failures (Chromium 154 via Playwright 1.63) |

Browser coverage: 320, 390, 768 and 1280 px widths; light and dark colour
schemes; no console errors, failed or external requests, horizontal overflow or
`NaN`/`Infinity` text; live calculation for every section including the fee and
no-arbitrage states; inline validation and focus on the first invalid field;
add, edit, delete, undo, clear, localStorage reload, CSV export (download
content checked) and CSV import with a skipped bad row; Tab order with a visible
focus ring on all 21 stops; arrow keys inside the radio group; target sizes;
computed-style contrast for 28 text/background pairs per theme.

Limitations: screen-reader sessions, physical touch devices, browser-native
200% zoom, forced-colors mode and the RTL mirror were not tested; the checks
run in Chromium only. Details, findings and screenshots are in
`artifacts/validation.md`, `artifacts/browser-check.json` and
`artifacts/screenshots/`.

## Formulas

With `p` = your probability that the side you buy wins, `price` = that side's
share price, `fee` = fee rate on winnings:

- Edge = `p − price` (percentage points).
- Net odds per 1 USDC staked `b = (1 − price)(1 − fee) / price`.
- EV per 1 USDC staked = `p·b − (1 − p)`, which is `p / price − 1` when fee = 0.
- Full Kelly `f* = (p·b − (1 − p)) / b`, which is `(p − price) / (1 − price)`
  when fee = 0; `f* ≤ 0` means "No bet".
- Stake = `bankroll · f* · Kelly fraction`; shares = `stake / price`.
- Break-even probability = `price / (price + (1 − price)(1 − fee))`.
- Buying NO uses `price = 1 − YES price` and `p = 1 − P(YES)`.
- Arbitrage when `YES + NO < 1`: profit per 1 USDC of payout = `1 − (YES + NO)`;
  with budget `B`, buy `B / (YES + NO)` shares of each side.
- Unrealised P&L = `shares × (current − entry)`.

Not financial advice.
