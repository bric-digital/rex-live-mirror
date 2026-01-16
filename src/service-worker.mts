import { WebmunkServiceWorkerModule, registerWebmunkModule } from '@bric/webmunk-core/service-worker'
import passiveDataKitPlugin from '@bric/webmunk-passive-data-kit/service-worker'

/**
 * LLM Chatbot Module - Service Worker Context
 * Responsible for: capturing ChatGPT chats (history + live), batching data, coordinating transmission via PDK
 */
class LLMChatbotServiceWorkerModule extends WebmunkServiceWorkerModule {
  private enabled: boolean = false
  // Removed pendingInteractions property (no batching)
  private pdkPlugin: any = null
  private config: any = null
  private chatGPTCaptureManager: ChatGPTCaptureManager | null = null

  constructor() {
    super()
  }

  moduleName(): string {
    return 'LLMChatbotServiceWorkerModule'
  }

  setup(): void {
    console.log('[LLM Chatbot] Service Worker module initializing...')

    this.pdkPlugin = passiveDataKitPlugin

    // Load configuration
    this.loadConfiguration()

    // Listen for configuration changes
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName === 'local' && 'webmunkConfiguration' in changes) {
        console.log('[LLM Chatbot] Configuration updated, reloading...')
        this.loadConfiguration()
      }
    })
  }

  private loadConfiguration(): void {
    // Get configuration
    chrome.storage.local.get('webmunkConfiguration', (result) => {
      if (result.webmunkConfiguration) {
        const config = result.webmunkConfiguration
        const llmConfig = config['llm_capture']

        if (llmConfig?.enabled) {
          this.enabled = true
          this.config = llmConfig
          console.log('[LLM Chatbot] Service Worker module enabled')
          console.log('[LLM Chatbot] LLM Capture Config:', llmConfig)
          
          // Initialize ChatGPT capture manager
          if (llmConfig.platforms?.chatgpt?.enabled) {
            this.chatGPTCaptureManager = new ChatGPTCaptureManager(
              llmConfig.platforms.chatgpt,
              this.pdkPlugin
            )
            console.log('[LLM Chatbot] ChatGPT capture manager initialized')
          }
          
          this.setupMessageHandlers()
        }
      }
    })
  }

  private setupMessageHandlers(): void {
    // Listen for interaction batches from content script
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      console.log('[LLM Chatbot] Message received:', message.messageType)
      if (message.messageType === 'llmMessageCapture' && message.platform === 'chatgpt') {
        if (Array.isArray(message.messages)) {
          message.messages.forEach((interaction: any) => {
            this.processLiveInteraction({
              source: 'chatgpt',
              timestamp: message.timestamp || Date.now(),
              type: interaction.type,
              content: interaction.content,
              length: interaction.content?.length || 0,
              url: message.url,
            })
          })
          sendResponse({ success: true })
        } else {
          sendResponse({ success: false, error: 'No messages array' })
        }
      }
      // Ignore historical and batch messages
      return false
    })

    // Listen for storage changes
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName === 'local' && 'llm_interactions' in changes) {
        const interactions = changes['llm_interactions'].newValue || []
        console.log(`[LLM Chatbot] Storage change detected: ${interactions.length} interactions`)
        this.processInteractionsForTransmission(interactions)
      }
    })
  }

  // Removed handleInteractionBatch (no batching)

  private processLiveInteraction(interaction: any): void {
    if (!this.pdkPlugin) return
    console.log('[LLM Chatbot] Processing live interaction for PDK transmission')
    const dataPoint = {
      generator_identifier: 'llm-chatbot-interaction',
      properties: {
        'passive-data-metadata': {
          timestamp: interaction.timestamp,
          source: interaction.source,
        },
        interaction: {
          type: interaction.type,
          content: interaction.content,
          length: interaction.content?.length || 0,
          url: interaction.url,
        },
      },
    }
    try {
      this.pdkPlugin.logEvent(dataPoint)
      console.log('[LLM Chatbot] Data point sent to PDK')
    } catch (error) {
      console.error('[LLM Chatbot] Error sending data point to PDK:', error)
    }
  }

  checkRequirement(requirement: string): Promise<boolean> {
    return Promise.resolve(this.enabled)
  }
}

/**
 * ChatGPT Capture Manager
 * Handles both historical chat capture and live message capture for ChatGPT
 */
class ChatGPTCaptureManager {
  private config: any
  private pdkPlugin: any
  private capturedConversationIds = new Set<string>()

  constructor(config: any, pdkPlugin: any) {
    this.config = config
    this.pdkPlugin = pdkPlugin
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
            timestamp: new Date().toISOString()
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

    if (this.pdkPlugin) {
      try {
        this.pdkPlugin.logEvent({
          name: 'llm-chat-chatgpt',
          properties: {
            ...data,
            data_source: 'extension_chatgpt_capture'
          }
        })
        console.log('[ChatGPT Capture] Data queued successfully for PDK')
      } catch (error) {
        console.error('[ChatGPT Capture] Error queuing to PDK:', error)
        throw error
      }
    }
  }

  /**
   * Queue data for PDK transmission
   */
  private async queueForPDKTransmission(data: any): Promise<void> {
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
            chrome.tabs.sendMessage(
              tabId,
              {
                messageType: 'captureMessagesFromTab',
                conversationId: chat.conversation_id,
                selectors: this.config.selectors
              },
              (response) => {
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
            timestamp: new Date().toISOString()
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

  /**
   * Helper to wait for a period (simulating page load)
   */
  private waitForLoad(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}

const llmChatbotModule = new LLMChatbotServiceWorkerModule()
registerWebmunkModule(llmChatbotModule)

export default llmChatbotModule
