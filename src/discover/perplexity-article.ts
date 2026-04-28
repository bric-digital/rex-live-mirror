/**
 * Perplexity Discover article page parser.
 * Extracts a full news article from a Perplexity Discover article page.
 */

import { type NewsArticle, type Citation, DateString } from '@bric/rex-types/types'

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

    const postedEl = container.querySelector('[data-testid="article-published-meta"]')
    const postedText = postedEl?.parentElement?.querySelector('span.truncate')?.textContent?.trim()
      ?? container.querySelector('span.truncate')?.textContent?.trim()
      ?? ''
    const posted = new DateString(postedText)

    const content = extractCleanContent(container)
    const summary = content.split('\n\n')[0] ?? ''

    const citations = extractCitations(container)
    const url = window.location.href

    return { url, headline, posted, authors: [], content, summary, citations }
  }
}

/**
 * Builds the article body text by cloning the container, stripping inline citation
 * markers (which would otherwise leak as `theinformation+1`-style cruft into the prose),
 * and joining all `<p>` text. The titles/URLs of those citations are captured separately
 * via extractCitations().
 */
function extractCleanContent(container: Element): string {
  const clone = container.cloneNode(true) as Element
  clone.querySelectorAll('span.citation, .citation-nbsp').forEach((node) => node.remove())

  const paragraphs: string[] = []
  clone.querySelectorAll('p').forEach((p) => {
    const text = p.textContent?.trim()
    if (text) paragraphs.push(text)
  })
  return paragraphs.join('\n\n')
}

/**
 * Extracts citations from a Perplexity Discover article page.
 *
 * Each cited source — whether shown inline in the prose or in the trailing source list —
 * is wrapped in a `<span aria-label="<source title>" data-state="closed">` containing
 * an `<a target="_blank" href="<source url>">`. Same selector covers both placements;
 * dedup by URL handles the inline+trailing duplicates Perplexity emits per source.
 *
 * Falls through to favicon-proxy domains for any sources that lack the aria-label
 * wrapper (rare, but the favicon row is always present even for collapsed citations).
 */
function extractCitations(container: Element): Citation[] {
  const seen = new Set<string>()
  const citations: Citation[] = []

  container.querySelectorAll('[aria-label][data-state="closed"]').forEach((wrapper) => {
    const link = wrapper.querySelector('a[href^="http"]')
    if (!link) return
    const url = link.getAttribute('href') ?? ''
    if (!url || seen.has(url)) return
    if (url.includes('perplexity.ai')) return

    const title = wrapper.getAttribute('aria-label')?.trim() ?? ''
    const source = hostnameOf(url)
    if (!source) return

    seen.add(url)
    citations.push({ source, title, url })
  })

  // Domains-only fallback for favicons not represented by an aria-label wrapper.
  const seenDomains = new Set(citations.map((c) => c.source))
  container.querySelectorAll('img[src*="favicons"]').forEach((img) => {
    const src = img.getAttribute('src') ?? ''
    const match = src.match(/[?&]domain=([^&]+)/)
    const domain = match ? decodeURIComponent(match[1]).trim() : ''
    if (domain && !seenDomains.has(domain)) {
      seenDomains.add(domain)
      citations.push({ source: domain, title: '' })
    }
  })

  return citations
}

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}
