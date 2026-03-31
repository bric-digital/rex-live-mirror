/**
 * Bloomberg homepage parser.
 * Extracts headlines using Bloomberg's data-component attributes.
 * Selectors are config-driven — defaults match the current Bloomberg DOM structure.
 */
import type { HomepageBlurb, HomepageParser, HomepageParserValidation } from './types.js'

export interface BloombergSelectors {
  storyLink?: string
  headline?: string
  summary?: string
  byline?: string
  timestamp?: string
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
}
