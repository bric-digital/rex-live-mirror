/**
 * Bloomberg homepage parser.
 * Extracts headlines using data-component attributes, and market tickers from
 * embedded JSON data (Bloomberg renders tickers client-side from a script blob).
 * Selectors are config-driven — defaults match the current Bloomberg DOM structure.
 */
import type { HomepageBlurb, HomepageParser, HomepageParserValidation, StockTicker } from './types.js'

export interface BloombergSelectors {
  storyLink?: string
  headline?: string
  summary?: string
  byline?: string
  timestamp?: string
  tickerBarJsonKey?: string
}

export class BloombergHomepageParser implements HomepageParser {
  private selectors: Required<BloombergSelectors>

  constructor(selectors?: BloombergSelectors) {
    this.selectors = {
      storyLink: selectors?.storyLink ?? 'a[data-component="story-link"]',
      headline: selectors?.headline ?? '[data-component="headline"]',
      summary: selectors?.summary ?? '[data-component="summary"]',
      byline: selectors?.byline ?? '[data-component="byline"]',
      timestamp: selectors?.timestamp ?? '[data-component="relative-timestamp"]',
      tickerBarJsonKey: selectors?.tickerBarJsonKey ?? 'tickerBar',
    }
  }

  validateSelectors(): HomepageParserValidation {
    const items = document.querySelectorAll(this.selectors.storyLink)
    return { valid: items.length > 0, itemsFound: items.length }
  }

  extractBlurbs(): HomepageBlurb[] {
    const blurbs: HomepageBlurb[] = []
    const seen = new Set<string>()
    let rank = 0

    document.querySelectorAll(this.selectors.storyLink).forEach((el) => {
      const a = el as HTMLAnchorElement
      const url = a.href
      if (!url || seen.has(url)) return
      seen.add(url)

      const headlineEl = a.querySelector(this.selectors.headline)
      const headline = headlineEl?.textContent?.trim()
      if (!headline) return

      const summaryEl = a.querySelector(this.selectors.summary)
      const summary = summaryEl?.textContent?.trim() || undefined

      const bylineEl = a.querySelector(this.selectors.byline)
      let authors: string[] = []
      if (bylineEl?.textContent) {
        const cleaned = bylineEl.textContent.trim().replace(/^By\s+/i, '')
        authors = cleaned.split(/\s+and\s+|,\s*/).map((s) => s.trim()).filter(Boolean)
      }

      const timestampEl = a.querySelector(this.selectors.timestamp)
      const posted = timestampEl?.textContent?.trim() ?? ''

      const linkIndex = a.getAttribute('data-link-index')
      const effectiveRank = linkIndex !== null ? parseInt(linkIndex, 10) : rank

      blurbs.push({ headline, summary, url, rank: effectiveRank, posted, source: 'bloomberg', authors })
      rank++
    })

    return blurbs
  }

  extractTickers(): StockTicker[] {
    const jsonKey = this.selectors.tickerBarJsonKey
    const tickers: StockTicker[] = []

    // Bloomberg embeds ticker data as JSON in a <script> tag, not as DOM elements.
    // Search all script tags for the tickerBar array.
    const scripts = Array.from(document.querySelectorAll('script'))
    for (const script of scripts) {
      const text = script.textContent ?? ''
      const keyPattern = `"${jsonKey}":[`
      const startIdx = text.indexOf(keyPattern)
      if (startIdx === -1) continue

      // Extract the JSON array starting after the key
      const arrayStart = startIdx + keyPattern.length - 1
      let depth = 0
      let arrayEnd = arrayStart
      for (let i = arrayStart; i < text.length && i < arrayStart + 10000; i++) {
        if (text[i] === '[') depth++
        if (text[i] === ']') depth--
        if (depth === 0) { arrayEnd = i + 1; break }
      }

      try {
        const items = JSON.parse(text.substring(arrayStart, arrayEnd))
        if (!Array.isArray(items)) continue

        for (const item of items) {
          const id = item.id ?? item.ticker ?? ''
          const name = item.name ?? item.longName ?? item.shortName ?? ''
          const price = item.price
          const pctChange = item.percentChange1Day
          const lastYield = item.lastYield

          if (!id || price === undefined || price === null) continue

          const direction = (typeof pctChange === 'number' && pctChange >= 0) ? 'up' as const : 'down' as const

          // For bonds with lastYield, display yield as the price (matches what Bloomberg shows)
          const isYieldInstrument = typeof lastYield === 'number' && lastYield > 0
          const displayPrice = isYieldInstrument ? lastYield : price
          const formattedPrice = typeof displayPrice === 'number'
            ? displayPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })
            : String(displayPrice)

          // Compute absolute change from price and percent: change = price - price / (1 + pct/100)
          let formattedChange = ''
          if (typeof pctChange === 'number' && typeof price === 'number' && pctChange !== 0) {
            const previousPrice = price / (1 + pctChange / 100)
            const absChange = isYieldInstrument && typeof lastYield === 'number'
              ? lastYield - lastYield / (1 + pctChange / 100)
              : price - previousPrice
            formattedChange = `${absChange >= 0 ? '+' : ''}${absChange.toFixed(2)}`
          }

          const formattedChangePercent = typeof pctChange === 'number' ? `${pctChange >= 0 ? '+' : ''}${pctChange.toFixed(2)}%` : ''

          tickers.push({
            symbol: id,
            name: name || undefined,
            price: formattedPrice,
            change: formattedChange,
            changePercent: formattedChangePercent,
            direction,
            url: item.url || `https://www.bloomberg.com/quote/${id}`,
            category: 'market-index',
          })
        }

        break // Found and parsed the tickerBar
      } catch {
        // JSON parse failed, try next script
      }
    }

    return tickers
  }
}
