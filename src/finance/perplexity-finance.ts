/**
 * Perplexity Finance page parser.
 * Extracts source domains from the Market Summary section.
 */

export class PerplexityFinanceParser {
  extractMarketSummarySources(): string[] {
    // Find the Market Summary section by locating an h2 with that text
    let marketSummaryContainer: Element | null = null
    document.querySelectorAll('h2').forEach((h2) => {
      if (h2.textContent?.trim() === 'Market Summary') {
        marketSummaryContainer = h2.closest('.border-subtlest') ?? null
      }
    })

    if (!marketSummaryContainer) return []

    const seen = new Set<string>()
    const domains: string[] = []

    marketSummaryContainer.querySelectorAll('img[alt$=" favicon"]').forEach((img) => {
      const alt = img.getAttribute('alt') ?? ''
      const domain = alt.replace(' favicon', '').trim()
      if (domain && !seen.has(domain)) {
        seen.add(domain)
        domains.push(domain)
      }
    })

    return domains
  }
}
