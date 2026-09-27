import { Arbitrage } from './sections/Arbitrage'
import { Fees } from './sections/Fees'
import { useBetInputs } from './sections/model'
import { PositionLog } from './sections/PositionLog'
import { SingleBet } from './sections/SingleBet'

const NAV = [
  { href: '#single-bet', label: 'Single bet' },
  { href: '#break-even', label: 'Break-even and fees' },
  { href: '#arbitrage', label: 'Arbitrage' },
  { href: '#positions', label: 'Position log' },
]

export default function App() {
  const bet = useBetInputs()
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="site-header">
        <div className="container">
          <div className="brand">
            <h1 className="brand-name">
              <svg className="brand-mark" viewBox="0 0 32 32" aria-hidden="true" focusable="false">
                <path
                  d="M8 22 L14 14 L18 18 L24 10"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              EdgeCalc
            </h1>
            <p className="tagline">
              Edge, expected value, Kelly sizing, fees and arbitrage for YES/NO prediction markets. Runs entirely in
              your browser.
            </p>
          </div>
          <nav className="section-nav" aria-label="Sections">
            <ul>
              {NAV.map((item) => (
                <li key={item.href}>
                  <a href={item.href}>{item.label}</a>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </header>

      <main id="main" className="container" tabIndex={-1}>
        <SingleBet inputs={bet.inputs} update={bet.update} results={bet.results} />
        <Fees inputs={bet.inputs} update={bet.update} results={bet.results} />
        <Arbitrage />
        <PositionLog />
      </main>

      <footer className="site-footer">
        <div className="container">
          <p>
            EdgeCalc makes no network requests after loading, sets no cookies and collects no analytics. Positions
            you log are stored only in this browser.
          </p>
          <p>Prices are USDC per share on a 0–1 scale, as on Polymarket-style markets. Not financial advice.</p>
        </div>
      </footer>
    </>
  )
}
