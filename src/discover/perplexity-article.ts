/**
 * Perplexity Discover article page parser.
 * Extracts a full news article from a Perplexity Discover article page.
 */

export interface ArticleCitation {
  source: string
}

export interface NewsArticle {
  headline: string
  posted: string
  summary: string
  'content*': string
  url: string
  source: string
  citations: ArticleCitation[]
  authors: string[]
}

export interface ArticleSelectors {
  articleContainer?: string
  headline?: string
}

export interface ArticleConfig {
  selectors?: ArticleSelectors
}

export interface ArticleValidation {
  valid: boolean
  hasHeadline: boolean
  hasContent: boolean
}

export class PerplexityArticleParser {
  private selectors: Required<ArticleSelectors>

  constructor(config?: ArticleConfig) {
    this.selectors = {
      articleContainer: config?.selectors?.articleContainer ?? '[data-testid="article-main"]',
      headline: config?.selectors?.headline ?? 'h2.font-editorial span.rounded-md',
    }
  }

  validateArticle(): ArticleValidation {
    const container = document.querySelector(this.selectors.articleContainer)
    if (!container) return { valid: false, hasHeadline: false, hasContent: false }

    const headlineEl = container.querySelector(this.selectors.headline)
    const hasHeadline = !!headlineEl?.textContent?.trim()

    const paragraphs = container.querySelectorAll('p')
    const hasContent = paragraphs.length > 0

    return { valid: hasHeadline && hasContent, hasHeadline, hasContent }
  }

  extractArticle(): NewsArticle | null {
    const container = document.querySelector(this.selectors.articleContainer)
    if (!container) return null

    const headlineEl = container.querySelector(this.selectors.headline)
    const headline = headlineEl?.textContent?.trim()
    if (!headline) return null

    const timeEl = container.querySelector('span.truncate')
    const posted = timeEl?.textContent?.trim() ?? ''

    // Collect paragraphs from all prose sections, in document order
    const paragraphEls = container.querySelectorAll('p')
    const paragraphs: string[] = []
    paragraphEls.forEach((p) => {
      const text = p.textContent?.trim()
      if (text) paragraphs.push(text)
    })
    const content = paragraphs.join('\n\n')
    const summary = paragraphs[0] ?? ''

    // Deduplicated favicon sources
    const seenDomains = new Set<string>()
    const citations: ArticleCitation[] = []
    container.querySelectorAll('img[alt$=" favicon"]').forEach((img) => {
      const alt = img.getAttribute('alt') ?? ''
      const domain = alt.replace(' favicon', '').trim()
      if (domain && !seenDomains.has(domain)) {
        seenDomains.add(domain)
        citations.push({ source: domain })
      }
    })

    const source = citations[0]?.source ?? ''
    const url = window.location.href

    return { headline, posted, summary, 'content*': content, url, source, citations, authors: [] }
  }
}
