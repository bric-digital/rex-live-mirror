/**
 * Perplexity.ai Parser
 * Extracts Q&A pairs from Perplexity chatbot interface
 */

export interface ParsedInteraction {
  type: 'question' | 'response'
  content: string
}

export interface SelectorValidation {
  valid: boolean
  questionsFound: number
  responsesFound: number
  suggestedQuestionContainer?: string
  suggestedResponseContainer?: string
}

export class PerplexityParser {
  name = 'perplexity'
  private selectors: any = {}

  constructor(selectors?: any) {
    if (selectors) {
      this.selectors = selectors
    }
  }

  /**
   * Validate current selectors and suggest improvements if DOM changed
   */
  validateSelectors(): SelectorValidation {
    const userQuestionSelector = this.selectors.userQuestion || 'h1[class*="group/query"] span.select-text'
    const assistantResponseSelector = this.selectors.assistantResponse || 'div[id^="markdown-content"]'

    const questionEl = document.querySelector(userQuestionSelector)
    const responseEl = document.querySelector(assistantResponseSelector)



    const validation: SelectorValidation = {
      valid: !!questionEl && !!responseEl,
      questionsFound: questionEl ? 1 : 0,
      responsesFound: responseEl ? 1 : 0
    }

    // If selectors still work, return success
    if (validation.valid) {
      return validation
    }

    // Selectors failed - try to find stable parent containers

    // Look for containers that hold both question and response
    const possibleContainers = document.querySelectorAll('[class*="conversation"], [class*="message"], [class*="chat"]')
    
    for (const container of possibleContainers) {
      // Look for question-like elements within this container
      const potentialQuestions = container.querySelectorAll('h1, [class*="query"], [class*="question"]')
      const potentialResponses = container.querySelectorAll('[class*="markdown"], [class*="response"], [class*="answer"]')

      if (potentialQuestions.length > 0 && potentialResponses.length > 0) {
        validation.suggestedQuestionContainer = container.className
        validation.suggestedResponseContainer = container.className
        break
      }
    }

    return validation
  }

  extractInteractions(): ParsedInteraction[] {
    const interactions: ParsedInteraction[] = []

    // Use configured selectors or defaults
    const userQuestionSelector = this.selectors.userQuestion || 'h1[class*="group/query"] span.select-text'
    const assistantResponseSelector = this.selectors.assistantResponse || 'div[id^="markdown-content"]'
    const messageContainerSelector = this.selectors.messageContainer || 'div[class*="group/message"]'

    // Instead of finding ALL questions, find the LAST question and LAST response
    // This matches news_eval_ai approach of scoping to containers
    
    // Get all message containers (each Q&A pair)
    const containers = document.querySelectorAll(messageContainerSelector)
    if (containers.length === 0) {
      console.log('[PDK-Parser] No message containers found')
      return interactions
    }

    // Get the LAST container (most recent Q&A)
    const lastContainer = containers[containers.length - 1]
    console.log('[PDK-Parser] Found', containers.length, 'containers, checking last one')

    // Extract question from LAST container only - get LAST matching element
    const questionEls = lastContainer.querySelectorAll(userQuestionSelector)
    const questionEl = questionEls.length > 0 ? questionEls[questionEls.length - 1] : null
    if (questionEl?.textContent?.trim()) {
      const qContent = questionEl.textContent.trim()
      interactions.push({
        type: 'question',
        content: qContent,
      })
      console.log('[PDK-Parser] Question from last container:', qContent.substring(0, 60))
    } else {
      console.log('[PDK-Parser] No question in last container')
    }

    // Extract answer from LAST container only - get LAST matching element
    const responseEls = lastContainer.querySelectorAll(assistantResponseSelector)
    const responseEl = responseEls.length > 0 ? responseEls[responseEls.length - 1] : null
    if (responseEl?.textContent?.trim()) {
      const aContent = responseEl.textContent.trim()
      interactions.push({
        type: 'response',
        content: aContent,
      })
      console.log('[PDK-Parser] Answer from last container:', aContent.substring(0, 60))
    } else {
      console.log('[PDK-Parser] No answer in last container')
    }

    return interactions
  }

  /**
   * Extract sources cited in the response
   * Uses configured selectors to find all citation elements on page
   */
  extractSources(): Array<{source_title: string; source_url?: string}> {
    const sources: Array<{source_title: string; source_url?: string}> = []
    
    // Get configured citation selector
    const citationSelector = this.selectors.citationElements || 'a[href*="http"], [data-pplx-citation-url]'
    
    // Find all citation elements on the page
    const citationElements = document.querySelectorAll(citationSelector)
    
    if (citationElements.length === 0) {
      return sources
    }
    
    const visitedUrls = new Set<string>()
    
    citationElements.forEach((element) => {
      // Get URL from data attribute or href
      const url = element.getAttribute('data-pplx-citation-url') || element.getAttribute('href')
      
      if (!url || url.startsWith('javascript:') || visitedUrls.has(url)) {
        return
      }
      
      // Extract title from element text
      let title = element.textContent?.trim()
      
      // Clean up title - remove extra whitespace and limit length
      if (title) {
        title = title.replace(/\s+/g, ' ').substring(0, 200)
      }
      
      if (!title) {
        title = element.getAttribute('title') || element.getAttribute('aria-label')
      }
      
      if (url && title && !visitedUrls.has(url)) {
        visitedUrls.add(url)
        sources.push({
          source_title: title,
          source_url: url
        })
      }
    })
    
    return sources
  }
}
