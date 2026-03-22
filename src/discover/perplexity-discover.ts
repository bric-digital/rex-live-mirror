/**
 * Perplexity Discover page parser.
 * Extracts news blurbs from the Perplexity Discover feed.
 */

export interface CitationSource {
  source: string
}

export interface NewsBlurb {
  headline: string
  summary?: string
  posted: string
  url: string
  source: string
  citations: CitationSource[]
  authors: string[]
}

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

    cards.forEach((card) => {
      const headlineEl = card.querySelector(this.selectors.headline)
      const headline = headlineEl?.textContent?.trim()
      if (!headline) return

      const summaryEl = card.querySelector('.line-clamp-6')
      const summary = summaryEl?.textContent?.trim() || undefined

      const timeEl = card.querySelector('span.truncate')
      const posted = timeEl?.textContent?.trim() ?? ''

      const url = card.getAttribute('href') ?? ''

      const faviconImgs = card.querySelectorAll('img[alt$=" favicon"]')
      const citations: CitationSource[] = []
      faviconImgs.forEach((img) => {
        const alt = img.getAttribute('alt') ?? ''
        const domain = alt.replace(' favicon', '').trim()
        if (domain) citations.push({ source: domain })
      })

      const source = citations[0]?.source ?? ''

      blurbs.push({ headline, summary, posted, url, source, citations, authors: [] })
    })

    return blurbs
  }
}
