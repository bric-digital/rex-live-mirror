/**
 * Service worker entry point for the Playwright test extension.
 *
 * Loads the real LLMChatbotServiceWorkerModule (via side-effect import) and wires up
 * rex-core's message handler so Playwright tests can trigger actions via
 * chrome.runtime.sendMessage.
 *
 * Also exposes __testSendMessage on globalThis so tests can route messages from
 * within the service worker evaluation context.
 */
import rexCorePlugin, { registerREXModule, REXServiceWorkerModule } from '@bric/rex-core/service-worker'
import '../../src/service-worker.mts'  // side-effect: registerREXModule(plugin) + setup()

// Enable message routing (the minimum subset of rexCorePlugin.setup() needed for tests).
// This lets chrome.runtime.sendMessage calls from extension pages reach the live mirror module.
chrome.runtime.onMessage.addListener(rexCorePlugin.handleMessage)

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const g = globalThis as any

/**
 * Captures all events dispatched by the live mirror module for test assertions.
 * Tests reset the array with:
 *   await sw.evaluate(() => { self.__capturedEvents = [] })
 */
class EventCaptureModule extends REXServiceWorkerModule {
  moduleName(): string { return 'EventCapture' }
  override setup(): void { /* intentional no-op */ }
  override handleMessage(_msg: unknown, _sender: unknown, _sendResponse: (r: unknown) => void): boolean { return false }
  override logEvent(event: object): void {
    const arr = g.__capturedEvents
    if (Array.isArray(arr)) {
      arr.push(event)
    }
  }
}

g.__capturedEvents = []
registerREXModule(new EventCaptureModule())

/**
 * Route a message through rex-core from within the service worker context.
 * Useful for Playwright's serviceWorker.evaluate() calls.
 */
g.__testSendMessage = (message: Record<string, unknown>): Promise<unknown> =>
  new Promise((resolve) => {
    rexCorePlugin.handleMessage(message, {}, resolve)
  })
