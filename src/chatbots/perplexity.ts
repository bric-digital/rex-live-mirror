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

  extractInteractions(): ParsedInteraction[] {
    const interactions: ParsedInteraction[] = []

    // Find all user messages
    const userMessages = document.querySelectorAll('[data-qa="user-message"]')
    userMessages.forEach((msg) => {
      const content = msg.textContent?.trim()
      if (content) {
        interactions.push({
          type: 'question',
          content,
        })
      }
    })

    // Find all bot responses
    const botResponses = document.querySelectorAll('[data-qa="bot-message"]')
    botResponses.forEach((msg) => {
      const content = msg.textContent?.trim()
      if (content) {
        interactions.push({
          type: 'response',
          content,
        })
      }
    })

    // Fallback: Look for message containers if data-qa attributes don't exist
    if (interactions.length === 0) {
      const messageContainers = document.querySelectorAll('[class*="message"]')
      messageContainers.forEach((container) => {
        const text = container.textContent?.trim()
        if (text && text.length > 10) {
          // Heuristic: if it's in an odd position, it's a user message
          interactions.push({
            type: 'question',
            content: text,
          })
        }
      })
    }

    return interactions
  }
}
