import { REXServiceWorkerModule, registerREXModule, dispatchEvent } from '@bric/rex-core/service-worker'
import rexCorePlugin from '@bric/rex-core/service-worker'
import { type REXConfiguration } from '@bric/rex-core/extension'
import * as listUtils from '@bric/rex-lists'

/**
 * LLM Chatbot Module - Service Worker Context
 * Responsible for: capturing ChatGPT chats (history + live), batching data, coordinating transmission via PDK
 */
class LLMChatbotServiceWorkerModule extends REXServiceWorkerModule {
  private enabled: boolean = false
  private config: any = null
  private chatGPTCaptureManager: ChatGPTCaptureManager | null = null
  private transmittedHashes: Set<string> = new Set() // Track transmitted interactions to prevent duplicates
  private transmittedDiscoverHeadlines: Set<string> = new Set() // Track transmitted Discover blurbs
  private transmittedArticleUrls: Set<string> = new Set() // Track transmitted article URLs

  constructor() {
    super()
  }

  moduleName(): string {
    return 'LLMChatbotServiceWorkerModule'
  }

  setup(): void {
    console.log('[LLM Chatbot] Service Worker module initializing...')

    // Get configuration
    chrome.storage.local.get('REXConfiguration', (result) => {
      if (result.REXConfiguration) {
        const config = result.REXConfiguration
        const liveMirrorConfig = config['live_mirror']
        const llmConfig = liveMirrorConfig?.['llm_capture']

        if (llmConfig?.enabled) {
          this.enabled = true
          this.config = llmConfig
          console.log('[LLM Chatbot] Service Worker module enabled')
          console.log('[LLM Chatbot] LLM Capture Config:', llmConfig)

          // Initialize ChatGPT capture manager
          if (llmConfig.platforms?.chatgpt?.enabled) {
            this.chatGPTCaptureManager = new ChatGPTCaptureManager(
              llmConfig.platforms.chatgpt
            )
            console.log('[LLM Chatbot] ChatGPT capture manager initialized')
          }
        }
      }
    })
    // Note: Removed storage change listener - using message-based transmission only
    // to prevent duplicate processing (storage + message would cause 2x dispatches)
  }

  handleMessage(message:any, sender:any, sendResponse:(response:any) => void):boolean { // eslint-disable-line @typescript-eslint/no-explicit-any
    console.log('[LLM Chatbot] Message received:', message.messageType)

    if (message.messageType === 'llmInteractionsBatch') {
      console.log(`[LLM Chatbot] Processing interaction batch of ${message.interactions.length} items`)
      this.handleInteractionBatch(message.interactions)
      sendResponse({ success: true })

      return true
    } else if (message.messageType === 'discoverNewsBatch') {
      console.log(`[LLM Chatbot] Processing Discover news batch of ${message.blurbs?.length || 0} blurbs`)
      this.handleDiscoverBatch(message)
      sendResponse({ success: true })

      return true
    } else if (message.messageType === 'discoverArticleBatch') {
      console.log(`[LLM Chatbot] Processing Discover article: ${message.article?.headline?.substring(0, 50)}...`)
      this.handleArticle(message)
      sendResponse({ success: true })

      return true
    } else if (message.messageType === 'financeMarketSources') {
      console.log(`[LLM Chatbot] Processing finance market sources: ${message.domains?.length || 0} domains`)
      this.handleFinanceSources(message)
      sendResponse({ success: true })

      return true
    } else if (message.messageType === 'llmChatGPTCaptureRequest') {
      console.log('[LLM Chatbot] ChatGPT capture request received')
      if (this.chatGPTCaptureManager) {
        this.chatGPTCaptureManager.captureAndQueueData(message.data)
          .then(() => sendResponse({ success: true }))
          .catch((error) => {
            console.error('[LLM Chatbot] Error capturing ChatGPT data:', error)
            sendResponse({ success: false, error: error.message })
          })
        return true  // Async response
      }
    } else if (message.messageType === 'syncHistoricalChats') {
      console.log('[LLM Chatbot] User requested historical chat sync')
      if (this.chatGPTCaptureManager) {
        this.chatGPTCaptureManager.syncHistoricalChatsInBackground()
          .then(() => {
            console.log('[LLM Chatbot] Historical sync completed')
            sendResponse({ success: true, message: 'Historical chats synced successfully' })
          })
          .catch((error) => {
            console.error('[LLM Chatbot] Error syncing historical chats:', error)
            sendResponse({ success: false, error: error.message })
          })
        return true  // Async response
      }
    } else if (message.messageType === 'pageCaptureContent') {
      pageCaptureModule.handlePageCapture(message, sendResponse)
      return true  // Async response
    }
    return false
  }

  /**
   * Generate a hash for interaction deduplication
   * Note: Does NOT include timestamp - same content within same conversation is a duplicate
   */
  private hashInteraction(interaction: any): string {
    // Use type + conversation_id + first 200 chars of content as a unique identifier
    // Timestamp is deliberately excluded so near-simultaneous duplicates are caught
    const contentPrefix = (interaction.content || '').substring(0, 200)
    const conversationId = interaction.conversation_id || 'no-convo'
    return `${interaction.type}:${conversationId}:${contentPrefix}`
  }

  private handleInteractionBatch(interactions: any[]): void {
    console.log(`[LLM Chatbot] Service Worker received batch of ${interactions.length} interactions`)

    // Filter out already-transmitted interactions
    const newInteractions = interactions.filter(interaction => {
      const hash = this.hashInteraction(interaction)
      if (this.transmittedHashes.has(hash)) {
        console.log(`[LLM Chatbot] Skipping duplicate interaction: ${interaction.type}`)
        return false
      }
      return true
    })

    if (newInteractions.length === 0) {
      console.log('[LLM Chatbot] All interactions were duplicates, nothing to transmit')
      return
    }

    console.log(`[LLM Chatbot] Processing ${newInteractions.length} new interactions (${interactions.length - newInteractions.length} duplicates filtered)`)
    
    // Process for transmission
    this.processInteractionsForTransmission(newInteractions)
  }

  private processInteractionsForTransmission(interactions: any[]): void {
    if (interactions.length === 0) return

    console.log(`[LLM Chatbot] Transmitting ${interactions.length} interactions to PDK`)

    // Format for PDK and mark as transmitted
    for (const interaction of interactions) {
      // Mark as transmitted to prevent future duplicates
      const hash = this.hashInteraction(interaction)
      this.transmittedHashes.add(hash)

      // Send to PDK for encryption and transmission
      // chatbot_name becomes secondary_identifier in PDK (requires backend generator module)
      dispatchEvent({
        name: 'llm-chatbot-interaction',
        date: new Date(interaction.timestamp),
        chatbot_name: interaction.source,  // Secondary identifier: chatgpt, perplexity, claude, gemini
        interaction: {
          type: interaction.type,
          content: interaction.content,
          length: interaction.length,
          url: interaction.url,
          conversation_id: interaction.conversation_id,
          sources: interaction.sources,  // Include extracted citation sources
        },
        data_source: 'extension_chatgpt_capture'
      })

      console.log(`[LLM Chatbot] Dispatched ${interaction.type} from ${interaction.source} to PDK (conversation: ${interaction.conversation_id})`)
    }

    // Clear storage (browser module may have stored these)
    chrome.storage.local.set({ llm_interactions: [] })
    
    console.log(`[LLM Chatbot] Transmission complete. Total unique interactions tracked: ${this.transmittedHashes.size}`)
  }

  /**
   * Handle a batch of Discover news blurbs from the browser module
   */
  private handleDiscoverBatch(message: any): void {
    const blurbs = message.blurbs || []
    if (blurbs.length === 0) {
      console.log('[LLM Chatbot] Empty Discover batch, nothing to process')
      return
    }

    console.log(`[LLM Chatbot] Processing ${blurbs.length} Discover blurbs`)

    for (const blurb of blurbs) {
      // Deduplicate by headline
      if (this.transmittedDiscoverHeadlines.has(blurb.headline)) {
        console.log(`[LLM Chatbot] Skipping duplicate Discover blurb: ${blurb.headline.substring(0, 50)}...`)
        continue
      }

      this.transmittedDiscoverHeadlines.add(blurb.headline)

      // Dispatch to PDK as a separate event type for Discover news
      dispatchEvent({
        name: 'perplexity-discover-news',
        date: new Date(message.timestamp || Date.now()),
        platform: 'perplexity-discover',
        blurb: {
          headline: blurb.headline,
          posted: blurb.posted,
          source: blurb.source,
          authors: blurb.authors || [],
          summary: blurb.summary,
          url: blurb.url,
          citations: blurb.citations,
        },
        data_source: 'extension_discover_capture',
      })

      console.log(`[LLM Chatbot] Dispatched Discover blurb to PDK: ${blurb.headline.substring(0, 50)}...`)
    }

    console.log(`[LLM Chatbot] Discover batch processed. Total unique blurbs tracked: ${this.transmittedDiscoverHeadlines.size}`)
  }

  /**
   * Handle a Discover article from the browser module
   * Deduplicates by URL and dispatches to PDK with the latest content
   */
  private handleArticle(message: any): void {
    const article = message.article
    if (!article || !article.headline) {
      console.log('[LLM Chatbot] Empty or invalid article, nothing to process')
      return
    }

    const articleUrl = message.url || article.url || ''

    // For articles, we allow re-transmission of the same URL if content has grown
    // (progressive loading), so we track by URL but always dispatch
    this.transmittedArticleUrls.add(articleUrl)

    dispatchEvent({
      name: 'perplexity-discover-article',
      date: new Date(message.timestamp || Date.now()),
      platform: 'perplexity-article',
      article: {
        headline: article.headline,
        posted: article.posted,
        source: article.source,
        authors: article.authors || [],
        'content*': article['content*'],
        summary: article.summary,
        url: articleUrl,
        citations: article.citations,
      },
      data_source: 'extension_discover_capture',
    })

    console.log(`[LLM Chatbot] Dispatched article to PDK: "${article.headline.substring(0, 50)}..." (${article['content*']?.length || 0} chars)`)
  }

  /**
   * Handle finance market summary sources from the browser module
   */
  private handleFinanceSources(message: any): void {
    const domains = message.domains || []
    if (domains.length === 0) {
      console.log('[LLM Chatbot] Empty finance sources, nothing to process')
      return
    }

    dispatchEvent({
      name: 'perplexity-finance-sources',
      date: new Date(message.timestamp || Date.now()),
      platform: 'perplexity-finance',
      domains: domains,
      url: message.url || '',
      data_source: 'extension_finance_capture',
    })

    console.log(`[LLM Chatbot] Dispatched ${domains.length} finance sources to PDK`)
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  checkRequirement(_requirement: string): Promise<boolean> {
    return Promise.resolve(this.enabled)
  }
}

/**
 * ChatGPT Capture Manager
 * Handles both historical chat capture and live message capture for ChatGPT
 */
class ChatGPTCaptureManager {
  private config: any
  private capturedConversationIds = new Set<string>()

  constructor(config: any) {
    this.config = config
    console.log('[ChatGPT Capture] Manager initialized with config:', config)
  }

  /**
   * Main entry point - captures data from ChatGPT page and queues for PDK
   */
  async captureAndQueueData(data: any): Promise<void> {
    console.log('[ChatGPT Capture] captureAndQueueData called with:', data)

    try {
      // Detect login state
      const isLoggedIn = this.detectLoginState()
      console.log('[ChatGPT Capture] Login state:', isLoggedIn ? 'logged-in' : 'logged-out')

      if (isLoggedIn) {
        // Logged-in: capture history + live
        console.log('[ChatGPT Capture] Starting historical chat capture...')
        await this.captureHistoricalChats()
        console.log('[ChatGPT Capture] Historical chat capture completed')
      } else {
        // Logged-out: capture live only
        console.log('[ChatGPT Capture] Logged out - live capture only')
      }

      // Queue data for PDK transmission
      await this.queueForPDKTransmission(data)

    } catch (error) {
      console.error('[ChatGPT Capture] Error in captureAndQueueData:', error)
      throw error
    }
  }

  /**
   * Detects whether user is logged in to ChatGPT
   */
  private detectLoginState(): boolean {
    const loggedInSelector = this.config.login_detection?.loggedInSelector
    const loggedOutSelector = this.config.login_detection?.loggedOutSelector

    const hasProfileBtn = document.querySelector(loggedInSelector)
    const hasLoginBtn = document.querySelector(loggedOutSelector)

    const isLoggedIn = !!hasProfileBtn && !hasLoginBtn
    console.log(`[ChatGPT Capture] Login detection - profile btn: ${!!hasProfileBtn}, login btn: ${!!hasLoginBtn}`)

    return isLoggedIn
  }

  /**
   * Capture all historical chats from sidebar
   * Based on tested script pattern
   */
  private async captureHistoricalChats(): Promise<void> {
    try {
      const sidebarSelector = this.config.selectors?.sidebar  // '#history'
      const sidebarItemsSelector = this.config.selectors?.sidebarItems  // 'a[data-sidebar-item="true"]'

      const chatHistoryDiv = document.querySelector(sidebarSelector)
      if (!chatHistoryDiv) {
        console.log('[ChatGPT Capture] Sidebar not found - likely not logged in')
        return
      }

      const chatLinks = chatHistoryDiv.querySelectorAll(sidebarItemsSelector)
      console.log(`[ChatGPT Capture] Found ${chatLinks.length} historical chats in sidebar`)

      const chatHistory = Array.from(chatLinks).map((link: any) => ({
        title: link.querySelector('span[dir="auto"]')?.textContent?.trim() || 'Untitled',
        conversation_id: link.getAttribute('href')?.split('/c/')[1] || '',
        url: link.getAttribute('href') || '',
        element: link
      }))

      console.log('[ChatGPT Capture] Chat history extracted:', chatHistory.length, 'items')

      // Process each historical chat
      for (const chat of chatHistory) {
        if (!chat.conversation_id || this.capturedConversationIds.has(chat.conversation_id)) {
          console.log(`[ChatGPT Capture] Skipping chat (already captured or invalid): ${chat.title}`)
          continue
        }

        console.log(`[ChatGPT Capture] Processing historical chat: ${chat.title}`)

        try {
          // Click on chat to load it
          (chat.element as HTMLElement).click()

          // Wait for page to load
          await this.waitForLoad(2000)

          // Capture messages and sources
          const capturedData = this.captureMessagesAndSources()
          console.log(`[ChatGPT Capture] Captured ${capturedData.messages.length} message pairs from: ${chat.title}`)

          // Mark as captured
          this.capturedConversationIds.add(chat.conversation_id)

          // Queue for PDK
          await this.sendToPDK({
            platform: 'chatgpt',
            state: 'logged-in-history',
            conversation_id: chat.conversation_id,
            conversation_title: chat.title,
            url: chat.url,
            messages: capturedData.messages,
            date: new Date()
          })

        } catch (chatError) {
          console.error(`[ChatGPT Capture] Error processing chat ${chat.title}:`, chatError)
        }
      }

    } catch (error) {
      console.error('[ChatGPT Capture] Error in captureHistoricalChats:', error)
      throw error
    }
  }

  /**
   * Capture messages and sources from current page
   * Based on tested script pattern
   */
  private captureMessagesAndSources(): any {
    const userMessageSelector = this.config.selectors?.userMessage  // '[data-message-author-role="user"]'
    const assistantMessageSelector = this.config.selectors?.assistantMessage  // '[data-message-author-role="assistant"]'

    const userMessages = document.querySelectorAll(userMessageSelector)
    const assistantMessages = document.querySelectorAll(assistantMessageSelector)

    console.log(`[ChatGPT Capture] Found ${userMessages.length} user messages, ${assistantMessages.length} assistant messages`)

    const messages: any[] = []

    for (let i = 0; i < userMessages.length; i++) {
      const userMsg = userMessages[i]
      const assistantMsg = assistantMessages[i]

      if (!userMsg || !assistantMsg) {
        console.warn(`[ChatGPT Capture] Skipping unpaired messages at index ${i}`)
        continue
      }

      // Extract sources from assistant message (links)
      const sources = Array.from(assistantMsg.querySelectorAll('a')).map((link: any) => ({
        source_title: link.textContent?.trim() || '',
        source_url: link.href || ''
      }))

      const message = {
        user_input: userMsg.textContent?.trim() || '',
        assistant_output: assistantMsg.textContent?.trim() || '',
        assistant_sources: sources
      }

      console.log(`[ChatGPT Capture] Message ${i + 1}: user length=${message.user_input.length}, assistant length=${message.assistant_output.length}, sources=${sources.length}`)

      messages.push(message)
    }

    return { messages }
  }

  /**
   * Wait for page to load
   */
  private waitForLoad(ms: number): Promise<void> {
    console.log(`[ChatGPT Capture] Waiting ${ms}ms for page load...`)
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  /**
   * Send captured data to PDK
   */
  private async sendToPDK(data: any): Promise<void> {
    console.log('[ChatGPT Capture] Queuing data for PDK transmission:', {
      conversation_id: data.conversation_id,
      conversation_title: data.conversation_title,
      message_count: data.messages?.length || 0
    })

    dispatchEvent({
      name: 'webmunk-live-mirror',
      chatbot_name: data.platform,  // Secondary identifier: chatgpt, perplexity, etc.
      ...data,
      data_source: 'extension_chatgpt_capture'
    })
  }

  /**
   * Queue data for PDK transmission
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private async queueForPDKTransmission(_data: any): Promise<void> {
    console.log('[ChatGPT Capture] queueForPDKTransmission called')
    // Implementation continues...
  }

  /**
   * User-initiated sync of historical chats using background tabs
   * Opens chats in hidden tabs, captures, closes without interrupting user
   */
  async syncHistoricalChatsInBackground(): Promise<void> {
    try {
      console.log('[ChatGPT Capture] Starting background historical sync (user-initiated)...')

      const sidebarSelector = this.config.selectors?.sidebar  // '#history'
      const sidebarItemsSelector = this.config.selectors?.sidebarItems  // 'a[data-sidebar-item="true"]'

      const chatHistoryDiv = document.querySelector(sidebarSelector)
      if (!chatHistoryDiv) {
        console.log('[ChatGPT Capture] Sidebar not found - user likely not logged in')
        throw new Error('ChatGPT sidebar not available - please log in')
      }

      const chatLinks = chatHistoryDiv.querySelectorAll(sidebarItemsSelector)
      console.log(`[ChatGPT Capture] Found ${chatLinks.length} historical chats to sync`)

      const chatHistory = Array.from(chatLinks).map((link: any) => ({
        title: link.querySelector('span[dir="auto"]')?.textContent?.trim() || 'Untitled',
        conversation_id: link.getAttribute('href')?.split('/c/')[1] || '',
        url: link.getAttribute('href') || ''
      }))

      let syncedCount = 0
      let skippedCount = 0

      // Process each chat in background tab
      for (const chat of chatHistory) {
        if (!chat.conversation_id || this.capturedConversationIds.has(chat.conversation_id)) {
          console.log(`[ChatGPT Capture] Skipping (already captured): ${chat.title}`)
          skippedCount++
          continue
        }

        try {
          console.log(`[ChatGPT Capture] Background sync: opening ${chat.title}...`)

          // Open chat in background tab (user doesn't see it)
          await this.captureInBackgroundTab(chat)
          syncedCount++

        } catch (error) {
          console.error(`[ChatGPT Capture] Error syncing ${chat.title}:`, error)
        }
      }

      console.log(`[ChatGPT Capture] Background sync complete: synced=${syncedCount}, skipped=${skippedCount}`)

    } catch (error) {
      console.error('[ChatGPT Capture] Error in syncHistoricalChatsInBackground:', error)
      throw error
    }
  }

  /**
   * Capture a single chat using a background tab
   * Opens tab → captures messages → closes tab (no user interruption)
   */
  private captureInBackgroundTab(chat: any): Promise<void> {
    return new Promise((resolve, reject) => {
      console.log(`[ChatGPT Capture] Creating background tab for: ${chat.title}`)

      // Open in background tab (user doesn't see it)
      chrome.tabs.create({
        url: chat.url,
        active: false,  // ← KEY: Don't steal focus
        windowId: chrome.windows.WINDOW_ID_CURRENT
      }, async (backgroundTab) => {
        if (!backgroundTab || !backgroundTab.id) {
          reject(new Error('Failed to create background tab'))
          return
        }

        const tabId = backgroundTab.id
        console.log(`[ChatGPT Capture] Background tab created: ${tabId}`)

        try {
          // Wait for tab to fully load
          await this.waitForLoad(3000)

          console.log(`[ChatGPT Capture] Capturing from background tab: ${chat.title}`)

          // Send capture request to tab's content script
          const captured = await new Promise<any>((captureResolve, captureReject) => {
            chrome.tabs.sendMessage(tabId, {
                messageType: 'captureMessagesFromTab',
                conversationId: chat.conversation_id,
                selectors: this.config.selectors
              }, {}, (response) => {
                if (response?.success) {
                  captureResolve(response.data)
                } else {
                  captureReject(new Error(response?.error || 'Capture failed'))
                }
              }
            )
          })

          console.log(`[ChatGPT Capture] Captured ${captured.messages.length} messages from background tab`)

          // Mark as captured
          this.capturedConversationIds.add(chat.conversation_id)

          // Queue for PDK
          await this.sendToPDK({
            platform: 'chatgpt',
            state: 'background-sync-history',
            conversation_id: chat.conversation_id,
            conversation_title: chat.title,
            url: chat.url,
            messages: captured.messages,
            sync_method: 'background-tab',
            date: new Date()
          })

          console.log(`[ChatGPT Capture] Closing background tab: ${tabId}`)
          // Close the background tab (cleanup)
          chrome.tabs.remove(tabId)

          resolve()

        } catch (error) {
          console.error(`[ChatGPT Capture] Error processing background tab:`, error)
          // Always close the tab even on error
          chrome.tabs.remove(tabId)
          reject(error)
        }
      })
    })
  }
}

const llmChatbotModule = new LLMChatbotServiceWorkerModule()
registerREXModule(llmChatbotModule)

// ---------------------------------------------------------------------------
// Page Capture Module
// Captures the rendered HTML of pages matching domains in a named rex-lists
// allow-list.  Config key: page_capture
//
// Example server config:
//   "page_capture": {
//     "enabled": true,
//     "capture_delay_ms": 1500,
//     "allow_lists": ["financial-news-sites"]
//   }
//
// The named lists are populated via the top-level "lists" key in the server
// config (same mechanism used by rex-history), e.g.:
//   "lists": {
//     "financial-news-sites": [
//       { "pattern": "forbes.com",       "pattern_type": "domain", "source": "backend", "metadata": {} },
//       { "pattern": "seekingalpha.com", "pattern_type": "domain", "source": "backend", "metadata": {} },
//       { "pattern": "cnbc.com",         "pattern_type": "domain", "source": "backend", "metadata": {} },
//       { "pattern": "bloomberg.com",    "pattern_type": "domain", "source": "backend", "metadata": {} },
//       { "pattern": "marketwatch.com",  "pattern_type": "domain", "source": "backend", "metadata": {} },
//       { "pattern": "barrons.com",      "pattern_type": "domain", "source": "backend", "metadata": {} }
//     ]
//   }
// ---------------------------------------------------------------------------

interface PageCaptureConfig {
  enabled: boolean
  capture_delay_ms?: number
  capture_raw_html?: boolean
  debug?: boolean
  allow_lists: string[]
  dedup_ttl_hours?: number
}

// Deduplication: track URL -> timestamp of last capture (in-memory, resets on SW restart)
// This is intentional — after a SW restart the participant may have navigated to new content.
const PAGE_CAPTURE_SEEN: Map<string, number> = new Map()
const DEFAULT_DEDUP_TTL_MS = 24 * 60 * 60 * 1000  // 24 hours

class PageCaptureServiceWorkerModule extends REXServiceWorkerModule {
  private config: PageCaptureConfig | null = null

  moduleName(): string {
    return 'PageCaptureServiceWorkerModule'
  }

  setup(): void {
    console.log('[rex-live-mirror/page-capture] Service Worker module initializing...')

    listUtils.initializeListDatabase()
      .then(() => {
        console.log('[rex-live-mirror/page-capture] List database ready.')
        return this.loadConfiguration(true)
      })
      .catch((err) => {
        console.error('[rex-live-mirror/page-capture] Failed to initialize list database:', err)
      })

    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== 'local' || !changes.REXConfiguration) return
      this.loadConfiguration(true).catch((err) => {
        console.error('[rex-live-mirror/page-capture] Failed to reload configuration:', err)
      })
    })
  }

  private async loadConfiguration(syncLists: boolean): Promise<void> {
    const configuration = await rexCorePlugin.fetchConfiguration() as REXConfiguration | undefined
    const configRecord = configuration as unknown as Record<string, unknown> | undefined
    const liveMirrorConfig = configRecord?.['live_mirror'] as Record<string, unknown> | undefined
    const pageCaptureConfig = liveMirrorConfig?.['page_capture'] as PageCaptureConfig | undefined

    if (pageCaptureConfig?.enabled) {
      this.config = pageCaptureConfig
      console.log('[rex-live-mirror/page-capture] Configuration loaded:', pageCaptureConfig)
    } else {
      this.config = null
      console.log('[rex-live-mirror/page-capture] Disabled or not configured.')
    }

    if (!syncLists) return

    const listConfig = configRecord?.['lists']
    if (listConfig !== null && listConfig !== undefined && typeof listConfig === 'object' && !Array.isArray(listConfig)) {
      await listUtils.parseAndSyncLists(listConfig as Parameters<typeof listUtils.parseAndSyncLists>[0])
      console.log('[rex-live-mirror/page-capture] Lists synced.')
    }
  }

  // Called by LLMChatbotServiceWorkerModule.handleMessage for pageCaptureContent messages.
  handlePageCapture(message: any, sendResponse: (response: any) => void): void { // eslint-disable-line @typescript-eslint/no-explicit-any
    if (!this.config?.enabled) {
      sendResponse({ success: false, reason: 'page_capture disabled' })
      return
    }

    const url: string = message.url || ''

    // Deduplication: skip if we captured this exact URL recently
    const dedupTtlMs = ((this.config.dedup_ttl_hours ?? 24) * 60 * 60 * 1000)
    const lastSeen = PAGE_CAPTURE_SEEN.get(url)
    if (lastSeen !== undefined && (Date.now() - lastSeen) < dedupTtlMs) {
      console.log(`[rex-live-mirror/page-capture] Duplicate within TTL, skipping: ${url}`)
      sendResponse({ success: false, reason: 'duplicate' })
      return
    }

    const allowLists: string[] = this.config.allow_lists || []
    const checks = allowLists.map(listName => listUtils.matchDomainAgainstList(url, listName))

    Promise.all(checks)
      .then((results) => {
        const matchedEntry = results.find(r => r !== null) ?? null

        if (!matchedEntry) {
          console.log(`[rex-live-mirror/page-capture] URL not in allow-lists, skipping: ${url}`)
          sendResponse({ success: false, reason: 'not in allow-lists' })
          return
        }

        // Mark as seen before dispatching
        PAGE_CAPTURE_SEEN.set(url, Date.now())

        const event: Record<string, unknown> = {
          name: 'page-capture',
          date: message.date ?? Date.now(),
          url,
          domain: message.domain ?? '',
          title: message.title ?? '',
          byline: message.byline ?? null,
          excerpt: message.excerpt ?? null,
          published_time: message.published_time ?? null,
          text_content: message.text_content ?? null,
          text_length: message.text_length ?? 0,
          parsed_content: message.parsed_content ?? null,
          matched_list: matchedEntry.list_name,
          matched_pattern: matchedEntry.pattern,
          matched_category: matchedEntry.metadata?.category ?? null,
        }

        // Include raw HTML if the browser sent it (browser already applied debug/capture_raw_html)
        if (message.html !== undefined) {
          event.html = message.html
          event.html_length = message.html_length ?? 0
        }

        dispatchEvent(event)

        console.log(`[rex-live-mirror/page-capture] Dispatched: "${message.title}" (${message.text_length} chars${message.html !== undefined ? ', +raw html' : ''})`)
        sendResponse({ success: true })
      })
      .catch((err) => {
        console.error('[rex-live-mirror/page-capture] Error checking allow-lists:', err)
        sendResponse({ success: false, reason: String(err) })
      })
  }

  // Not used directly — messages are routed via LLMChatbotServiceWorkerModule
  handleMessage(_message: any, _sender: any, _sendResponse: (response: any) => void): boolean { // eslint-disable-line @typescript-eslint/no-explicit-any
    return false
  }
}

export const pageCaptureModule = new PageCaptureServiceWorkerModule()
registerREXModule(pageCaptureModule)

export default llmChatbotModule
