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
}
