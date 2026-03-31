/**
 * Yahoo Finance homepage parser.
 * Extracts headlines from story items using data-testid and data-ylk attributes.
 * Selectors are config-driven — defaults match the current Yahoo Finance DOM structure.
 */
import type { HomepageBlurb, HomepageParser, HomepageParserValidation } from './types.js'

export interface YahooFinanceSelectors {
  leadTitle?: string
  storyItem?: string
  storyLink?: string
  storyHeadline?: string
  timestamp?: string
  rankAttribute?: string
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

    // Lead article
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

          blurbs.push({
            headline,
            summary: summaryEl?.textContent?.trim() || undefined,
            url: leadLink.href,
            rank: rank ?? 0,
            posted,
            source: 'yahoo-finance',
            authors: [],
          })
        }
      }
    }

    // Story items
    document.querySelectorAll(this.selectors.storyItem).forEach((section) => {
      const link = section.querySelector(this.selectors.storyLink) as HTMLAnchorElement | null
      if (!link?.href || seen.has(link.href)) return
      seen.add(link.href)

      const h = section.querySelector(this.selectors.storyHeadline)
      const headline = h?.textContent?.trim() ?? link.textContent?.trim() ?? ''
      if (!headline) return

      const posted = this.extractTimestamp(section)
      const rank = this.extractRank(link)

      blurbs.push({
        headline,
        url: link.href,
        rank: rank ?? blurbs.length,
        posted,
        source: 'yahoo-finance',
        authors: [],
      })
    })

    return blurbs
  }

  private extractTimestamp(container: Element | null): string {
    if (!container) return ''
    const pubEl = container.querySelector(this.selectors.timestamp)
    return pubEl?.textContent?.trim() ?? ''
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
