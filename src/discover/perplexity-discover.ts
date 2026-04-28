/**
 * Perplexity Discover page parser.
 * Extracts news blurbs from the Perplexity Discover feed.
 */

import { type NewsBlurb, type Citation, type Position, DateString } from '@bric/rex-types/types'

export interface DiscoverSelectors {
  mainColumn?: string
  newsCard?: string
  headline?: string
}

export interface DiscoverConfig {
  selectors?: DiscoverSelectors
}

export interface DiscoverValidation {
  valid: boolean
  cardsFound: number
}

export class PerplexityDiscoverParser {
  private selectors: Required<DiscoverSelectors>

  constructor(config?: DiscoverConfig) {
    this.selectors = {
      mainColumn: config?.selectors?.mainColumn ?? '[data-testid="discover-you"]',
      newsCard: config?.selectors?.newsCard ?? 'a.group\\/card',
      headline: config?.selectors?.headline ?? '[data-testid="thread-title"]',
    }
  }

  validateSelectors(): DiscoverValidation {
    const mainCol = document.querySelector(this.selectors.mainColumn)
    if (!mainCol) {
      return { valid: false, cardsFound: 0 }
    }
    const cards = mainCol.querySelectorAll(this.selectors.newsCard)
    return { valid: cards.length > 0, cardsFound: cards.length }
  }

  extractNewsBlurbs(): NewsBlurb[] {
    const mainCol = document.querySelector(this.selectors.mainColumn)
    if (!mainCol) return []

    const cards = mainCol.querySelectorAll(this.selectors.newsCard)
    const blurbs: NewsBlurb[] = []

    cards.forEach((card, cardIndex) => {
      const headlineEl = card.querySelector(this.selectors.headline)
      const headline = headlineEl?.textContent?.trim()
      if (!headline) return

      const summaryEl = card.querySelector('.line-clamp-6')
      const summary = summaryEl?.textContent?.trim() || undefined

      const timeEl = card.querySelector('span.truncate')
      const posted = new DateString(timeEl?.textContent?.trim() ?? '')

      const url = card.getAttribute('href') ?? ''

      const citations = extractCitations(card)
      const source = citations[0]?.source ?? ''
      const sourceCount = extractSourceCount(card)
      const position = rectToPosition(card.getBoundingClientRect())

      blurbs.push({
        headline,
        posted,
        source,
        authors: [],
        summary,
        url,
        citations,
        position,
        metadata: { cardIndex, sourceCount },
      })
    })

    return blurbs
  }
}

/**
 * Extracts source domains from a Discover card. Perplexity serves favicons via
 * Google's proxy: `<img src="https://www.google.com/s2/favicons?domain=<host>">`.
 * The domain comes from the `domain=` query param.
 */
function extractCitations(card: Element): Citation[] {
  const seen = new Set<string>()
  const citations: Citation[] = []

  card.querySelectorAll('img[src*="favicons"]').forEach((img) => {
    const src = img.getAttribute('src') ?? ''
    const match = src.match(/[?&]domain=([^&]+)/)
    const domain = match ? decodeURIComponent(match[1]).trim() : ''
    if (domain && !seen.has(domain)) {
      seen.add(domain)
      citations.push({ source: domain, title: '' })
    }
  })

  return citations
}

/**
 * Reads the visible "N sources" string from a card and returns N. Returns undefined
 * if no such element is present (e.g. the small text varies across A/B layouts).
 */
function extractSourceCount(card: Element): number | undefined {
  const candidates = card.querySelectorAll('div, span')
  for (const el of candidates) {
    const text = el.textContent?.trim() ?? ''
    const match = text.match(/^(\d+)\s+sources?$/)
    if (match) return parseInt(match[1], 10)
  }
  return undefined
}

function rectToPosition(rect: DOMRect): Position {
  return { top: rect.top, left: rect.left, width: rect.width, height: rect.height }
}
