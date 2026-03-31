/**
 * CNBC homepage parser.
 * Extracts headlines from FeaturedCard, SecondaryCard, LatestNews, and RiverPlusCard sections.
 * Selectors are config-driven — defaults match the current CNBC DOM structure.
 */
import type { HomepageBlurb, HomepageParser, HomepageParserValidation } from './types.js'

export interface CNBCSelectors {
  featured?: string
  secondary?: string
  latestNews?: string
  riverHeadline?: string
  riverDate?: string
  riverAuthor?: string
  riverContainer?: string
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

    // Featured cards (most prominent)
    document.querySelectorAll(this.selectors.featured).forEach((el) => {
      const blurb = this.extractFromLink(el as HTMLAnchorElement, rank++, seen)
      if (blurb) blurbs.push(blurb)
    })

    // Secondary cards
    document.querySelectorAll(this.selectors.secondary).forEach((el) => {
      const blurb = this.extractFromLink(el as HTMLAnchorElement, rank++, seen)
      if (blurb) blurbs.push(blurb)
    })

    // Latest news items
    document.querySelectorAll(this.selectors.latestNews).forEach((el) => {
      const blurb = this.extractFromLink(el as HTMLAnchorElement, rank++, seen)
      if (blurb) blurbs.push(blurb)
    })

    // River cards (main feed)
    document.querySelectorAll(this.selectors.riverHeadline).forEach((el) => {
      const a = el as HTMLAnchorElement
      // Skip non-article links (e.g. /pro/, /investing-club/)
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

  private extractFromLink(a: HTMLAnchorElement, rank: number, seen: Set<string>): HomepageBlurb | null {
    const url = a.href
    if (!url || seen.has(url)) return null
    seen.add(url)

    const headline = a.textContent?.trim()
    if (!headline) return null

    return { headline, url, rank, posted: '', source: 'cnbc', authors: [] }
  }
}
