import { REXClientModule, registerREXModule } from '@bric/webmunk-core/browser'
import { PerplexityParser } from './chatbots/perplexity.js'
import { ChatGPTParser } from './chatbots/chatgpt.js'
import { GeminiParser } from './chatbots/gemini.js'
import { ClaudeParser } from './chatbots/claude.js'

export interface ExtractedSource {
  source_title: string
  source_url?: string
}

export interface LLMInteraction {
  interaction_id: string  // Unique ID for this specific interaction
  updates_interaction_id?: string  // If this extends a previous capture, reference to original
  source: string
  timestamp: number
  type: 'question' | 'response'
  content: string
  length: number
  url: string
  conversation_id?: string  // ChatGPT conversation ID (extracted from URL when available)
  sources?: ExtractedSource[]  // Citation sources extracted from response
}

/**
 * LLM Chatbot Module - Browser Context (Content Script)
 * Runs in page context on chatbot websites
 * Responsible for: DOM observation, Q&A extraction, data capture
 */
// Track captured content for update detection
interface CapturedInteractionInfo {
  interaction_id: string
  length: number
}

class LLMChatbotBrowserModule extends REXClientModule {
  private enabled: boolean = false
  private parser: any = null
  private mutationObserver: MutationObserver | null = null
  private interactions: LLMInteraction[] = []
  // Track captured content by prefix for update detection
  // Key: type + first N chars (normalized), Value: { interaction_id, length }
  private capturedPrefixes: Map<string, CapturedInteractionInfo> = new Map()
  private readonly PREFIX_LENGTH = 100  // Characters to use for prefix matching
  private batchSize: number = 10
  private transmissionInterval: number = 60000
  private processDebounceTimer: ReturnType<typeof setTimeout> | null = null
  private readonly DEBOUNCE_MS = 500 // Wait 500ms after last DOM change before processing
  private currentConversationId: string | undefined = undefined  // Server-provided conversation ID from URL
  private lastCheckedUrl: string = ''  // Track URL to detect changes
  private localSessionId: string | undefined = undefined  // Self-generated ID for logged-out sessions
  private hadMessagesInDOM: boolean = false  // Track if we previously had messages (for new conversation detection)

  constructor() {
    super()
    console.log('[LLM Chatbot Browser] Constructor called on:', window.location.href)
  }

  moduleName(): string {
    return 'LLMChatbotBrowserModule'
  }

  setup(): void {
    console.log('[LLM Chatbot Browser] Browser module initializing on:', window.location.href)

    // Get configuration from storage
    chrome.storage.local.get('REXConfiguration', (result) => {
      try {
        if (result.REXConfiguration) {
          const config = result.REXConfiguration
          const llmConfig = config['llm_capture']

          console.log('[LLM Chatbot Browser] Configuration loaded:', llmConfig)

          if (llmConfig?.enabled) {
            this.enabled = true
            this.batchSize = llmConfig.batch_size || 10
            this.transmissionInterval = llmConfig.transmission_interval_ms || 60000

            console.log('[LLM Chatbot Browser] Module enabled')
            console.log('[LLM Chatbot Browser] Batch size:', this.batchSize)
            console.log('[LLM Chatbot Browser] Transmission interval:', this.transmissionInterval, 'ms')

            // Determine which chatbot we're on
            this.initializeChatbotCapture(llmConfig)
          } else {
            console.log('[LLM Chatbot Browser] Module disabled in configuration')
          }
        } else {
          console.warn('[LLM Chatbot Browser] No configuration found')
        }
      } catch (error) {
        console.error('[LLM Chatbot Browser] Error loading configuration:', error)
      }
    })
  }

  private initializeChatbotCapture(llmConfig: any): void {
    const currentURL = window.location.href
    // Read sources from backend config, default to all if not specified
    const enabledSources = llmConfig.sources || []
    
    console.log('[LLM Chatbot Browser] Checking URL for chatbot:', currentURL)
    console.log('[LLM Chatbot Browser] Enabled sources from backend config:', enabledSources)

    // Only initialize if backend specifies sources to capture
    if (!enabledSources || enabledSources.length === 0) {
      console.log('[LLM Chatbot Browser] No sources configured in backend - skipping capture initialization')
      return
    }

    // Get platform-specific configs
    const platforms = llmConfig.platforms || {}

    // Match current page to chatbot source (only if source is enabled)
    try {
      if (enabledSources.includes('perplexity') && currentURL.includes('perplexity.ai')) {
        const perplexityConfig = platforms.perplexity || {}
        this.parser = new PerplexityParser(perplexityConfig)
        console.log('[LLM Chatbot Browser] Perplexity parser initialized with config')
      } else if (enabledSources.includes('chatgpt') && currentURL.includes('chatgpt.com')) {
        const chatgptConfig = platforms.chatgpt || {}
        this.parser = new ChatGPTParser(chatgptConfig)
        console.log('[LLM Chatbot Browser] ChatGPT parser initialized with config')
      } else if (enabledSources.includes('gemini') && currentURL.includes('gemini.google.com')) {
        const geminiConfig = platforms.gemini || {}
        this.parser = new GeminiParser(geminiConfig)
        console.log('[LLM Chatbot Browser] Gemini parser initialized with config')
      } else if (enabledSources.includes('claude') && currentURL.includes('claude.ai')) {
        const claudeConfig = platforms.claude || {}
        this.parser = new ClaudeParser(claudeConfig)
        console.log('[LLM Chatbot Browser] Claude parser initialized with config')
      } else {
        console.log('[LLM Chatbot Browser] No matching enabled chatbot parser for URL:', currentURL)
      }

      if (this.parser) {
        console.log(`[LLM Chatbot Browser] Parser initialized: ${this.parser.name}`)
        console.log(`[LLM Chatbot Browser] Parser selectors:`, this.parser.selectors || 'default')
        
        // Run selector validation for Perplexity parser if available
        if (typeof this.parser.validateSelectors === 'function') {
          const validation = this.parser.validateSelectors()
          console.log(`[LLM Chatbot Browser] Selector validation: valid=${validation.valid}, questions=${validation.questionsFound}, responses=${validation.responsesFound}`)
        }
        
        this.startCapture()
      }
    } catch (error) {
      console.error('[LLM Chatbot Browser] Error initializing chatbot capture:', error)
    }
  }

  private startCapture(): void {
    try {
      console.log('[LLM Chatbot Browser] Starting capture...')

      // Set up mutation observer for DOM changes with debouncing
      this.mutationObserver = new MutationObserver(() => {
        // Debounce: wait for DOM to settle before processing
        if (this.processDebounceTimer) {
          clearTimeout(this.processDebounceTimer)
        }
        this.processDebounceTimer = setTimeout(() => {
          try {
            this.processPage()
          } catch (error) {
            console.error('[LLM Chatbot Browser] Error in mutation observer callback:', error)
          }
        }, this.DEBOUNCE_MS)
      })

      // Observe the entire document for changes
      this.mutationObserver.observe(document.body, {
        childList: true,
        subtree: true,
        characterData: true,
      })

      console.log('[LLM Chatbot Browser] DOM mutation observer started with debouncing')

      // Initial page processing (with small delay to let page settle)
      setTimeout(() => this.processPage(), 1000)

      // Periodic batch transmission
      setInterval(() => {
        try {
          this.transmitBatch()
        } catch (error) {
          console.error('[LLM Chatbot Browser] Error in transmission interval:', error)
        }
      }, this.transmissionInterval)

      console.log('[LLM Chatbot Browser] Transmission interval set:', this.transmissionInterval, 'ms')
    } catch (error) {
      console.error('[LLM Chatbot Browser] Error starting capture:', error)
    }
  }

  /**
   * Generate a prefix key for content matching and update detection
   * Uses type + normalized first N chars (ignoring length) to match content that may grow
   */
  private getPrefixKey(content: string, type: string): string {
    const normalized = content.trim().substring(0, this.PREFIX_LENGTH).replace(/\s+/g, ' ')
    return `${type}:${normalized}`
  }

  /**
   * Generate a unique interaction ID
   */
  private generateInteractionId(): string {
    return crypto.randomUUID()
  }

  /**
   * Extract conversation/search ID from chatbot URLs
   * - ChatGPT: chatgpt.com/c/{conversation-id} (UUID format)
   * - Perplexity: perplexity.ai/search/{query-slug}-{search-id} (base64-like ID at end)
   * - Claude: claude.ai/chat/{conversation-id} (UUID format)
   * - Gemini: gemini.google.com/u/{n}/app/{conversation-id} (hex string)
   */
  private extractConversationId(): string | undefined {
    const url = window.location.href
    
    // ChatGPT: Match conversation ID (UUID format)
    // Format: chatgpt.com/c/{uuid}
    if (url.includes('chatgpt.com')) {
      const match = url.match(/chatgpt\.com\/c\/([a-f0-9-]+)/i)
      return match ? match[1] : undefined
    }
    
    // Perplexity: Match search ID at end of URL path (base64url-like alphanumeric string)
    // Format: perplexity.ai/search/{query-slug}-{searchId}
    // The searchId is always the last segment after the final hyphen
    if (url.includes('perplexity.ai')) {
      // First extract just the path portion (before any ? or #)
      const pathMatch = url.match(/perplexity\.ai\/search\/([^?#]+)/)
      if (pathMatch) {
        const searchPath = pathMatch[1]
        // Extract the ID after the last hyphen (base64url format: letters, numbers, _, . - no hyphens)
        const idMatch = searchPath.match(/-([a-zA-Z0-9_.]{15,30})$/)
        if (idMatch) {
          return idMatch[1]
        }
      }
      return undefined
    }
    
    // Claude: Match conversation ID (UUID format)
    // Format: claude.ai/chat/{uuid}
    if (url.includes('claude.ai')) {
      const match = url.match(/claude\.ai\/chat\/([a-f0-9-]+)/i)
      return match ? match[1] : undefined
    }
    
    // Gemini: Match conversation ID (hex string)
    // Format: gemini.google.com/u/{n}/app/{hex-id}
    if (url.includes('gemini.google.com')) {
      const match = url.match(/gemini\.google\.com\/u\/\d+\/app\/([a-f0-9]+)/i)
      return match ? match[1] : undefined
    }
    
    return undefined
  }

  /**
   * Generate a local session ID for logged-out conversations
   * Prefixed with 'local-' to distinguish from server-provided IDs
   */
  private generateLocalSessionId(): string {
    return 'local-' + crypto.randomUUID()
  }

  /**
   * Get the effective conversation ID (server ID always supersedes local ID)
   */
  private getEffectiveConversationId(): string | undefined {
    return this.currentConversationId || this.localSessionId
  }

  /**
   * Check for URL changes and update conversation ID
   * Server-provided ID always supersedes local session ID
   * Also backfills pending interactions that don't have a conversation_id yet
   */
  private checkUrlChange(): void {
    const currentUrl = window.location.href
    
    // Skip if URL hasn't changed
    if (currentUrl === this.lastCheckedUrl) {
      return
    }
    
    this.lastCheckedUrl = currentUrl
    const newServerConversationId = this.extractConversationId()
    
    // If server conversation ID appeared, it supersedes any local session ID
    if (newServerConversationId && newServerConversationId !== this.currentConversationId) {
      console.log(`[LLM Chatbot Browser] Server conversation ID detected: ${newServerConversationId}`)
      
      // Clear local session ID since server ID takes precedence
      if (this.localSessionId) {
        console.log(`[LLM Chatbot Browser] Clearing local session ID (server ID supersedes)`)
        this.localSessionId = undefined
      }
      
      // Backfill any pending interactions with the server ID
      // This updates interactions that had local ID or no ID
      let backfilledCount = 0
      for (const interaction of this.interactions) {
        if (!interaction.conversation_id || interaction.conversation_id.startsWith('local-')) {
          interaction.conversation_id = newServerConversationId
          backfilledCount++
        }
      }
      
      if (backfilledCount > 0) {
        console.log(`[LLM Chatbot Browser] Backfilled conversation_id for ${backfilledCount} pending interactions`)
      }
    }
    
    this.currentConversationId = newServerConversationId
  }

  private processPage(): void {
    if (!this.parser) {
      console.debug('[LLM Chatbot Browser] No parser available, skipping page processing')
      return
    }

    try {
      // Check for URL changes and update conversation ID (backfills pending interactions)
      this.checkUrlChange()

      // Extract all current interactions from the page
      const newInteractions = this.parser.extractInteractions()
      const hasMessagesNow = newInteractions.length > 0

      // Detect new conversation: messages were cleared from DOM
      if (this.hadMessagesInDOM && !hasMessagesNow) {
        console.log('[LLM Chatbot Browser] Messages cleared from DOM - new conversation detected')
        // Reset for new conversation
        this.localSessionId = undefined
        this.capturedPrefixes.clear()
        this.currentConversationId = undefined
        this.lastCheckedUrl = ''  // Force URL re-check
      }
      
      // Update tracking state
      this.hadMessagesInDOM = hasMessagesNow

      if (newInteractions.length > 0) {
        console.log(`[LLM Chatbot Browser] Extracted ${newInteractions.length} interactions from page`)
      }

      // Check if we have any responses (not just questions)
      const hasResponse = newInteractions.some((i: { type: string }) => i.type === 'response')

      // Generate local session ID only if:
      // 1. No server conversation ID available
      // 2. We have a response (not just a prompt)
      // 3. We don't already have a local session ID
      if (!this.currentConversationId && hasResponse && !this.localSessionId) {
        this.localSessionId = this.generateLocalSessionId()
        console.log(`[LLM Chatbot Browser] Generated local session ID: ${this.localSessionId}`)
        
        // Backfill any pending interactions that don't have a conversation_id
        let backfilledCount = 0
        for (const interaction of this.interactions) {
          if (!interaction.conversation_id) {
            interaction.conversation_id = this.localSessionId
            backfilledCount++
          }
        }
        if (backfilledCount > 0) {
          console.log(`[LLM Chatbot Browser] Backfilled local session ID for ${backfilledCount} pending interactions`)
        }
      }

      // Extract sources once per page processing (for responses)
      let extractedSources: ExtractedSource[] = []
      if (hasResponse && typeof this.parser.extractSources === 'function') {
        try {
          extractedSources = this.parser.extractSources()
          if (extractedSources.length > 0) {
            console.log(`[LLM Chatbot Browser] Extracted ${extractedSources.length} sources from page`)
          }
        } catch (error) {
          console.error('[LLM Chatbot Browser] Error extracting sources:', error)
        }
      }

      let newCaptureCount = 0
      let updateCount = 0
      for (const interaction of newInteractions) {
        // Generate prefix key for this content
        const prefixKey = this.getPrefixKey(interaction.content, interaction.type)
        const currentLength = interaction.content.length
        const existingCapture = this.capturedPrefixes.get(prefixKey)

        if (existingCapture) {
          // Same prefix already captured
          if (currentLength <= existingCapture.length) {
            // Same or shorter content - skip (duplicate or subset)
            continue
          }

          // Longer content - this is an update of the previous capture
          const newId = this.generateInteractionId()
          const newInteraction: LLMInteraction = {
            interaction_id: newId,
            updates_interaction_id: existingCapture.interaction_id,  // Reference original
            source: this.parser.name,
            timestamp: Date.now(),
            type: interaction.type,
            content: interaction.content,
            length: currentLength,
            url: window.location.href,
            conversation_id: this.getEffectiveConversationId(),
            sources: interaction.type === 'response' ? extractedSources : undefined,
          }

          // Update the map with new ID and length
          this.capturedPrefixes.set(prefixKey, { interaction_id: newId, length: currentLength })
          this.interactions.push(newInteraction)
          updateCount++

          console.log(
            `[LLM Chatbot Browser] Updated ${interaction.type} (${existingCapture.length} -> ${currentLength} chars): ${interaction.content.substring(0, 50)}...`,
          )
        } else {
          // New content - first capture
          const newId = this.generateInteractionId()
          const newInteraction: LLMInteraction = {
            interaction_id: newId,
            source: this.parser.name,
            timestamp: Date.now(),
            type: interaction.type,
            content: interaction.content,
            length: currentLength,
            url: window.location.href,
            conversation_id: this.getEffectiveConversationId(),
            sources: interaction.type === 'response' ? extractedSources : undefined,
          }

          this.capturedPrefixes.set(prefixKey, { interaction_id: newId, length: currentLength })
          this.interactions.push(newInteraction)
          newCaptureCount++

          console.log(
            `[LLM Chatbot Browser] Captured ${interaction.type}: ${interaction.content.substring(0, 50)}...`,
          )
        }
      }

      if (newCaptureCount > 0 || updateCount > 0) {
        console.log(`[LLM Chatbot Browser] Captured ${newCaptureCount} new, ${updateCount} updates (${this.capturedPrefixes.size} total unique)`)
      }
      console.debug(`[LLM Chatbot Browser] Pending for transmission: ${this.interactions.length}`)
    } catch (error) {
      console.error('[LLM Chatbot Browser] Error processing page:', error)
    }
  }

  private transmitBatch(): void {
    try {
      if (this.interactions.length === 0) {
        console.debug('[LLM Chatbot Browser] No interactions to transmit')
        return
      }

      // Only transmit interactions that have a conversation_id
      // Keep ones without an ID for later backfilling when we get a response
      const readyToTransmit: LLMInteraction[] = []
      const needsBackfill: LLMInteraction[] = []

      for (const interaction of this.interactions) {
        if (interaction.conversation_id) {
          readyToTransmit.push(interaction)
        } else {
          needsBackfill.push(interaction)
        }
      }

      // Keep interactions that need backfilling, clear the ones we're transmitting
      this.interactions = needsBackfill

      if (readyToTransmit.length === 0) {
        console.debug(`[LLM Chatbot Browser] ${needsBackfill.length} interactions waiting for conversation_id`)
        return
      }

      // Get batch to transmit (respect batch size)
      const batch = readyToTransmit.slice(0, this.batchSize)
      // Put any overflow back into the queue (at the front, since they're ready)
      if (readyToTransmit.length > this.batchSize) {
        this.interactions = [...readyToTransmit.slice(this.batchSize), ...this.interactions]
      }

      console.log(`[LLM Chatbot Browser] Transmitting batch of ${batch.length} interactions via message (${needsBackfill.length} waiting for ID)`)

      // Send directly to service worker via message (single transmission path)
      // Note: Removed storage-based transmission to prevent duplicate processing
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(chrome.runtime.sendMessage as any)(
        {
          messageType: 'llmInteractionsBatch',
          interactions: batch,
        },
        () => {
          const lastError = (chrome.runtime as any).lastError
          if (lastError) {
            console.error('[LLM Chatbot Browser] Error sending to service worker:', lastError)
          } else {
            console.log('[LLM Chatbot Browser] Batch sent to service worker successfully')
          }
        }
      )
    } catch (error) {
      console.error('[LLM Chatbot Browser] Error transmitting batch:', error)
    }
  }

  checkRequirement(requirement: string): Promise<boolean> {
    console.debug(`[LLM Chatbot Browser] Checking requirement: ${requirement}`)
    return Promise.resolve(this.enabled)
  }
}

const llmChatbotModule = new LLMChatbotBrowserModule()
registerREXModule(llmChatbotModule)

console.log('[LLM Chatbot Browser] Module registered and ready')

export default llmChatbotModule
