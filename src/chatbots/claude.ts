/**
 * Claude Parser
 * Extracts Q&A pairs from Claude interface
 */

export interface ParsedInteraction {
  type: 'question' | 'response'
  content: string
}

export interface ClaudeSelectors {
  userMessage?: string
  assistantMessage?: string
}

export interface ClaudeConfig {
  enabled?: boolean
  selectors?: ClaudeSelectors
}

export class ClaudeParser {
  name = 'claude'
  private selectors: ClaudeSelectors

  constructor(config?: ClaudeConfig) {
    // Use config selectors or defaults
    this.selectors = config?.selectors || {
      userMessage: '[data-is-user="true"]',
      assistantMessage: '[data-is-user="false"]',
    }
    console.log('[ClaudeParser] Initialized with selectors:', this.selectors)
  }

  extractInteractions(): ParsedInteraction[] {
    const interactions: ParsedInteraction[] = []

    // Find user messages using config selector
    if (this.selectors.userMessage) {
      const userMessages = document.querySelectorAll(this.selectors.userMessage)
      console.log(`[ClaudeParser] Found ${userMessages.length} user message elements`)
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
      console.log(`[ClaudeParser] Found ${assistantMessages.length} assistant message elements`)
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
