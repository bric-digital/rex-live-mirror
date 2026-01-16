/**
 * Perplexity.ai Parser
 * Extracts Q&A pairs from Perplexity chatbot interface
 */

export interface ParsedInteraction {
  type: 'question' | 'response'
  content: string
}

export class PerplexityParser {
  name = 'perplexity'
  private selectors: any = {}

  constructor(selectors?: any) {
    if (selectors) {
      this.selectors = selectors
    }
  }

  extractInteractions(): ParsedInteraction[] {
    const interactions: ParsedInteraction[] = []

    // Use configured selectors or defaults
    const userQuestionSelector = this.selectors.userQuestion || 'h1[class*="group/query"] span.select-text'
    const assistantResponseSelector = this.selectors.assistantResponse || 'div[id^="markdown-content"]'

    // Extract user question
    const questionEl = document.querySelector(userQuestionSelector)
    if (questionEl && questionEl.textContent?.trim()) {
      interactions.push({
        type: 'question',
        content: questionEl.textContent.trim(),
      })
      console.log('[PerplexityParser] Question extracted:', questionEl.textContent.trim().substring(0, 50) + '...')
    }

    // Extract assistant response
    const responseEl = document.querySelector(assistantResponseSelector)
    if (responseEl && responseEl.textContent?.trim()) {
      interactions.push({
        type: 'response',
        content: responseEl.textContent.trim(),
      })
      console.log('[PerplexityParser] Response extracted:', responseEl.textContent.trim().substring(0, 50) + '...')
    }

    // Fallback: if no results, try alternate selectors
    if (interactions.length === 0) {
      console.log('[PerplexityParser] No messages found with primary selectors, trying fallbacks...')
      
      // Try to find any user message element
      const userMsgs = document.querySelectorAll('[class*="user"], [data-qa*="user"]')
      userMsgs.forEach((msg) => {
        const content = msg.textContent?.trim()
        if (content && content.length > 10) {
          interactions.push({
            type: 'question',
            content,
          })
        }
      })
    }

    return interactions
  }
}
