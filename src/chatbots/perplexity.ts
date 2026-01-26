/**
 * Perplexity.ai Parser
 * Extracts Q&A pairs from Perplexity chatbot interface
 */

export interface ParsedInteraction {
  type: 'question' | 'response'
  content: string
}

export interface PerplexitySelectors {
  userQuestion?: string
  assistantResponse?: string
  messageContainer?: string
  citationElements?: string
  citationTitle?: string
}

export interface ExtractedSource {
  source_title: string
  source_url?: string
}

export interface PerplexityConfig {
  enabled?: boolean
  selectors?: PerplexitySelectors
}

export class PerplexityParser {
  name = 'perplexity'
  private selectors: PerplexitySelectors

  constructor(config?: PerplexityConfig) {
    // Use config selectors or defaults
    this.selectors = config?.selectors || {
      userQuestion: ':is(h1, div)[class*="group/query"] span.select-text',
      assistantResponse: 'div[id^="markdown-content"]',
    }
    console.log('[PerplexityParser] Initialized with selectors:', this.selectors)
  }

  extractInteractions(): ParsedInteraction[] {
    const interactions: ParsedInteraction[] = []

    // Find all user questions using config selector
    if (this.selectors.userQuestion) {
      const userMessages = document.querySelectorAll(this.selectors.userQuestion)
      console.log(`[PerplexityParser] Found ${userMessages.length} user question elements`)
      userMessages.forEach((msg) => {
        const content = msg.textContent?.trim()
        if (content) {
          interactions.push({
            type: 'question',
            content,
          })
        }
      })
    }

    // Find all assistant responses using config selector
    if (this.selectors.assistantResponse) {
      const botResponses = document.querySelectorAll(this.selectors.assistantResponse)
      console.log(`[PerplexityParser] Found ${botResponses.length} assistant response elements`)
      botResponses.forEach((msg) => {
        const content = msg.textContent?.trim()
        if (content) {
          interactions.push({
            type: 'response',
            content,
          })
        }
      })
    }

    return interactions
  }

  /**
   * Extract sources cited in the response
   * Uses configured selectors to find all citation elements on page
   * Perplexity has specific citation data attributes for sources
   */
  extractSources(): ExtractedSource[] {
    const sources: ExtractedSource[] = []

    // Get configured citation selector - Perplexity uses data attributes and links
    const citationSelector =
      this.selectors.citationElements || 'a[href*="http"], [data-pplx-citation-url]'

    // Find all citation elements on the page
    const citationElements = document.querySelectorAll(citationSelector)

    if (citationElements.length === 0) {
      return sources
    }

    const visitedUrls = new Set<string>()

    citationElements.forEach((element) => {
      // Get URL from data attribute or href
      const url = element.getAttribute('data-pplx-citation-url') || element.getAttribute('href')

      if (!url || url.startsWith('javascript:') || visitedUrls.has(url)) {
        return
      }

      // Skip internal Perplexity links
      if (url.startsWith('/') || url.includes('perplexity.ai')) {
        return
      }

      // Extract title from element text
      let title = element.textContent?.trim()

      // Clean up title - remove extra whitespace and limit length
      if (title) {
        title = title.replace(/\s+/g, ' ').substring(0, 200)
      }

      if (!title) {
        title = element.getAttribute('title') || element.getAttribute('aria-label') || undefined
      }

      if (url && title && !visitedUrls.has(url)) {
        visitedUrls.add(url)
        sources.push({
          source_title: title,
          source_url: url,
        })
      }
    })

    console.log(`[PerplexityParser] Extracted ${sources.length} sources`)
    return sources
  }
}
