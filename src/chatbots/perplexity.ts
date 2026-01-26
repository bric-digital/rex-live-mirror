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
    const visitedUrls = new Set<string>()

    // Helper to check if URL should be skipped
    const shouldSkipUrl = (url: string): boolean => {
      if (!url) return true
      // Skip anchors, javascript, and internal links
      if (url.startsWith('#') || url.startsWith('javascript:')) return true
      if (url.startsWith('/')) return true
      if (url.includes('perplexity.ai')) return true
      // Skip already visited
      if (visitedUrls.has(url)) return true
      return false
    }

    // Helper to check if title is valid (not navigation/accessibility text)
    const isValidTitle = (title: string): boolean => {
      if (!title || title.length < 3) return false
      const skipPatterns = [
        /^skip\s+to/i,
        /^jump\s+to/i,
        /^go\s+to/i,
        /^main\s+content/i,
        /^navigation/i,
        /^\d+$/,  // Just numbers
      ]
      return !skipPatterns.some((pattern) => pattern.test(title))
    }

    // Get configured citation selector - Perplexity uses data attributes and links
    const citationSelector =
      this.selectors.citationElements || '[data-pplx-citation-url], a[href^="http"]'

    // Find all citation elements on the page
    const citationElements = document.querySelectorAll(citationSelector)

    citationElements.forEach((element) => {
      // Get URL from data attribute or href
      const url = element.getAttribute('data-pplx-citation-url') || element.getAttribute('href')

      if (!url || shouldSkipUrl(url)) return

      // Extract title from element text
      let title = element.textContent?.trim()

      // Clean up title - remove extra whitespace and limit length
      if (title) {
        title = title.replace(/\s+/g, ' ').substring(0, 200)
      }

      if (!title) {
        title = element.getAttribute('title') || element.getAttribute('aria-label') || undefined
      }

      // If title is just a URL or not valid, extract domain as title
      if (!title || !isValidTitle(title) || title.startsWith('http')) {
        try {
          title = new URL(url).hostname.replace(/^www\./, '')
        } catch {
          title = url
        }
      }

      if (url && title) {
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
