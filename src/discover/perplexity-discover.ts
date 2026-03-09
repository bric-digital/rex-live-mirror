/**
 * Perplexity Discover Page Parser
 * Extracts news headlines, summaries, sources, and timestamps from the Discover feed.
 *
 * The Discover page is fundamentally different from a chatbot page -- it's a news feed.
 * This parser extracts NewsBlurb objects from the main content column only (no sidebar).
 */

import type { NewsBlurb, Citation } from '@bric/rex-types/types'
import { DateString } from '@bric/rex-types/types'

export interface DiscoverSelectors {
  mainColumn?: string
  newsCard?: string
  headline?: string
  summary?: string
  postedTime?: string
  sourceIcons?: string
}

export interface DiscoverConfig {
  enabled?: boolean
  selectors?: DiscoverSelectors
}

export interface SelectorValidation {
  valid: boolean
  cardsFound: number
}

const DEFAULT_SELECTORS: DiscoverSelectors = {
  mainColumn: '[data-testid="discover-you"]',
  newsCard: 'a.group\\/card',
  headline: '[data-testid="thread-title"]',
  summary: '.line-clamp-6',
  postedTime: '[data-state="closed"] span.truncate',
  sourceIcons: 'img[alt$=" favicon"]',
}

export class PerplexityDiscoverParser {
  name = 'perplexity-discover'
  selectors: DiscoverSelectors

  constructor(config?: DiscoverConfig) {
    this.selectors = { ...DEFAULT_SELECTORS, ...config?.selectors }
    console.log('[PerplexityDiscoverParser] Initialized with selectors:', this.selectors)
  }

  /**
   * Validate that current selectors can find elements on the page
   */
  validateSelectors(): SelectorValidation {
    const mainColumn = this.getMainColumn()
    if (!mainColumn) {
      return { valid: false, cardsFound: 0 }
    }

    const cards = mainColumn.querySelectorAll(this.selectors.newsCard || '')
    return {
      valid: cards.length > 0,
      cardsFound: cards.length,
    }
  }

  /**
   * Get the main content column, excluding sidebar
   */
  private getMainColumn(): Element | null {
    return document.querySelector(this.selectors.mainColumn || '[data-testid="discover-you"]')
  }

  /**
   * Extract source domains from favicon images on a card.
   * Favicons are <img> elements with alt text like "youtube.com favicon".
   * The domain is extracted by removing the " favicon" suffix from alt text.
   */
  private extractCardCitations(card: Element): Citation[] {
    const citations: Citation[] = []
    const sourceSelector = this.selectors.sourceIcons || 'img[alt$=" favicon"]'
    const sourceElements = card.querySelectorAll(sourceSelector)

    sourceElements.forEach((el) => {
      const alt = el.getAttribute('alt')
      if (!alt || !alt.endsWith(' favicon')) return

      const domain = alt.replace(/ favicon$/, '')
      const src = el.getAttribute('src') || ''

      citations.push({
        source: domain,
        title: domain,
        url: src,
      })
    })

    return citations
  }

  /**
   * Extract all news blurbs from the main column of the Discover page
   */
  extractNewsBlurbs(): NewsBlurb[] {
    const blurbs: NewsBlurb[] = []
    const mainColumn = this.getMainColumn()

    if (!mainColumn) {
      console.log('[PerplexityDiscoverParser] Main column not found')
      return blurbs
    }

    const cards = mainColumn.querySelectorAll(this.selectors.newsCard || '')
    console.log(`[PerplexityDiscoverParser] Found ${cards.length} cards in main column`)

    cards.forEach((card) => {
      // Extract headline
      const headlineEl = card.querySelector(this.selectors.headline || '[data-testid="thread-title"]')
      const headline = headlineEl?.textContent?.trim()

      // Skip cards without headlines
      if (!headline) {
        return
      }

      // Extract summary (optional)
      const summaryEl = card.querySelector(this.selectors.summary || '.line-clamp-6')
      const summary = summaryEl?.textContent?.trim() || undefined

      // Extract posted time as raw text
      const postedEl = card.querySelector(this.selectors.postedTime || '[data-state="closed"] span.truncate')
      const postedText = postedEl?.textContent?.trim() || ''
      const posted = new DateString(postedText)

      // Extract card URL — the card element IS the <a> link
      const url = card.getAttribute('href') || undefined

      // Extract source citations
      const citations = this.extractCardCitations(card)
      const source = citations.length > 0 ? citations[0].source : ''

      const blurb: NewsBlurb = {
        headline,
        posted,
        source,
        authors: [],
        summary,
        url,
        citations: citations.length > 0 ? citations : undefined,
      }

      blurbs.push(blurb)
    })

    console.log(`[PerplexityDiscoverParser] Extracted ${blurbs.length} news blurbs`)
    return blurbs
  }
}
