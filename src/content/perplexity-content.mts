/**
 * Perplexity Content Script
 * Runs on Perplexity pages to detect and capture chat interactions
 * Mirrors ChatGPT implementation with Perplexity-specific selectors
 */

import { PerplexityParser } from '@bric/webmunk-live-mirror/chatbots/perplexity'

console.log('[Perplexity Content] Script loaded on', window.location.href)

let config: any = null
let parser: PerplexityParser | null = null
let captureEnabled = false
let observer: MutationObserver | null = null
let mutationDebounceTimer: number | null = null
let sentMessageHashes: Set<string> = new Set()
let pendingQAPair: any[] = []
let lastResponseTime: number = 0
let responseCompleteTimer: number | null = null

/**
 * Generate a simple hash of message content for deduplication
 */
function hashMessage(msg: string): string {
  let hash = 0
  for (let i = 0; i < msg.length; i++) {
    const char = msg.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash
  }
  return Math.abs(hash).toString(36)
}

/**
 * Initialize capture on page load
 */
async function initializeCapture() {
  try {
    console.log('[Perplexity Content] ========== STARTING INITIALIZATION ==========')
    console.log('[Perplexity Content] Page URL:', window.location.href)
    console.log('[Perplexity Content] Initializing capture...')

    // Load configuration from storage
    const stored = await new Promise<any>((resolve) => {
      chrome.storage.local.get('webmunkConfiguration', (result) => {
        resolve(result.webmunkConfiguration || {})
      })
    })

    config = stored
    const perplexityConfig = config.llm_capture?.platforms?.perplexity

    if (!perplexityConfig?.enabled) {
      console.log('[Perplexity Content] Perplexity capture not enabled in config')
      return
    }

    console.log('[Perplexity Content] Config loaded:', perplexityConfig)

    const selectors = perplexityConfig.selectors
    if (!selectors || Object.keys(selectors).length === 0) {
      console.error('[Perplexity Content] No selectors configured')
      return
    }

    parser = new PerplexityParser(selectors)
    console.log('[Perplexity Content] Parser initialized with selectors')

    const isLoggedIn = checkLoginState(perplexityConfig)
    console.log('[Perplexity Content] Login state:', isLoggedIn ? 'logged-in' : 'logged-out')

    setupMessageObserver(perplexityConfig)

    captureEnabled = true
    console.log('[Perplexity Content] Capture initialized successfully')
  } catch (error) {
    console.error('[Perplexity Content] Error initializing capture:', error)
  }
}

/**
 * Check if user is logged in
 */
function checkLoginState(config: any): boolean {
  const loginDetection = config.login_detection || {}
  const loggedInSelector = loginDetection.loggedInSelector
  const loggedOutSelector = loginDetection.loggedOutSelector

  const hasProfileBtn = loggedInSelector ? document.querySelector(loggedInSelector) : null
  const hasLoginBtn = loggedOutSelector ? document.querySelector(loggedOutSelector) : null

  return !!hasProfileBtn && !hasLoginBtn
}

/**
 * Setup observer for live messages
 */
function setupMessageObserver(config: any) {
  const messageContainerSelector = config.selectors?.messageContainer
  if (!messageContainerSelector) {
    console.error('[Perplexity Content] messageContainer selector missing')
    return
  }

  console.log('[Perplexity Content] Using messageContainer selector:', messageContainerSelector)
  const container = document.querySelector(messageContainerSelector)
  
  if (!container) {
    console.warn('[Perplexity Content] Message container not found yet')
    return
  }

  // Seed the hash set with existing messages
  if (parser) {
    const existingMessages = parser.extractInteractions()
    existingMessages.forEach((msg) => {
      sentMessageHashes.add(hashMessage(msg.content))
    })
    console.log(`[Perplexity Content] Seeded ${existingMessages.length} existing messages`)
  }

  observer = new MutationObserver((mutations) => {
    if (!parser || !captureEnabled) {
      return
    }

    console.log('[Perplexity Content] MutationObserver triggered -', mutations.length, 'mutations')

    if (mutationDebounceTimer) {
      window.clearTimeout(mutationDebounceTimer)
    }

    mutationDebounceTimer = window.setTimeout(() => {
      try {
        const allMessages = parser!.extractInteractions()
        console.log('[Perplexity Content] extractInteractions() returned:', allMessages.length, 'messages')
        if (!allMessages.length) return

        // Find NEW messages
        const newMessages = allMessages.filter((msg) => {
          const hash = hashMessage(msg.content)
          if (!sentMessageHashes.has(hash)) {
            sentMessageHashes.add(hash)
            return true
          }
          return false
        })

        if (!newMessages.length) return

        // If we're starting a new question while waiting for response, send pending pair first
        const hasNewQuestion = newMessages.some(msg => msg.type === 'question')
        if (hasNewQuestion && pendingQAPair.length > 0 && pendingQAPair.some(msg => msg.type === 'response')) {
          console.log('[Perplexity Content] New question detected - sending previous Q&A pair first')
          const pairToSend = [...pendingQAPair]
          chrome.runtime.sendMessage(
            {
              messageType: 'llmMessageCapture',
              platform: 'perplexity',
              payload: {
                content: {
                  user: pairToSend.find(m => m.type === 'question')?.content || '',
                  assistant: pairToSend.find(m => m.type === 'response')?.content || '',
                  sources: []
                },
                url: window.location.href,
                timestamp: Date.now(),
                isLoggedIn: checkLoginState(config)
              }
            }
          )
          pendingQAPair = []
          if (responseCompleteTimer) {
            window.clearTimeout(responseCompleteTimer)
            responseCompleteTimer = null
          }
        }

        // Add new messages to pending Q&A pair
        pendingQAPair.push(...newMessages)

        // Keep only latest question and response
        let lastQuestionIdx = -1
        for (let i = pendingQAPair.length - 1; i >= 0; i--) {
          if (pendingQAPair[i].type === 'question') {
            lastQuestionIdx = i
            break
          }
        }
        
        if (lastQuestionIdx > 0) {
          pendingQAPair = pendingQAPair.slice(lastQuestionIdx)
        }
        
        let lastResponseIdx = -1
        for (let i = pendingQAPair.length - 1; i > lastQuestionIdx; i--) {
          if (pendingQAPair[i].type === 'response') {
            lastResponseIdx = i
            break
          }
        }
        
        if (lastResponseIdx > -1 && lastResponseIdx < pendingQAPair.length - 1) {
          pendingQAPair = [
            pendingQAPair[lastQuestionIdx],
            pendingQAPair[lastResponseIdx]
          ]
        }

        // Check if we have a complete Q&A pair
        const lastMsg = pendingQAPair[pendingQAPair.length - 1]
        console.log('[Perplexity Content] Current pending Q&A pair status:', {
          pairLength: pendingQAPair.length,
          lastMsgType: lastMsg?.type,
          newMsgCount: newMessages.length
        })
        
        if (lastMsg?.type === 'response') {
          // Response detected - wait for streaming to complete
          lastResponseTime = Date.now()
          
          if (responseCompleteTimer) {
            window.clearTimeout(responseCompleteTimer)
          }
          
          responseCompleteTimer = window.setTimeout(() => {
            // Response stream complete - send Q&A pair
            if (pendingQAPair.length > 0) {
              const pairToSend = [...pendingQAPair]
              
              console.log('[Perplexity Content] Response stream complete - sending Q&A pair with', pairToSend.length, 'messages')
              
              const question = pairToSend.find(m => m.type === 'question')
              const response = pairToSend.find(m => m.type === 'response')
              
              const qaPayload = {
                content: {
                  user: question?.content || '',
                  assistant: response?.content || '',
                  sources: []
                },
                url: window.location.href,
                timestamp: Date.now(),
                isLoggedIn: checkLoginState(config),
                messageCount: pairToSend.length
              }

              console.log(`[Perplexity Content] Sending complete Q&A pair to PDK (${pairToSend.length} messages)`)

              chrome.runtime.sendMessage(
                {
                  messageType: 'llmMessageCapture',
                  platform: 'perplexity',
                  payload: qaPayload
                }
              )
              
              pendingQAPair = []
            }
          }, config.llm_capture?.transmission_interval_ms || 1500)
        }
      } catch (error) {
        console.error('[Perplexity Content] Error processing messages:', error)
      }
    }, 500)
  })

  observer.observe(container, {
    childList: true,
    subtree: true,
    characterData: true,
  })

  console.log('[Perplexity Content] Observer attached to container')
}

// Initialize on page load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeCapture)
} else {
  initializeCapture()
}

// Re-initialize if navigation happens
window.addEventListener('hashchange', initializeCapture)
