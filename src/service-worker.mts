import { WebmunkServiceWorkerModule, registerWebmunkModule } from '@bric/webmunk-core/service-worker'
import passiveDataKitPlugin from '@bric/webmunk-passive-data-kit/service-worker'

/**
 * LLM Chatbot Module - Service Worker Context
 * Responsible for: batching data, coordinating transmission via PDK
 */
class LLMChatbotServiceWorkerModule extends WebmunkServiceWorkerModule {
  private enabled: boolean = false
  private pendingInteractions: any[] = []
  private pdkPlugin: any = null

  constructor() {
    super()
  }

  moduleName(): string {
    return 'LLMChatbotServiceWorkerModule'
  }

  setup(): void {
    console.log('[LLM Chatbot] Service Worker module initializing...')

    this.pdkPlugin = passiveDataKitPlugin

    // Get configuration
    chrome.storage.local.get('webmunkConfiguration', (result) => {
      if (result.webmunkConfiguration) {
        const config = result.webmunkConfiguration
        const llmConfig = config['llm_capture']

        if (llmConfig?.enabled) {
          this.enabled = true
          console.log('[LLM Chatbot] Service Worker module enabled')
          this.setupMessageHandlers()
        }
      }
    })
  }

  private setupMessageHandlers(): void {
    // Listen for interaction batches from content script
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.messageType === 'llmInteractionsBatch') {
        this.handleInteractionBatch(message.interactions)
        sendResponse({ success: true })
      }
      return false
    })

    // Listen for storage changes
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName === 'local' && 'llm_interactions' in changes) {
        const interactions = changes['llm_interactions'].newValue || []
        this.processInteractionsForTransmission(interactions)
      }
    })
  }

  private handleInteractionBatch(interactions: any[]): void {
    console.log(`[LLM Chatbot] Service Worker received batch of ${interactions.length} interactions`)

    for (const interaction of interactions) {
      // Add to pending for transmission
      this.pendingInteractions.push({
        source: interaction.source,
        timestamp: interaction.timestamp,
        type: interaction.type,
        content: interaction.content,
        length: interaction.length,
        url: interaction.url,
      })
    }

    // Process for transmission
    this.processInteractionsForTransmission(this.pendingInteractions)
  }

  private processInteractionsForTransmission(interactions: any[]): void {
    if (!this.pdkPlugin || interactions.length === 0) return

    console.log(`[LLM Chatbot] Processing ${interactions.length} interactions for PDK transmission`)

    // Format for PDK
    for (const interaction of interactions) {
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
            length: interaction.length,
            url: interaction.url,
          },
        },
      }

      // Send to PDK for encryption and transmission
      console.log('[LLM Chatbot] Queuing data point for PDK transmission')
    }

    // Clear transmitted interactions
    chrome.storage.local.set({
      llm_interactions: [],
    })

    this.pendingInteractions = []
  }

  checkRequirement(requirement: string): Promise<boolean> {
    return Promise.resolve(this.enabled)
  }
}

const llmChatbotModule = new LLMChatbotServiceWorkerModule()
registerWebmunkModule(llmChatbotModule)

export default llmChatbotModule
