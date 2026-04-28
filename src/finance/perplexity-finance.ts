/**
 * Perplexity Finance page parser.
 * Extracts source domains from the Market Summary section.
 *
 * Post-2026 DOM: favicons are rendered as Google's favicon proxy
 * (`https://www.google.com/s2/favicons?sz=128&domain=<host>`) with empty `alt`,
 * so the domain must be parsed from the `src` query string.
 */

export class PerplexityFinanceParser {
  extractMarketSummarySources(): string[] {
    let marketSummaryContainer: Element | null = null
    document.querySelectorAll('h2').forEach((h2) => {
      if (h2.textContent?.trim() === 'Market Summary') {
        marketSummaryContainer = h2.closest('.border-subtlest') ?? null
      }
    })

    if (!marketSummaryContainer) return []

    const seen = new Set<string>()
    const domains: string[] = []

    const container: Element = marketSummaryContainer
    container.querySelectorAll('img[src*="favicons"]').forEach((img: Element) => {
      const src = img.getAttribute('src') ?? ''
      const match = src.match(/[?&]domain=([^&]+)/)
      const domain = match ? decodeURIComponent(match[1]).trim() : ''
      if (domain && !seen.has(domain)) {
        seen.add(domain)
        domains.push(domain)
      }
    })

    return domains
  }
}
