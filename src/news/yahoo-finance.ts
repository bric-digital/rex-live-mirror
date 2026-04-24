/**
 * Yahoo Finance homepage parser.
 * Extracts headlines, market index tickers (top bar), and trending tickers (sidebar).
 * Selectors are config-driven — defaults match the current Yahoo Finance DOM structure.
 */
import type { HomepageBlurb, HomepageParser, HomepageParserValidation, StockTicker } from './types.js'

export interface YahooFinanceSelectors {
  leadTitle?: string
  storyItem?: string
  storyLink?: string
  storyHeadline?: string
  timestamp?: string
  rankAttribute?: string
  marketIndexContainer?: string
  marketIndexItem?: string
  marketIndexName?: string
  marketIndexPrice?: string
  marketIndexChange?: string
  marketIndexChangePercent?: string
  trendingContainer?: string
  trendingItem?: string
  trendingSymbol?: string
  trendingName?: string
  trendingPrice?: string
  trendingChange?: string
  trendingChangePercent?: string
  tickerBadge?: string
}

export class YahooFinanceHomepageParser implements HomepageParser {
  private selectors: Required<YahooFinanceSelectors>

  constructor(selectors?: YahooFinanceSelectors) {
    this.selectors = {
      leadTitle: selectors?.leadTitle ?? 'h2[data-testid="title"]',
      storyItem: selectors?.storyItem ?? 'section[data-testid="storyitem"]',
      storyLink: selectors?.storyLink ?? 'a.titles, a.titles-link',
      storyHeadline: selectors?.storyHeadline ?? 'h3',
      timestamp: selectors?.timestamp ?? '.publishing',
      rankAttribute: selectors?.rankAttribute ?? 'data-ylk',
      marketIndexContainer: selectors?.marketIndexContainer ?? 'div.indices-list',
      marketIndexItem: selectors?.marketIndexItem ?? 'div.ticker-item[data-testid="ticker-list-item"]',
      marketIndexName: selectors?.marketIndexName ?? 'a.ticker-name span.text',
      marketIndexPrice: selectors?.marketIndexPrice ?? 'fin-streamer[data-field="regularMarketPrice"]',
      marketIndexChange: selectors?.marketIndexChange ?? 'fin-streamer[data-field="regularMarketChange"]',
      marketIndexChangePercent: selectors?.marketIndexChangePercent ?? 'fin-streamer[data-field="regularMarketChangePercent"]',
      trendingContainer: selectors?.trendingContainer ?? '[data-id="trendingTickers"]',
      trendingItem: selectors?.trendingItem ?? 'a[data-testid="ticker-list-item"]',
      trendingSymbol: selectors?.trendingSymbol ?? 'span.symbol',
      trendingName: selectors?.trendingName ?? 'span.longName',
      trendingPrice: selectors?.trendingPrice ?? 'fin-streamer[data-field="regularMarketPrice"]',
      trendingChange: selectors?.trendingChange ?? 'fin-streamer[data-field="regularMarketChange"]',
      trendingChangePercent: selectors?.trendingChangePercent ?? 'fin-streamer[data-field="regularMarketChangePercent"]',
      tickerBadge: selectors?.tickerBadge ?? '.ticker-wrapper a, [data-testid="ticker-badge"]',
    }
  }

  validateSelectors(): HomepageParserValidation {
    const items = document.querySelectorAll(
      `${this.selectors.leadTitle}, ${this.selectors.storyItem}`
    )
    return { valid: items.length > 0, itemsFound: items.length }
  }

  extractBlurbs(): HomepageBlurb[] {
    const blurbs: HomepageBlurb[] = []
    const seen = new Set<string>()

    const leadTitle = document.querySelector(this.selectors.leadTitle)
    if (leadTitle) {
      const leadLink = leadTitle.closest('a') as HTMLAnchorElement | null
      if (leadLink?.href && !seen.has(leadLink.href)) {
        seen.add(leadLink.href)
        const headline = leadTitle.textContent?.trim() ?? ''
        if (headline) {
          const summaryEl = leadLink.querySelector('p')
          const posted = this.extractTimestamp(leadLink.closest('.content, [class*="btmMargin"]'))
          const rank = this.extractRank(leadLink)

          const relatedTickers = this.extractTickerBadges(leadLink.closest('.content, [class*="btmMargin"]') ?? leadLink)
          blurbs.push({
            headline,
            summary: summaryEl?.textContent?.trim() || undefined,
            url: leadLink.href,
            rank: rank ?? 0,
            posted,
            source: 'yahoo-finance',
            authors: [],
            ...(relatedTickers.length > 0 ? { relatedTickers } : {}),
          })
        }
      }
    }

    document.querySelectorAll(this.selectors.storyItem).forEach((section) => {
      const link = section.querySelector(this.selectors.storyLink) as HTMLAnchorElement | null
      if (!link?.href || seen.has(link.href)) return
      seen.add(link.href)

      const h = section.querySelector(this.selectors.storyHeadline)
      const headline = h?.textContent?.trim() ?? link.textContent?.trim() ?? ''
      if (!headline) return

      const posted = this.extractTimestamp(section)
      const rank = this.extractRank(link)

      const relatedTickers = this.extractTickerBadges(section)
      blurbs.push({
        headline,
        url: link.href,
        rank: rank ?? blurbs.length,
        posted,
        source: 'yahoo-finance',
        ...(relatedTickers.length > 0 ? { relatedTickers } : {}),
        authors: [],
      })
    })

    return blurbs
  }

  extractTickers(): StockTicker[] {
    const tickers: StockTicker[] = []

    // US Markets bar (top)
    const indexContainer = document.querySelector(this.selectors.marketIndexContainer)
    if (indexContainer) {
      indexContainer.querySelectorAll(this.selectors.marketIndexItem).forEach((item) => {
        // Prefer data-symbol attribute (e.g. "^GSPC") over display name (e.g. "CBOE Interest Rate 10 Year T No")
        const priceEl = item.querySelector(this.selectors.marketIndexPrice) as HTMLElement | null
        const dataSymbol = priceEl?.getAttribute('data-symbol') ?? ''
        const nameEl = item.querySelector(this.selectors.marketIndexName)
        const displayName = nameEl?.textContent?.trim() ?? ''
        const symbol = dataSymbol || displayName
        if (!symbol) return

        const changeEl = item.querySelector(this.selectors.marketIndexChange) as HTMLElement | null
        const pctEl = item.querySelector(this.selectors.marketIndexChangePercent) as HTMLElement | null

        const price = priceEl?.textContent?.trim() ?? ''
        const change = changeEl?.textContent?.trim() ?? ''
        const changePercent = this.normalizePercent(pctEl?.textContent?.trim() ?? '')
        const direction = this.detectDirection(item)

        const link = item.querySelector('a[href]') as HTMLAnchorElement | null

        tickers.push({ symbol, name: displayName || undefined, price, change, changePercent, direction, url: link?.href, category: 'market-index' })
      })
    }

    // Trending tickers (sidebar)
    const trendingContainer = document.querySelector(this.selectors.trendingContainer)
    if (trendingContainer) {
      trendingContainer.querySelectorAll(this.selectors.trendingItem).forEach((item) => {
        const symbolEl = item.querySelector(this.selectors.trendingSymbol)
        const symbol = symbolEl?.textContent?.trim() ?? ''
        if (!symbol) return

        const nameEl = item.querySelector(this.selectors.trendingName)
        const name = nameEl?.textContent?.trim() || undefined

        const priceEl = item.querySelector(this.selectors.trendingPrice) as HTMLElement | null
        const changeEl = item.querySelector(this.selectors.trendingChange) as HTMLElement | null
        const pctEl = item.querySelector(this.selectors.trendingChangePercent) as HTMLElement | null

        const price = priceEl?.textContent?.trim() ?? ''
        const change = changeEl?.textContent?.trim() ?? ''
        const changePercent = this.normalizePercent(pctEl?.textContent?.trim() ?? '')
        const direction = this.detectDirection(item)

        const link = (item as HTMLAnchorElement).href ? (item as HTMLAnchorElement) : item.querySelector('a[href]') as HTMLAnchorElement | null
        const url = link?.href || undefined

        tickers.push({ symbol, name, price, change, changePercent, direction, url, category: 'trending' })
      })
    }

    return tickers
  }

  private detectDirection(el: Element): 'up' | 'down' {
    // Yahoo uses txt-positive / txt-negative classes
    const html = el.innerHTML
    if (html.includes('txt-positive')) return 'up'
    if (html.includes('txt-negative')) return 'down'
    return 'up'
  }

  private extractTimestamp(container: Element | null): string {
    if (!container) return ''
    const pubEl = container.querySelector(this.selectors.timestamp)
    return pubEl?.textContent?.trim() ?? ''
  }

  private normalizePercent(value: string): string {
    // Strip parentheses: "(+3.08%)" → "+3.08%"
    return value.replace(/^\(/, '').replace(/\)$/, '')
  }

  private extractTickerBadges(container: Element): string[] {
    const badges = container.querySelectorAll(this.selectors.tickerBadge)
    const tickers: string[] = []
    badges.forEach((badge) => {
      // Extract just the ticker symbol (e.g. "GOOG" from "GOOG +5.02%")
      const text = badge.textContent?.trim() ?? ''
      const symbol = text.split(/\s/)[0]
      if (symbol && !tickers.includes(symbol)) tickers.push(symbol)
    })
    return tickers
  }

  private extractRank(link: HTMLAnchorElement): number | null {
    const ylk = link.getAttribute(this.selectors.rankAttribute)
    if (ylk) {
      const match = ylk.match(/cpos:(\d+)/)
      if (match) return parseInt(match[1], 10)
    }
    return null
  }
}
