/**
 * Google Gemini Parser
 * Extracts Q&A pairs from Google Gemini interface
 */

export interface ParsedInteraction {
  type: 'question' | 'response'
  content: string
}

export interface GeminiSelectors {
  userMessage?: string
  assistantMessage?: string
}

export interface GeminiConfig {
  enabled?: boolean
  selectors?: GeminiSelectors
}

export class GeminiParser {
  name = 'gemini'
  private selectors: GeminiSelectors

  constructor(config?: GeminiConfig) {
    // Use config selectors or defaults
    this.selectors = config?.selectors || {
      userMessage: '[data-text-user-message]',
      assistantMessage: '[data-text-assistant-message]',
    }
    console.log('[GeminiParser] Initialized with selectors:', this.selectors)
  }

  extractInteractions(): ParsedInteraction[] {
    const interactions: ParsedInteraction[] = []

    // Find user messages using config selector
    if (this.selectors.userMessage) {
      const userMessages = document.querySelectorAll(this.selectors.userMessage)
      console.log(`[GeminiParser] Found ${userMessages.length} user message elements`)
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

    // Find assistant messages using config selector
    if (this.selectors.assistantMessage) {
      const assistantMessages = document.querySelectorAll(this.selectors.assistantMessage)
      console.log(`[GeminiParser] Found ${assistantMessages.length} assistant message elements`)
      assistantMessages.forEach((msg) => {
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
}
