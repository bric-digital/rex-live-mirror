/**
 * CNBC homepage parser.
 * Extracts headlines, market tickers, and market teaser from the CNBC homepage.
 * Selectors are config-driven — defaults match the current CNBC DOM structure.
 */
import type { HomepageBlurb, HomepageParser, HomepageParserValidation, StockTicker, MarketTeaser } from './types.js'

export interface CNBCSelectors {
  featured?: string
  secondary?: string
  latestNews?: string
  riverHeadline?: string
  riverDate?: string
  riverAuthor?: string
  riverContainer?: string
  marketCard?: string
  marketSymbol?: string
  marketPrice?: string
  marketChange?: string
  marketChangePercent?: string
  breakingBanner?: string
  quickLinks?: string
  marketLastTime?: string
  marketTeaser?: string
}

export class CNBCHomepageParser implements HomepageParser {
  private selectors: Required<CNBCSelectors>

  constructor(selectors?: CNBCSelectors) {
    this.selectors = {
      featured: selectors?.featured ?? '.FeaturedCard-packagedCardTitle a[href]',
      secondary: selectors?.secondary ?? '.SecondaryCard-headline a[href]',
      latestNews: selectors?.latestNews ?? 'a.LatestNews-headline[href]',
      riverHeadline: selectors?.riverHeadline ?? '.RiverHeadline-headline a[href]',
      riverDate: selectors?.riverDate ?? '.RiverByline-datePublished',
      riverAuthor: selectors?.riverAuthor ?? '.RiverByline-authorByline a',
      riverContainer: selectors?.riverContainer ?? '.RiverPlusCard-container, .Card-standardBreakerCard',
      marketCard: selectors?.marketCard ?? 'a.MarketCard-container',
      marketSymbol: selectors?.marketSymbol ?? '.MarketCard-symbol',
      marketPrice: selectors?.marketPrice ?? '.MarketCard-stockPosition',
      marketChange: selectors?.marketChange ?? '.MarketCard-changesPts',
      marketChangePercent: selectors?.marketChangePercent ?? '.MarketCard-changesPct',
      marketLastTime: selectors?.marketLastTime ?? '.MarketCard-lastTime',
      marketTeaser: selectors?.marketTeaser ?? '.MarketsBanner-teaser a',
      breakingBanner: selectors?.breakingBanner ?? '.BreakingBanner-headline a, [class*="BreakingNews"] a, .LiveBlogHeader-headline a',
      quickLinks: selectors?.quickLinks ?? '[class*="QuickLinks"] a',
    }
  }

  validateSelectors(): HomepageParserValidation {
    const items = document.querySelectorAll(
      `${this.selectors.featured}, ${this.selectors.secondary}, ${this.selectors.latestNews}, ${this.selectors.riverHeadline}`
    )
    return { valid: items.length > 0, itemsFound: items.length }
  }

  extractBlurbs(): HomepageBlurb[] {
    const blurbs: HomepageBlurb[] = []
    const seen = new Set<string>()
    let rank = 0

    document.querySelectorAll(this.selectors.featured).forEach((el) => {
      const blurb = this.extractFromLink(el as HTMLAnchorElement, rank++, seen)
      if (blurb) blurbs.push(blurb)
    })

    document.querySelectorAll(this.selectors.secondary).forEach((el) => {
      const blurb = this.extractFromLink(el as HTMLAnchorElement, rank++, seen)
      if (blurb) blurbs.push(blurb)
    })

    document.querySelectorAll(this.selectors.latestNews).forEach((el) => {
      const blurb = this.extractFromLink(el as HTMLAnchorElement, rank++, seen)
      if (blurb) blurbs.push(blurb)
    })

    document.querySelectorAll(this.selectors.riverHeadline).forEach((el) => {
      const a = el as HTMLAnchorElement
      if (!a.href.includes('/20')) return

      const blurb = this.extractFromLink(a, rank++, seen)
      if (blurb) {
        const container = a.closest(this.selectors.riverContainer)
        if (container) {
          const dateEl = container.querySelector(this.selectors.riverDate)
          if (dateEl?.textContent) blurb.posted = dateEl.textContent.trim()

          const authorEls = container.querySelectorAll(this.selectors.riverAuthor)
          blurb.authors = Array.from(authorEls)
            .map((ae) => ae.textContent?.trim() ?? '')
            .filter(Boolean)
        }
        blurbs.push(blurb)
      }
    })

    return blurbs
  }

  extractTickers(): StockTicker[] {
    const tickers: StockTicker[] = []

    document.querySelectorAll(this.selectors.marketCard).forEach((el) => {
      const a = el as HTMLAnchorElement

      const symbol = a.querySelector(this.selectors.marketSymbol)?.textContent?.trim() ?? ''
      if (!symbol) return

      const price = a.querySelector(this.selectors.marketPrice)?.textContent?.trim() ?? ''
      const change = a.querySelector(this.selectors.marketChange)?.textContent?.trim() ?? ''
      const changePercent = a.querySelector(this.selectors.marketChangePercent)?.textContent?.trim() ?? ''
      const lastUpdated = a.querySelector(this.selectors.marketLastTime)?.textContent?.trim() ?? undefined
      const direction = a.classList.contains('MarketCard-up') ? 'up' as const : 'down' as const
      const url = a.href || undefined

      tickers.push({ symbol, price, change, changePercent, direction, lastUpdated, url, category: 'market-index' })
    })

    return tickers
  }

  extractMarketTeaser(): MarketTeaser | null {
    const a = document.querySelector(this.selectors.marketTeaser) as HTMLAnchorElement | null
    if (!a) return null

    const headline = a.textContent?.trim() ?? ''
    if (!headline) return null

    return { headline, url: a.href }
  }

  extractBreakingNews(): string | null {
    const el = document.querySelector(this.selectors.breakingBanner)
    return el?.textContent?.trim() || null
  }

  extractQuickLinks(): string[] {
    return Array.from(document.querySelectorAll(this.selectors.quickLinks))
      .map((el) => el.textContent?.trim() ?? '')
      .filter(Boolean)
  }

  private extractFromLink(a: HTMLAnchorElement, rank: number, seen: Set<string>): HomepageBlurb | null {
    const url = a.href
    if (!url || seen.has(url)) return null
    seen.add(url)

    const headline = a.textContent?.trim()
    if (!headline) return null

    return { headline, url, rank, posted: '', source: 'cnbc', authors: [] }
  }
}
