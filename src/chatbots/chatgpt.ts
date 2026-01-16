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
}
