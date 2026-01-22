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
}
