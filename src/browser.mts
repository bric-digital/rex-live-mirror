import { WebmunkClientModule, registerWebmunkModule } from '@bric/webmunk-core/browser'
import { PerplexityParser } from './chatbots/perplexity.js'
import { ChatGPTParser } from './chatbots/chatgpt.js'
import { GeminiParser } from './chatbots/gemini.js'
import { ClaudeParser } from './chatbots/claude.js'

export interface LLMInteraction {
  source: string
  timestamp: number
  type: 'question' | 'response'
  content: string
  length: number
  url: string 
}

/**
 * LLM Chatbot Module - Browser Context (Content Script)
 * Runs in page context on chatbot websites
 * Responsible for: DOM observation, Q&A extraction, data capture
 */
class LLMChatbotBrowserModule extends WebmunkClientModule {
  private enabled: boolean = false
  private parser: any = null
  private mutationObserver: MutationObserver | null = null
  private interactions: LLMInteraction[] = []
  private batchSize: number = 10
  private transmissionInterval: number = 60000

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
    chrome.storage.local.get('webmunkConfiguration', (result) => {
      try {
        if (result.webmunkConfiguration) {
          const config = result.webmunkConfiguration
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
        this.startCapture()
      }
    } catch (error) {
      console.error('[LLM Chatbot Browser] Error initializing chatbot capture:', error)
    }
  }

  private startCapture(): void {
    try {
      console.log('[LLM Chatbot Browser] Starting capture...')

      // Set up mutation observer for DOM changes
      this.mutationObserver = new MutationObserver(() => {
        try {
          this.processPage()
        } catch (error) {
          console.error('[LLM Chatbot Browser] Error in mutation observer callback:', error)
        }
      })

      // Observe the entire document for changes
      this.mutationObserver.observe(document.body, {
        childList: true,
        subtree: true,
        characterData: true,
      })

      console.log('[LLM Chatbot Browser] DOM mutation observer started')

      // Initial page processing
      this.processPage()

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

  private processPage(): void {
    if (!this.parser) {
      console.debug('[LLM Chatbot Browser] No parser available, skipping page processing')
      return
    }

    try {
      // Extract all current interactions from the page
      const newInteractions = this.parser.extractInteractions()

      if (newInteractions.length > 0) {
        console.log(`[LLM Chatbot Browser] Extracted ${newInteractions.length} interactions from page`)
      }

      for (const interaction of newInteractions) {
        // Check if we already have this interaction
        const exists = this.interactions.some(
          (i) =>
            i.content === interaction.content &&
            i.timestamp > Date.now() - 5000, // Within 5 seconds
        )

        if (!exists) {
          const newInteraction: LLMInteraction = {
            source: this.parser.name,
            timestamp: Date.now(),
            type: interaction.type,
            content: interaction.content,
            length: interaction.content.length,
            url: window.location.href,
          }

          this.interactions.push(newInteraction)

          console.log(
            `[LLM Chatbot Browser] Captured ${interaction.type}: ${interaction.content.substring(0, 50)}...`,
          )
        }
      }

      console.debug(`[LLM Chatbot Browser] Total pending interactions: ${this.interactions.length}`)
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

      // Get batch to transmit
      const batch = this.interactions.splice(0, this.batchSize)

      console.log(`[LLM Chatbot Browser] Transmitting batch of ${batch.length} interactions`)

      // Store in chrome storage for service worker to pick up
      chrome.storage.local.get('llm_interactions', (result) => {
        try {
          const allInteractions = result.llm_interactions || []
          const updated = [...allInteractions, ...batch]

          chrome.storage.local.set({
            llm_interactions: updated,
          }, () => {
            console.log(`[LLM Chatbot Browser] Batch stored in chrome.storage.local. Total: ${updated.length}`)
          })

          // Notify service worker
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ;(chrome.runtime.sendMessage as any)(
            {
              messageType: 'llmInteractionsBatch',
              interactions: batch,
            },
            () => {
              const lastError = (chrome.runtime as any).lastError
              if (lastError) {
                console.error('[LLM Chatbot Browser] Error notifying service worker:', lastError)
              } else {
                console.log('[LLM Chatbot Browser] Service worker notified of batch')
              }
            }
          )
        } catch (error) {
          console.error('[LLM Chatbot Browser] Error during batch transmission:', error)
        }
      })
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
registerWebmunkModule(llmChatbotModule)

console.log('[LLM Chatbot Browser] Module registered and ready')

export default llmChatbotModule
