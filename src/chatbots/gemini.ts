/**
 * Google Gemini Parser
 * Extracts Q&A pairs from Google Gemini interface
 */

export interface ParsedInteraction {
  type: 'question' | 'response'
  content: string
}

export class GeminiParser {
  name = 'gemini'

  extractInteractions(): ParsedInteraction[] {
    const interactions: ParsedInteraction[] = []

    // Gemini typically uses message containers with specific classes
    const userMessages = document.querySelectorAll('[data-text-user-message]')
    userMessages.forEach((msg) => {
      const content = msg.textContent?.trim()
      if (content) {
        interactions.push({
          type: 'question',
          content,
        })
      }
    })

    const assistantMessages = document.querySelectorAll('[data-text-assistant-message]')
    assistantMessages.forEach((msg) => {
      const content = msg.textContent?.trim()
      if (content) {
        interactions.push({
          type: 'response',
          content,
        })
      }
    })

    // Fallback: Look for message divs with class patterns
    if (interactions.length === 0) {
      const allMessages = document.querySelectorAll('div[class*="message"]')
      allMessages.forEach((msg) => {
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
