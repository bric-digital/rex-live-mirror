/**
 * ChatGPT Parser
 * Extracts Q&A pairs from ChatGPT interface
 */

export interface ParsedInteraction {
  type: 'question' | 'response'
  content: string
}

export class ChatGPTParser {
  name = 'chatgpt'
  private selectors: any = {}

  constructor(selectors?: any) {
    if (selectors) {
      this.selectors = selectors
    }
  }

  extractInteractions(): ParsedInteraction[] {
    const interactions: ParsedInteraction[] = []

    // Use configured selectors or defaults
    const userMessageSelector = this.selectors.userMessage || '[data-message-author-role="user"]'
    const assistantMessageSelector = this.selectors.assistantMessage || '[data-message-author-role="assistant"]'
    const messageAuthorSelector = '[data-message-author-role]'

    // ChatGPT typically uses role-based divs
    const messages = document.querySelectorAll(messageAuthorSelector)
    console.log('[ChatGPTParser] Found messages:', messages.length, 'elements')
    
    messages.forEach((msg) => {
      const role = msg.getAttribute('data-message-author-role')
      const content = msg.textContent?.trim()

      console.log('[ChatGPTParser] Message:', { role, contentLength: content?.length || 0 })

      if (content && content.length > 0) {
        interactions.push({
          type: role === 'user' ? 'question' : 'response',
          content,
        })
      }
    })

    // Fallback: Look for message groups
    if (interactions.length === 0) {
      console.log('[ChatGPTParser] No messages found, trying fallback selector [data-testid="conversation-turn"]')
      const messageGroups = document.querySelectorAll('[data-testid="conversation-turn"]')
      console.log('[ChatGPTParser] Found conversation turns:', messageGroups.length, 'elements')
      
      messageGroups.forEach((group) => {
        const textContent = group.textContent?.trim()
        if (textContent) {
          interactions.push({
            type: 'question',
            content: textContent,
          })
        }
      })
    }

    console.log('[ChatGPTParser] Total interactions extracted:', interactions.length)
    return interactions
  }

  /**
   * Extract sources cited in the response
   * Uses configured selectors to find all citation/link elements on page
   */
  extractSources(): Array<{source_title: string; source_url?: string}> {
    const sources: Array<{source_title: string; source_url?: string}> = []
    
    // Get configured citation selector - ChatGPT uses links and footnotes
    const linkSelector = this.selectors.citationElements || 'a[href],.group\\/nav-list a[href],button.group\\/footnote a[href]'
    
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
      
      // Extract title from element text
      let title = element.textContent?.trim()
      
      // Clean up title - remove extra whitespace and limit length
      if (title) {
        title = title.replace(/\s+/g, ' ').substring(0, 200)
      }
      
      if (!title) {
        title = element.getAttribute('title') || element.getAttribute('aria-label')
      }
      
      if (url && title && !visitedUrls.has(url)) {
        visitedUrls.add(url)
        sources.push({
          source_title: title,
          source_url: url
        })
      }
    })
    
    return sources
  }
}
