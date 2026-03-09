/**
 * Perplexity Finance Parser
 * Extracts source domains from the Market Summary section of
 * the Perplexity Finance page (https://www.perplexity.ai/finance).
 *
 * Only extracts favicon domains — no content, headlines, or article text.
 */

export class PerplexityFinanceParser {
  name = 'perplexity-finance'

  /**
   * Extract source domains from the Market Summary section's favicon images.
   * Returns a deduplicated array of domain strings.
   */
  extractMarketSummarySources(): string[] {
    // Find the h2 containing "Market Summary"
    const h2s = document.querySelectorAll('h2')
    let marketSummaryH2: Element | null = null

    for (const h2 of h2s) {
      if (h2.textContent?.trim() === 'Market Summary') {
        marketSummaryH2 = h2
        break
      }
    }

    if (!marketSummaryH2) {
      console.log('[PerplexityFinanceParser] Market Summary section not found')
      return []
    }

    // Walk up to the section container
    const sectionContainer = marketSummaryH2.closest('.border-subtlest')
    if (!sectionContainer) {
      console.log('[PerplexityFinanceParser] Could not find Market Summary container')
      return []
    }

    // Find all favicon images within the section
    const imgs = sectionContainer.querySelectorAll('img[alt$=" favicon"]')
    const domains: string[] = []
    const seen = new Set<string>()

    imgs.forEach((img) => {
      const alt = img.getAttribute('alt')
      if (!alt || !alt.endsWith(' favicon')) return

      const domain = alt.replace(/ favicon$/, '')
      if (!seen.has(domain)) {
        seen.add(domain)
        domains.push(domain)
      }
    })

    console.log(`[PerplexityFinanceParser] Extracted ${domains.length} source domains from Market Summary`)
    return domains
  }
}
