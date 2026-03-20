/**
 * Perplexity Discover Article Parser
 * Extracts a full article from a Perplexity Discover article page
 * (URL pattern: /discover/you/SLUG).
 *
 * The article page has a different structure from the Discover feed:
 * a single article with headline, intro paragraphs, body sections,
 * source citation cards, and inline citations.
 */

import type { NewsArticle, Citation } from '@bric/rex-types/types'
import { DateString } from '@bric/rex-types/types'

export interface ArticleSelectors {
  articleContainer?: string
  headline?: string
  summary?: string
  bodyContent?: string
  postedTime?: string
  sourceIcons?: string
}

export interface ArticleConfig {
  enabled?: boolean
  selectors?: ArticleSelectors
}

export interface ArticleValidation {
  valid: boolean
  hasHeadline: boolean
  hasContent: boolean
}

const DEFAULT_SELECTORS: ArticleSelectors = {
  articleContainer: '[data-testid="article-main"]',
  headline: 'h2.font-editorial span.rounded-md',
  summary: '.prose.inline p',
  bodyContent: '.prose.inline',
  postedTime: '[data-testid="article-published-meta"]',
  sourceIcons: 'img[alt$=" favicon"]',
}

export class PerplexityArticleParser {
  name = 'perplexity-article'
  selectors: ArticleSelectors

  constructor(config?: ArticleConfig) {
    this.selectors = { ...DEFAULT_SELECTORS, ...config?.selectors }
    console.log('[PerplexityArticleParser] Initialized with selectors:', this.selectors)
  }

  validateArticle(): ArticleValidation {
    const container = this.getContainer()
    if (!container) return { valid: false, hasHeadline: false, hasContent: false }

    const headline = container.querySelector(this.selectors.headline || DEFAULT_SELECTORS.headline!)
    const content = container.querySelector(this.selectors.bodyContent || DEFAULT_SELECTORS.bodyContent!)

    return {
      valid: !!headline && !!content,
      hasHeadline: !!headline,
      hasContent: !!content,
    }
  }

  private getContainer(): Element | null {
    return document.querySelector(this.selectors.articleContainer || DEFAULT_SELECTORS.articleContainer!)
  }

  private extractCitations(container: Element): Citation[] {
    const citations: Citation[] = []
    const selector = this.selectors.sourceIcons || DEFAULT_SELECTORS.sourceIcons!
    const imgs = container.querySelectorAll(selector)

    imgs.forEach((el) => {
      const alt = el.getAttribute('alt')
      if (!alt || !alt.endsWith(' favicon')) return

      const domain = alt.replace(/ favicon$/, '')
      const src = el.getAttribute('src') || ''

      // Deduplicate by domain
      if (!citations.some(c => c.source === domain)) {
        citations.push({ source: domain, title: domain, url: src })
      }
    })

    return citations
  }

  extractArticle(): NewsArticle | null {
    const container = this.getContainer()
    if (!container) {
      console.log('[PerplexityArticleParser] Article container not found')
      return null
    }

    // Extract headline
    const headlineEl = container.querySelector(this.selectors.headline || DEFAULT_SELECTORS.headline!)
    const headline = headlineEl?.textContent?.trim()
    if (!headline) {
      console.log('[PerplexityArticleParser] No headline found')
      return null
    }

    // Extract posted time
    // Find the published meta element, then look for the time in a sibling
    const publishedMeta = container.querySelector(this.selectors.postedTime || DEFAULT_SELECTORS.postedTime!)
    let postedText = ''
    if (publishedMeta) {
      // The time is in the next sibling element's span.truncate
      const timeEl = publishedMeta.parentElement?.querySelector('[data-state="closed"] span.truncate')
      postedText = timeEl?.textContent?.trim() || ''
    }
    const posted = new DateString(postedText)

    // Extract body content - get all prose sections' text
    const bodySelector = this.selectors.bodyContent || DEFAULT_SELECTORS.bodyContent!
    const proseElements = container.querySelectorAll(bodySelector)
    const paragraphs: string[] = []

    proseElements.forEach((prose) => {
      const pElements = prose.querySelectorAll('p')
      pElements.forEach((p) => {
        // Get text content but strip inline citation badges
        const text = p.textContent?.trim()
        if (text) {
          paragraphs.push(text)
        }
      })
    })

    const content = paragraphs.join('\n\n')
    const summary = paragraphs.length > 0 ? paragraphs[0] : undefined

    // Extract citations from favicons (deduplicated)
    const citations = this.extractCitations(container)
    const source = citations.length > 0 ? citations[0].source : ''

    // Extract URL from current page
    const url = typeof window !== 'undefined' ? window.location.href : ''

    const article: NewsArticle = {
      headline,
      posted,
      authors: [],
      content,
      summary,
      url,
      citations: citations.length > 0 ? citations : undefined,
    }

    console.log(`[PerplexityArticleParser] Extracted article: "${headline.substring(0, 60)}..." (${paragraphs.length} paragraphs, ${citations.length} sources)`)
    return article
  }
}
