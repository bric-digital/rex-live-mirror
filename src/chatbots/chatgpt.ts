/**
 * ChatGPT Parser
 * Extracts Q&A pairs from ChatGPT interface
 */

export interface ParsedInteraction {
  type: 'question' | 'response'
  content: string
}

export interface ChatGPTSelectors {
  userMessage?: string
  assistantMessage?: string
  messageContainer?: string
  contentDiv?: string
  citationElements?: string
}

export interface ExtractedSource {
  source_title: string
  source_url?: string
}

export interface ChatGPTConfig {
  enabled?: boolean
  selectors?: ChatGPTSelectors
}

export class ChatGPTParser {
  name = 'chatgpt'
  private selectors: ChatGPTSelectors

  constructor(config?: ChatGPTConfig) {
    // Use config selectors or defaults
    this.selectors = config?.selectors || {
      userMessage: '[data-message-author-role="user"]',
      assistantMessage: '[data-message-author-role="assistant"]',
    }
    console.log('[ChatGPTParser] Initialized with selectors:', this.selectors)
  }

  extractInteractions(): ParsedInteraction[] {
    const interactions: ParsedInteraction[] = []

    // Find all user messages using config selector
    if (this.selectors.userMessage) {
      const userMessages = document.querySelectorAll(this.selectors.userMessage)
      console.log(`[ChatGPTParser] Found ${userMessages.length} user message elements`)
      userMessages.forEach((msg) => {
        const content = msg.textContent?.trim()
        if (content && content.length > 0) {
          interactions.push({
            type: 'question',
            content,
          })
        }
      })
    }

    // Find all assistant messages using config selector
    if (this.selectors.assistantMessage) {
      const assistantMessages = document.querySelectorAll(this.selectors.assistantMessage)
      console.log(`[ChatGPTParser] Found ${assistantMessages.length} assistant message elements`)
      assistantMessages.forEach((msg) => {
        const content = msg.textContent?.trim()
        if (content && content.length > 0) {
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
   * Uses configured selectors to find all citation/link elements on page
   */
  extractSources(): ExtractedSource[] {
    const sources: ExtractedSource[] = []

    // Get configured citation selector - ChatGPT uses links and footnotes
    const linkSelector =
      this.selectors.citationElements ||
      'a[href],.group\\/nav-list a[href],button.group\\/footnote a[href]'

    // Find all citation elements on the page
    const linkElements = document.querySelectorAll(linkSelector)

    if (linkElements.length === 0) {
      return sources
    }

    const visitedUrls = new Set<string>()

    linkElements.forEach((element) => {
      // Get URL from href attribute
      const url = element.getAttribute('href')

      if (!url || url.startsWith('javascript:') || visitedUrls.has(url)) {
        return
      }

      // Skip internal ChatGPT links
      if (url.startsWith('/') || url.includes('chatgpt.com') || url.includes('openai.com')) {
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

    console.log(`[ChatGPTParser] Extracted ${sources.length} sources`)
    return sources
  }
}
