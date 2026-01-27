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
  selectors: ChatGPTSelectors

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

    // Fallback: Look for message groups if no messages found with primary selectors
    // ChatGPT sometimes uses conversation-turn containers instead of role-based selectors
    if (interactions.length === 0) {
      console.log('[ChatGPTParser] No messages found with primary selectors, trying fallback [data-testid="conversation-turn"]')
      const messageGroups = document.querySelectorAll('[data-testid="conversation-turn"]')
      console.log(`[ChatGPTParser] Found ${messageGroups.length} conversation-turn elements`)
      messageGroups.forEach((group) => {
        const textContent = group.textContent?.trim()
        if (textContent && textContent.length > 0) {
          // Alternate between question and response based on order
          // ChatGPT alternates user/assistant in conversation turns
          interactions.push({
            type: interactions.length % 2 === 0 ? 'question' : 'response',
            content: textContent,
          })
        }
      })
    }

    return interactions
  }

  /**
   * Extract sources cited in the response
   * Combines DOM-based link extraction with text-based URL extraction
   * ChatGPT often displays URLs as inline text before they become clickable
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
      // Skip internal ChatGPT/OpenAI links (check domain, not full URL string)
      // URLs may contain utm_source=chatgpt.com which shouldn't be filtered
      try {
        const hostname = new URL(url).hostname
        if (hostname.includes('chatgpt.com') || hostname.includes('openai.com')) return true
      } catch {
        // If URL parsing fails, skip it
        return true
      }
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

    // Method 1: Extract from DOM links using ek_dev selectors
    // ChatGPT uses links, nav-list links, and footnote buttons for citations
    const linkSelector =
      this.selectors.citationElements ||
      '[data-message-author-role="assistant"] a[href], .group\\/nav-list a[href], button.group\\/footnote a[href]'

    const linkElements = document.querySelectorAll(linkSelector)

    linkElements.forEach((element) => {
      const url = element.getAttribute('href')
      if (!url || shouldSkipUrl(url)) return

      let title = element.textContent?.trim()
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
        sources.push({ source_title: title, source_url: url })
      }
    })

    // Method 2: Extract URLs from response text content (inline URLs)
    // ChatGPT often shows URLs as plain text before they're linkified
    const assistantMessages = document.querySelectorAll(
      this.selectors.assistantMessage || '[data-message-author-role="assistant"]',
    )

    const urlRegex = /https?:\/\/[^\s<>"{}|\\^`[\]]+/g

    assistantMessages.forEach((msg) => {
      const textContent = msg.textContent || ''
      const matches = textContent.match(urlRegex)

      if (matches) {
        matches.forEach((url) => {
          // Clean up URL (remove trailing punctuation)
          const cleanUrl = url.replace(/[.,;:!?)]+$/, '')

          if (shouldSkipUrl(cleanUrl)) return

          visitedUrls.add(cleanUrl)
          // Use domain as title for text-extracted URLs
          try {
            const domain = new URL(cleanUrl).hostname.replace(/^www\./, '')
            sources.push({ source_title: domain, source_url: cleanUrl })
          } catch {
            sources.push({ source_title: cleanUrl, source_url: cleanUrl })
          }
        })
      }
    })

    console.log(`[ChatGPTParser] Extracted ${sources.length} sources`)
    return sources
  }
}
