/**
 * ChatGPT Content Script
 * Runs on ChatGPT pages to detect and capture chat interactions
 */

import { ChatGPTParser } from '@bric/webmunk-live-mirror/chatbots/chatgpt'

console.log('[ChatGPT Content] Script loaded on', window.location.href)

let config: any = null
let parser: ChatGPTParser | null = null
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
    hash = hash & hash // Convert to 32bit integer
  }
  return Math.abs(hash).toString(36)
}

/**
 * Initialize capture on page load
 */
async function initializeCapture() {
  try {
    console.log('[ChatGPT Content] ========== STARTING INITIALIZATION ==========')
    console.log('[ChatGPT Content] Page URL:', window.location.href)
    console.log('[ChatGPT Content] Initializing capture...')

    // Always fetch fresh configuration from storage (will be updated by service worker)
    const stored = await new Promise<any>((resolve) => {
      chrome.storage.local.get('webmunkConfiguration', (result) => {
        resolve(result.webmunkConfiguration || {})
      })
    })

    config = stored
    const llmCaptureConfig = config.llm_capture || {}
    
    // Check if LLM capture is enabled globally
    if (!llmCaptureConfig.enabled) {
      console.log('[ChatGPT Content] LLM capture not enabled in config')
      return
    }

    console.log('[ChatGPT Content] Config loaded:', llmCaptureConfig)

    // Get platform-specific selectors from platforms.chatgpt
    const platformConfig = llmCaptureConfig.platforms?.chatgpt
    if (!platformConfig) {
      console.error('[ChatGPT Content] No platform configuration found')
      await logPDKEvent('llm-selector-validation-error', {
        platform: 'chatgpt',
        issue: 'platform_config_missing',
        received_config: llmCaptureConfig,
        timestamp: Date.now()
      })
      return
    }

    // Check if ChatGPT capture is enabled
    if (!platformConfig.enabled) {
      console.log('[ChatGPT Content] ChatGPT capture not enabled')
      return
    }

    const selectors = platformConfig.selectors
    if (!selectors || Object.keys(selectors).length === 0) {
      console.error('[ChatGPT Content] No selectors configured')
      await logPDKEvent('llm-selector-validation-error', {
        platform: 'chatgpt',
        issue: 'selectors_missing_or_invalid',
        received_config: llmCaptureConfig,
        timestamp: Date.now()
      })
      return
    }

    parser = new ChatGPTParser(selectors)
    console.log('[ChatGPT Content] Parser initialized with selectors')

    const isLoggedIn = checkLoginState(config)
    console.log('[ChatGPT Content] Login state:', isLoggedIn ? 'logged-in' : 'logged-out')

    setupMessageObserver(config)
    setupHealthChecks(config)

    captureEnabled = true
    console.log('[ChatGPT Content] Capture initialized successfully')
  } catch (error) {
    console.error('[ChatGPT Content] Error initializing capture:', error)
    await logPDKEvent('llm-capture-init-error', {
      platform: 'chatgpt',
      error_message: (error as any).message,
      timestamp: Date.now()
    })
  }
}

/**
 * Check if user is logged in
 */
function checkLoginState(config: any): boolean {
  const llmCaptureConfig = config.llm_capture || {}
  const platformConfig = llmCaptureConfig.platforms?.chatgpt || {}
  const loginDetection = platformConfig.login_detection || {}
  const loggedInSelector = loginDetection.loggedInSelector
  const loggedOutSelector = loginDetection.loggedOutSelector

  const hasProfileBtn = loggedInSelector ? document.querySelector(loggedInSelector) : null
  const hasLoginBtn = loggedOutSelector ? document.querySelector(loggedOutSelector) : null

  return !!hasProfileBtn && !hasLoginBtn
}

/**
 * Setup observer for live messages
 */
function setupMessageObserver(configObj: any) {
  const llmCaptureConfig = configObj.llm_capture || {}
  const platformConfig = llmCaptureConfig.platforms?.chatgpt || {}
  const messageContainerSelector = platformConfig.selectors?.messageContainer
  if (!messageContainerSelector) {
    console.error('[ChatGPT Content] messageContainer selector missing')
    return
  }

  console.log('[ChatGPT Content] Using messageContainer selector:', messageContainerSelector)
  const allMatches = document.querySelectorAll(messageContainerSelector)
  console.log('[ChatGPT Content] Selector matches:', allMatches.length, 'elements')
  
  // Seed the hash set with existing messages so we don't send them as "new"
  if (parser) {
    const existingMessages = parser.extractInteractions()
    existingMessages.forEach((msg) => {
      sentMessageHashes.add(hashMessage(msg.content))
    })
    console.log(`[ChatGPT Content] Seeded ${existingMessages.length} existing messages - only NEW ones will be captured`)
  }
  
  // Log some sample DOM to help debug
  const sampleElements = document.querySelectorAll('[data-testid*="conversation"], [data-message*=""], main, [role="main"]')
  console.log('[ChatGPT Content] Sample DOM elements found:', sampleElements.length)
  if (sampleElements.length > 0) {
    console.log('[ChatGPT Content] Sample element:', sampleElements[0].tagName, sampleElements[0].className, sampleElements[0].id)
  }

  const container = document.querySelector(messageContainerSelector)
  if (!container) {
    console.warn('[ChatGPT Content] Message container not found yet')
    console.warn('[ChatGPT Content] Tried selector:', messageContainerSelector)
    return
  }

  observer = new MutationObserver((mutations) => {
    if (!parser || !captureEnabled) {
      console.log('[ChatGPT Content] Observer triggered but capture disabled or parser missing')
      return
    }

    console.log('[ChatGPT Content] MutationObserver triggered -', mutations.length, 'mutations')

    if (mutationDebounceTimer) {
      window.clearTimeout(mutationDebounceTimer)
    }

    mutationDebounceTimer = window.setTimeout(() => {
      try {
        const allMessages = parser!.extractInteractions()
        console.log('[ChatGPT Content] extractInteractions() returned:', allMessages.length, 'messages')
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
          console.log('[ChatGPT Content] New question detected - sending previous Q&A pair first')
          // Send pending pair immediately
          const pairToSend = [...pendingQAPair]
          chrome.runtime.sendMessage(
            {
              messageType: 'llmMessageCapture',
              platform: 'chatgpt',
              messages: pairToSend,
              url: window.location.href,
              timestamp: Date.now(),
              metadata: {
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

        // Clean up: keep only the latest question and response
        // Find the last question
        let lastQuestionIdx = -1
        for (let i = pendingQAPair.length - 1; i >= 0; i--) {
          if (pendingQAPair[i].type === 'question') {
            lastQuestionIdx = i
            break
          }
        }
        
        // If we have multiple questions, keep only the latest one and remove earlier ones
        if (lastQuestionIdx > 0) {
          pendingQAPair = pendingQAPair.slice(lastQuestionIdx)
        }
        
        // Find the last response after the last question
        let lastResponseIdx = -1
        for (let i = pendingQAPair.length - 1; i > lastQuestionIdx; i--) {
          if (pendingQAPair[i].type === 'response') {
            lastResponseIdx = i
            break
          }
        }
        
        // If we have multiple responses, keep only the latest one
        if (lastResponseIdx > -1 && lastResponseIdx < pendingQAPair.length - 1) {
          pendingQAPair = [
            pendingQAPair[lastQuestionIdx],
            pendingQAPair[lastResponseIdx]
          ]
        }

        // Check if we have a complete Q&A pair (last message is a response)
        const lastMsg = pendingQAPair[pendingQAPair.length - 1]
        console.log('[ChatGPT Content] Current pending Q&A pair status:', {
          pairLength: pendingQAPair.length,
          lastMsgType: lastMsg?.type,
          newMsgCount: newMessages.length,
          messages: pendingQAPair.map(m => ({ type: m.type, len: m.content?.length }))
        })
        
        if (lastMsg?.type === 'response') {
          // Response detected - wait a bit more for it to finish streaming
          lastResponseTime = Date.now()
          
          if (responseCompleteTimer) {
            window.clearTimeout(responseCompleteTimer)
          }
          
          responseCompleteTimer = window.setTimeout(() => {
            // Response has stopped updating - send the complete Q&A pair
            if (pendingQAPair.length > 0) {
              const pairToSend = [...pendingQAPair]
              
              console.log('[ChatGPT Content] Response stream complete - sending Q&A pair with', pairToSend.length, 'messages')
              
              // Log the Q&A pair
              pairToSend.forEach((msg) => {
                if (msg.type === 'question') {
                  console.log('[ChatGPT Content] Q:', msg.content.substring(0, 50) + '...')
                } else {
                  console.log('[ChatGPT Content] A:', msg.content.substring(0, 50) + '...')
                }
              })

              console.log(`[ChatGPT Content] Sending complete Q&A pair to PDK (${pairToSend.length} messages)`)

              // Bundle Q&A pair into a structured content object
              const question = pairToSend.find(m => m.type === 'question')
              const response = pairToSend.find(m => m.type === 'response')
              
              // Extract sources from the response (ChatGPT citations/references)
              const sourceMap = new Map<string, { source_title: string; source_url: string }>()
              const sourceElements = document.querySelectorAll('[data-testid*="citation"], a[href*="source"], [class*="source"]')
              sourceElements.forEach((el) => {
                const title = el.getAttribute('title') || el.textContent?.trim() || ''
                const url = el.getAttribute('href') || ''
                if (title && url) {
                  // Use title+url as key to ensure uniqueness
                  const key = `${title}||${url}`
                  sourceMap.set(key, {
                    source_title: title,
                    source_url: url
                  })
                }
              })
              
              // Convert Map to array of unique sources (no duplicates)
              const sources = Array.from(sourceMap.values())
              
              const qaPayload = {
                content: {
                  user: question?.content || '',
                  assistant: response?.content || '',
                  sources: sources
                },
                url: window.location.href,
                timestamp: Date.now(),
                isLoggedIn: checkLoginState(config),
                messageCount: pairToSend.length
              }

              chrome.runtime.sendMessage(
                {
                  messageType: 'llmMessageCapture',
                  platform: 'chatgpt',
                  payload: qaPayload,
                  url: window.location.href,
                  timestamp: Date.now(),
                  metadata: {
                    isLoggedIn: checkLoginState(config)
                  }
                },
                (response?: any) => {
                  if (response?.success) {
                    console.log('[ChatGPT Content] Q&A pair sent to PDK successfully')
                  } else {
                    console.error('[ChatGPT Content] Failed to send Q&A pair:', response?.error)
                  }
                }
              )

              // Clear pending pair and hashes for next Q&A
              pendingQAPair = []
              sentMessageHashes.clear()
              console.log('[ChatGPT Content] Cleared state for next Q&A pair')
            }
          }, config.llm_capture?.transmission_interval_ms || 60000)
        }
      } catch (error) {
        console.error('[ChatGPT Content] Observer error:', error)
        logPDKEvent('llm-observer-error', {
          platform: 'chatgpt',
          error_message: (error as any).message,
          timestamp: Date.now()
        })
      }
    }, 300)
  })

  observer.observe(container, {
    childList: true,
    subtree: true,
    characterData: true
  })

  console.log('[ChatGPT Content] Message observer started')
}

/**
 * Setup periodic health checks
 */
function setupHealthChecks(configObj: any) {
  const llmCaptureConfig = configObj.llm_capture || {}
  setInterval(() => {
    if (!captureEnabled) return

    // Check if thread container exists
    const threadContainer = document.querySelector('#thread')
    if (!threadContainer) {
      console.warn('[ChatGPT Content] Thread container (#thread) not found')
      logPDKEvent('llm-container-missing', {
        platform: 'chatgpt',
        selector: '#thread',
        timestamp: Date.now()
      })
      return
    }

    // Check if individual messages exist
    const messages = document.querySelectorAll('[data-message-author-role]')
    if (messages.length === 0) {
      console.warn('[ChatGPT Content] No messages found in thread')
      logPDKEvent('llm-messages-missing', {
        platform: 'chatgpt',
        selector: '[data-message-author-role]',
        timestamp: Date.now()
      })
    } else {
      console.log(`[ChatGPT Content] Health check passed: ${messages.length} messages found`)
    }
  }, 30000)

  console.log('[ChatGPT Content] Health checks started')
}

/**
 * Log event to PDK via service worker
 */
async function logPDKEvent(eventName: string, data: any) {
  chrome.runtime.sendMessage({
    messageType: 'pdkEvent',
    eventName,
    data
  })
}

/**
 * Initialize when DOM is ready
 */
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeCapture)
} else {
  initializeCapture()
}

/**
 * Handle storage changes - reinitialize if config updates
 */
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'local' && 'webmunkConfiguration' in changes) {
    console.log('[ChatGPT Content] Configuration updated in storage, reinitializing...')
    // Reset state
    observer?.disconnect()
    parser = null
    captureEnabled = false
    config = null
    // Reinitialize with new config
    initializeCapture()
  }
})

/**
 * Handle messages from service worker
 */
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  try {
    if (message.messageType === 'checkLoginState') {
      if (!config) {
        sendResponse({ isLoggedIn: false, reason: 'config_not_loaded' })
        return
      }

      const llmCaptureConfig = config.llm_capture || {}
      const platformConfig = llmCaptureConfig.platforms?.chatgpt || {}
      const loginDetection = platformConfig.login_detection || {}

      const loggedInSelector = loginDetection.loggedInSelector
      const loggedOutSelector = loginDetection.loggedOutSelector

      const isLoggedIn =
        !!document.querySelector(loggedInSelector) &&
        !document.querySelector(loggedOutSelector)

      sendResponse({ isLoggedIn })
      return
    }

    if (message.messageType === 'captureMessagesFromTab') {
      if (!parser || !captureEnabled) {
        sendResponse({ success: false, error: 'Parser not initialized' })
        return
      }

      const messages = parser.extractInteractions()
      sendResponse({
        success: true,
        data: {
          messages,
          timestamp: new Date().toISOString()
        }
      })
    }
  } catch (error) {
    console.error('[ChatGPT Content] onMessage error:', error)
    sendResponse({ success: false, error: (error as any).message })
  }
})
