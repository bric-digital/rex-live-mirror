/**
 * Claude Parser
 * Extracts Q&A pairs from Claude interface
 */

export interface ParsedInteraction {
  type: 'question' | 'response'
  content: string
}

export class ClaudeParser {
  name = 'claude'

  extractInteractions(): ParsedInteraction[] {
    const interactions: ParsedInteraction[] = []

    // Claude uses specific message container classes
    const userMessages = document.querySelectorAll('[data-is-user="true"]')
    userMessages.forEach((msg) => {
      const content = msg.textContent?.trim()
      if (content) {
        interactions.push({
          type: 'question',
          content,
        })
      }
    })

    const assistantMessages = document.querySelectorAll('[data-is-user="false"]')
    assistantMessages.forEach((msg) => {
      const content = msg.textContent?.trim()
      if (content) {
        interactions.push({
          type: 'response',
          content,
        })
      }
    })

    // Fallback: Look for message divs
    if (interactions.length === 0) {
      const messageContainers = document.querySelectorAll('div[class*="text-base"]')
      messageContainers.forEach((container) => {
        const content = container.textContent?.trim()
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
