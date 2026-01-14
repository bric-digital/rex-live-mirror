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

  extractInteractions(): ParsedInteraction[] {
    const interactions: ParsedInteraction[] = []

    // ChatGPT typically uses role-based divs
    const messages = document.querySelectorAll('[data-message-author-role]')
    messages.forEach((msg) => {
      const role = msg.getAttribute('data-message-author-role')
      const content = msg.textContent?.trim()

      if (content && content.length > 0) {
        interactions.push({
          type: role === 'user' ? 'question' : 'response',
          content,
        })
      }
    })

    // Fallback: Look for message groups
    if (interactions.length === 0) {
      const messageGroups = document.querySelectorAll('[data-testid="conversation-turn"]')
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

    return interactions
  }
}
