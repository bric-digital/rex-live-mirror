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

/**
 * Initialize capture on page load
 */
async function initializeCapture() {
  try {
    console.log('[ChatGPT Content] Initializing capture...')

    // Always fetch fresh configuration from storage (will be updated by service worker)
    const stored = await new Promise<any>((resolve) => {
      chrome.storage.local.get('webmunkConfiguration', (result) => {
        resolve(result.webmunkConfiguration || {})
      })
    })

    config = stored
    const chatgptConfig = config.llm_capture?.platforms?.chatgpt

    if (!chatgptConfig?.enabled) {
      console.log('[ChatGPT Content] ChatGPT capture not enabled in config')
      return
    }

    console.log('[ChatGPT Content] Config loaded:', chatgptConfig)

    const selectors = chatgptConfig.selectors
    if (!selectors || Object.keys(selectors).length === 0) {
      console.error('[ChatGPT Content] No selectors configured')
      await logPDKEvent('llm-selector-validation-error', {
        platform: 'chatgpt',
        issue: 'selectors_missing_or_invalid',
        received_config: chatgptConfig,
        timestamp: Date.now()
      })
      return
    }

    parser = new ChatGPTParser()
    console.log('[ChatGPT Content] Parser initialized')

    const isLoggedIn = checkLoginState(chatgptConfig)
    console.log('[ChatGPT Content] Login state:', isLoggedIn ? 'logged-in' : 'logged-out')

    setupMessageObserver(chatgptConfig)
    setupHealthChecks(chatgptConfig)

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
    console.error('[ChatGPT Content] messageContainer selector missing')
    return
  }

  console.log('[ChatGPT Content] Using messageContainer selector:', messageContainerSelector)
  const allMatches = document.querySelectorAll(messageContainerSelector)
  console.log('[ChatGPT Content] Selector matches:', allMatches.length, 'elements')
  
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

  observer = new MutationObserver(() => {
    if (!parser || !captureEnabled) return

    if (mutationDebounceTimer) {
      window.clearTimeout(mutationDebounceTimer)
    }

    mutationDebounceTimer = window.setTimeout(() => {
      try {
        const messages = parser!.extractInteractions()
        if (!messages.length) return

        // Log a sample of questions and answers (not all)
        const sample = messages.slice(0, 2) // log up to 2 per mutation
        sample.forEach((msg, idx) => {
          if (msg.type === 'question') {
            console.log(`[ChatGPT Q${idx + 1}]`, msg.content)
          } else if (msg.type === 'response') {
            console.log(`[ChatGPT A${idx + 1}]`, msg.content)
          }
        })

        console.log(`[ChatGPT Content] Detected ${messages.length} messages`)

        chrome.runtime.sendMessage(
          {
            messageType: 'llmMessageCapture',
            platform: 'chatgpt',
            messages,
            url: window.location.href,
            timestamp: Date.now(),
            metadata: {
              isLoggedIn: checkLoginState(config)
            }
          },
          (response?: any) => {
            if (!response?.success) {
              console.error('[ChatGPT Content] Failed to send messages:', response?.error)
            }
          }
        )
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
function setupHealthChecks(config: any) {
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

      const chatgptConfig = config.llm_capture?.platforms?.chatgpt
      const loginDetection = chatgptConfig?.login_detection || {}

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
