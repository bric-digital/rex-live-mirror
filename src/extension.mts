import { REXExtensionModule, registerREXModule } from '@bric/rex-core/extension'

/**
 * LLM Chatbot Module - Extension Context
 * Runs in the extension's HTML page context
 * Responsible for: UI setup, status management, user-facing features
 */
class LLMChatbotExtensionModule extends REXExtensionModule {
  private enabled: boolean = false
  private activeChats: Map<string, boolean> = new Map()
  private stats = {
    totalInteractions: 0,
    lastInteractionTime: 0,
    platformCounts: {} as Record<string, number>,
  }

  constructor() {
    super()
    console.log('[LLM Chatbot Extension] Constructor called')
  }

  moduleName(): string {
    return 'LLMChatbotExtensionModule'
  }

  setup(): void {
    console.log('[LLM Chatbot Extension] Setup starting...')

    // Get configuration from storage
    chrome.storage.local.get('webmunkConfiguration', (result) => {
      try {
        if (result.webmunkConfiguration) {
          const config = result.webmunkConfiguration
          const llmConfig = config['llm_capture']

          console.log('[LLM Chatbot Extension] Configuration loaded:', llmConfig)

          if (llmConfig?.enabled) {
            this.enabled = true
            console.log('[LLM Chatbot Extension] Module enabled via configuration')
            console.log('[LLM Chatbot Extension] Enabled sources:', llmConfig.sources)
            console.log('[LLM Chatbot Extension] Transmission interval:', llmConfig.transmission_interval_ms, 'ms')
            console.log('[LLM Chatbot Extension] Batch size:', llmConfig.batch_size)

            this.initializeUI()
            this.setupStorageListener()
          } else {
            console.warn('[LLM Chatbot Extension] Module disabled in configuration')
          }
        } else {
          console.warn('[LLM Chatbot Extension] No configuration found in storage')
        }
      } catch (error) {
        console.error('[LLM Chatbot Extension] Error loading configuration:', error)
      }
    })
  }

  private initializeUI(): void {
    console.log('[LLM Chatbot Extension] Initializing UI...')

    // Initialize statistics tracking
    chrome.storage.local.get('llm_stats', (result) => {
      try {
        if (result.llm_stats) {
          this.stats = result.llm_stats
          console.log('[LLM Chatbot Extension] Loaded existing stats:', this.stats)
        } else {
          console.log('[LLM Chatbot Extension] No existing stats found, starting fresh')
        }
      } catch (error) {
        console.error('[LLM Chatbot Extension] Error initializing UI:', error)
      }
    })
  }

  private setupStorageListener(): void {
    console.log('[LLM Chatbot Extension] Setting up storage listener...')

    // Listen for interaction data from content scripts
    chrome.storage.onChanged.addListener((changes, areaName) => {
      try {
        if (areaName === 'local' && 'llm_interactions' in changes) {
          const interactions = changes['llm_interactions'].newValue || []
          console.log(`[LLM Chatbot Extension] Detected ${interactions.length} new interactions`)
          this.updateStats(interactions)
        }
      } catch (error) {
        console.error('[LLM Chatbot Extension] Error in storage listener:', error)
      }
    })
  }

  private updateStats(interactions: any[]): void {
    console.log(`[LLM Chatbot Extension] Updating stats with ${interactions.length} interactions`)

    for (const interaction of interactions) {
      try {
        this.stats.totalInteractions += 1
        this.stats.lastInteractionTime = Date.now()

        const platform = interaction.source || 'unknown'
        this.stats.platformCounts[platform] = (this.stats.platformCounts[platform] || 0) + 1

        console.log(`[LLM Chatbot Extension] Updated: ${platform} - Total: ${this.stats.totalInteractions}`)
      } catch (error) {
        console.error('[LLM Chatbot Extension] Error updating stats for interaction:', interaction, error)
      }
    }

    // Save updated stats
    chrome.storage.local.set({ llm_stats: this.stats }, () => {
      console.log('[LLM Chatbot Extension] Stats saved:', this.stats)
    })
  }

  checkRequirement(requirement: string): Promise<boolean> {
    console.log(`[LLM Chatbot Extension] Checking requirement: ${requirement}`)
    return Promise.resolve(this.enabled)
  }
}

const llmChatbotModule = new LLMChatbotExtensionModule()
registerREXModule(llmChatbotModule)

console.log('[LLM Chatbot Extension] Module registered and ready')

export default llmChatbotModule
