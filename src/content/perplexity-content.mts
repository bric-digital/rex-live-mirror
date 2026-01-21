/**
 * Perplexity Content Script - Transaction-Based Tracking
 * Uses transaction log instead of hashing for deduplication
 * Transmits immediately instead of waiting for streaming to complete
 */

import { PerplexityParser } from '@bric/webmunk-live-mirror/chatbots/perplexity'

console.log('[Perplexity Content] Script loaded on', window.location.href)

let config: any = null
let parser: PerplexityParser | null = null
let captureEnabled = false
let observer: MutationObserver | null = null
let lastObservedContainer: Element | null = null
let mutationDebounceTimer: number | null = null
let currentlySendingQuestion: string = ''  // Track question being sent to prevent concurrent sends
let lastTrackedQAPair: { question: string; response: string } = { question: '', response: '' }  // Track complete Q&A pair
let processedResponseButtons = new Set<Element>()  // Track button elements we've already processed (unique per response)
let seenSourceUrls = new Set<string>()  // Track all sources seen so far to deduplicate across questions

/**
 * Transaction object for tracking Q&A captures
 */
interface PerplexityTransaction {
  id: string                          // Unique identifier
  questionText: string                // The question asked
  responsePreview: string             // First 150 chars of response
  status: 'pending' | 'sent' | 'failed'
  createdAt: number                   // When question detected
  sentAt?: number                     // When transmitted to PDK
  pdkBundleId?: string                // PDK bundle ID if successful
  retryCount: number
  error?: string
}

// Memory cache: Quick lookup for current session
const sentTransactions = new Map<string, PerplexityTransaction>()

/**
 * Check if question already sent (memory cache only - fast)
 */
function isQuestionSentInSession(questionText: string): boolean {
  const tx = sentTransactions.get(questionText)
  return tx?.status === 'sent' || tx?.status === 'pending'
}

/**
 * Record transaction to both memory and persistent storage
 */
async function recordTransaction(tx: PerplexityTransaction): Promise<void> {
  // Update memory
  sentTransactions.set(tx.questionText, tx)
  
  // Update persistent
  return new Promise((resolve) => {
    chrome.storage.local.get(['perplexity_transactions'], (result) => {
      const persistent: PerplexityTransaction[] = result.perplexity_transactions || []
      
      // Find and update existing, or add new (keep only last 100)
      const updated = persistent.filter(t => t.questionText !== tx.questionText)
      updated.unshift(tx)
      const trimmed = updated.slice(0, 100)
      
      chrome.storage.local.set({ perplexity_transactions: trimmed }, () => {
        console.log('[PDK-Tx] Recorded transaction:', tx.id, 'status:', tx.status)
        resolve()
      })
    })
  })
}

/**
 * Load persistent transactions on startup
 */
async function loadPersistentTransactions(): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.get(['perplexity_transactions'], (result) => {
      const persistent: PerplexityTransaction[] = result.perplexity_transactions || []
      
      // Load into memory cache
      persistent.forEach(tx => {
        sentTransactions.set(tx.questionText, tx)
      })
      
      console.log('[PDK-Tx] Loaded', persistent.length, 'persistent transactions')
      resolve()
    })
  })
}

/**
 * Initialize capture on page load
 */
async function initializeCapture() {
  try {
    // Load configuration from storage (set by service worker)
    const stored = await new Promise<any>((resolve) => {
      chrome.storage.local.get('webmunkConfiguration', (result) => {
        resolve(result.webmunkConfiguration || {})
      })
    })

    config = stored
    const llmCaptureConfig = config.llm_capture || {}
    
    // Load persistent transaction history
    await loadPersistentTransactions()
    
    // Check if LLM capture is enabled globally
    if (!llmCaptureConfig.enabled) {
      console.log('[PDK-Perplexity] LLM capture disabled')
      return
    }

    // Get platform-specific selectors from platforms.perplexity
    const platformConfig = llmCaptureConfig.platforms?.perplexity
    if (!platformConfig || !platformConfig.enabled) {
      console.log('[PDK-Perplexity] Perplexity capture disabled')
      return
    }

    const selectors = platformConfig.selectors
    if (!selectors || Object.keys(selectors).length === 0) {
      console.error('[PDK-Perplexity] No selectors configured')
      return
    }

    parser = new PerplexityParser(selectors)
    setupMessageObserver(config)
    captureEnabled = true
    console.log('[PDK-Perplexity] ✅ Ready to capture (transaction-based)')
  } catch (error) {
    console.error('[PDK-Perplexity] Init error:', error)
  }
}

/**
 * Check if user is logged in
 */
function checkLoginState(config: any): boolean {
  const llmCaptureConfig = config.llm_capture || {}
  const platformConfig = llmCaptureConfig.platforms?.perplexity || {}
  const loginDetection = platformConfig.login_detection || {}
  const loggedInSelector = loginDetection.loggedInSelector
  const loggedOutSelector = loginDetection.loggedOutSelector

  const hasProfileBtn = loggedInSelector ? document.querySelector(loggedInSelector) : null
  const hasLoginBtn = loggedOutSelector ? document.querySelector(loggedOutSelector) : null

  return !!hasProfileBtn && !hasLoginBtn
}

/**
 * Setup observer for live messages - Transaction-based tracking
 * Uses parser which loads selectors from backend config
 */
function setupMessageObserver(configObj: any) {
  // All selectors come from backend config via parser
  if (!parser) {
    console.error('[PDK-Tx] Parser not initialized - cannot setup observer')
    return
  }

  const llmCaptureConfig = configObj.llm_capture || {}
  const platformConfig = llmCaptureConfig.platforms?.perplexity || {}
  const messageContainerSelector = platformConfig.selectors?.messageContainer
  // Read transmission interval from config (controls debounce for streaming completion)
  const transmissionIntervalMs = llmCaptureConfig.transmission_interval_ms || 2500
  
  if (!messageContainerSelector) {
    console.error('[PDK-Tx] messageContainer selector not provided in config')
    return
  }

  const container = document.querySelector(messageContainerSelector)
  if (!container) {
    console.warn('[PDK-Tx] Container not found in DOM')
    return
  }

  observer = new MutationObserver(() => {
    if (!parser || !captureEnabled) {
      return
    }

    if (mutationDebounceTimer) {
      window.clearTimeout(mutationDebounceTimer)
    }

    // Debounce mutations (500ms for fast button detection)
    mutationDebounceTimer = window.setTimeout(async () => {
      try {
        // Use parser to extract interactions (all selectors from backend config)
        const interactions = parser.extractInteractions()
        if (!interactions.length) {
          return
        }

        // Get question and response from interactions
        const questionInteraction = interactions.find(i => i.type === 'question')
        const responseInteraction = interactions.find(i => i.type === 'response')
        
        if (!questionInteraction) {
          return
        }

        const questionText = questionInteraction.content.trim()
        const responseText = responseInteraction?.content?.trim() || ''

        if (!questionText) {
          return
        }

        // TRIGGER: Check for action buttons (Share, Copy) that appear ONLY after response is complete
        // Each button element is unique per Q&A pair - use this for automatic deduplication
        // Get LAST button (most recent Q&A) - multiple responses may be visible on page
        const shareButtons = document.querySelectorAll('button[aria-label="Share"]')
        const copyButtons = document.querySelectorAll('button[aria-label="Copy"]')
        
        const lastShareButton = shareButtons.length > 0 ? shareButtons[shareButtons.length - 1] : null
        const lastCopyButton = copyButtons.length > 0 ? copyButtons[copyButtons.length - 1] : null
        
        // Use last Share button as primary marker, fallback to last Copy button
        const responseButton = lastShareButton || lastCopyButton

        // Check if this is a NEW button element (not in our processed set)
        if (responseButton && !processedResponseButtons.has(responseButton) && responseText.length > 0) {
          console.log(`[PDK-Tx] NEW response detected! Button element is unique (new Q&A pair)`)
          
          // Mark this button element as processed
          processedResponseButtons.add(responseButton)
          
          // Store the complete Q&A pair at this moment
          lastTrackedQAPair = {
            question: questionText,
            response: responseText
          }

          // Check if already sent (content-based dedup as safety)
          if (!isQuestionSentInSession(questionText)) {
            console.log(`[PDK-Tx] Button detected - sending Q&A pair after 2s debounce...`)
            
            // 2 second debounce to let response fully settle before sending
            window.setTimeout(async () => {
              console.log(`[PDK-Tx] 2s debounce complete - sending Q&A to PDK`)
              await sendQuestionToPDK(lastTrackedQAPair.question, lastTrackedQAPair.response)
            }, 2000)
          } else {
            console.log(`[PDK-Tx] Q&A pair already sent in session, skipping`)
          }
        } else if (!responseButton) {
          // No buttons = response still streaming
          console.log(`[PDK-Tx] Response streaming... Question: "${questionText.substring(0, 50)}..." (${responseText.length} chars)`)
        }

      } catch (error) {
        console.error('[PDK-Tx] Error:', error instanceof Error ? error.message : String(error))
      }
    }, 500)
  })

  observer.observe(container, {
    childList: true,
    subtree: true,
    characterData: false
  })

  console.log('[PDK-Tx] MutationObserver attached')
}

// Helper function to send question + response to PDK
async function sendQuestionToPDK(questionText: string, responseText: string) {
  if (isQuestionSentInSession(questionText)) {
    console.log('[PDK-Tx] Question already sent in session, skipping')
    return
  }

  // Check if currently sending
  if (questionText === currentlySendingQuestion) {
    console.log('[PDK-Tx] Question currently being sent, skipping')
    return
  }

  currentlySendingQuestion = questionText

  if (!responseText) {
    console.log('[PDK-Tx] No response available, deferring send')
    currentlySendingQuestion = ''
    return
  }

  const responsePreview = responseText.substring(0, 150)

  // Create transaction
  const tx: PerplexityTransaction = {
    id: `perp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    questionText: questionText,
    responsePreview: responsePreview,
    status: 'pending',
    createdAt: Date.now(),
    retryCount: 0
  }

  // Record locally (mark as pending)
  await recordTransaction(tx)
  console.log('[PDK-Tx] Created transaction:', tx.id)

  // Extract sources (stub for now - TODO implement later)
  const sources = parser?.extractSources() || []

  // Deduplicate sources: only keep NEW ones not seen in previous questions
  const newSources = sources.filter((source) => {
    const url = source.source_url || ''
    if (seenSourceUrls.has(url)) {
      return false  // Filter out: already seen in previous question
    }
    return true  // Keep: new source for this question
  })

  // Add current question's sources to the seen set
  newSources.forEach((source) => {
    if (source.source_url) {
      seenSourceUrls.add(source.source_url)
    }
  })

  console.log(
    '[PDK-Tx] Sources: found',
    sources.length,
    'total, keeping',
    newSources.length,
    'new ones (filtered',
    sources.length - newSources.length,
    'duplicates)'
  )

  // Transmit Q&A to PDK
  const message = {
    messageType: 'llmMessageCapture',
    platform: 'perplexity',
    payload: {
      content: {
        user: questionText,
        assistant: responseText,
        sources: newSources
      },
      url: window.location.href,
      timestamp: Date.now(),
      isLoggedIn: checkLoginState(config),
      transactionId: tx.id
    }
  }

  console.log('[PDK-Tx] Sending Q&A transaction', tx.id)

  chrome.runtime.sendMessage(message, (response) => {
    if (chrome.runtime.lastError) {
      console.error('[PDK-Tx] Send failed:', chrome.runtime.lastError.message)
      tx.status = 'failed'
      tx.error = chrome.runtime.lastError.message
      tx.retryCount++
    } else {
      tx.status = 'sent'
      tx.sentAt = Date.now()
      if (response?.bundleId) {
        tx.pdkBundleId = response.bundleId
      }
      console.log('[PDK-Tx] Transaction sent successfully')
    }

    // Update transaction status in storage
    recordTransaction(tx)
    
    // Clear sending flag after transmission completes
    currentlySendingQuestion = ''
  })
}


// Initialize on page load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeCapture)
} else {
  initializeCapture()
}

// Handle page unload - send final question if exists
window.addEventListener('beforeunload', () => {
  if (lastTrackedQAPair.question && !isQuestionSentInSession(lastTrackedQAPair.question)) {
    console.log('[PDK-Tx] Page unloading - sending final Q&A pair...')
    // Note: Async send may not complete, but we try
    sendQuestionToPDK(lastTrackedQAPair.question, lastTrackedQAPair.response)
  }
})

// Monitor observer health every 3 seconds
setInterval(() => {
  if (!config || !config.llm_capture || !captureEnabled) {
    return
  }
  
  const llmCaptureConfig = config.llm_capture || {}
  const platformConfig = llmCaptureConfig.platforms?.perplexity || {}
  const messageContainerSelector = platformConfig.selectors?.messageContainer
  
  if (messageContainerSelector) {
    const container = document.querySelector(messageContainerSelector)
    
    if (!container) {
      console.warn('[PDK-Health] Message container NOT FOUND')
    } else {
      if (observer && container !== lastObservedContainer) {
        console.log('[PDK-Health] Container changed, re-attaching observer')
        observer.disconnect()
        lastObservedContainer = container
        setupMessageObserver(config)
      }
    }
  }
}, 3000)

// Re-initialize if navigation happens
window.addEventListener('hashchange', initializeCapture)

// Log transaction statistics on page unload
window.addEventListener('beforeunload', () => {
  const totalTransactions = sentTransactions.size
  const sentCount = Array.from(sentTransactions.values()).filter(t => t.status === 'sent').length
  const failedCount = Array.from(sentTransactions.values()).filter(t => t.status === 'failed').length
  
  console.log('[PDK-Tx] Page unloading - Summary:')
  console.log('[PDK-Tx] Total transactions:', totalTransactions)
  console.log('[PDK-Tx] Successfully sent:', sentCount)
  console.log('[PDK-Tx] Failed:', failedCount)
})

