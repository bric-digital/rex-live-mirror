/**
 * Test shim for rex-live-mirror service worker module.
 *
 * Loads the real LLMChatbotServiceWorkerModule and registers an EventCaptureModule
 * alongside it, so Playwright tests can assert on dispatched events.
 *
 * Load tests/src/build/test-shim.bundle.js in the test page AFTER the
 * chrome mock has been defined on window.
 */
import rexCorePlugin, { registerREXModule, REXServiceWorkerModule } from '@bric/rex-core/service-worker'
import liveMirrorPlugin from '../../src/service-worker.mts'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const g = globalThis as any

// Set up event capture array. Populated by EventCaptureModule.logEvent.
// Tests reset this with: page.evaluate(() => { window.__capturedEvents = [] })
g.__capturedEvents = []

/**
 * Captures all events dispatched by the live mirror module for test assertions.
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

registerREXModule(new EventCaptureModule())

// Expose the plugin instance so tests can call methods directly if needed.
g.__liveMirrorPlugin = liveMirrorPlugin

// Expose a helper that routes a message through rex-core's module dispatch, matching
// the real extension behaviour (the live mirror module registers with rex-core, not
// chrome.runtime.onMessage directly).
g.__sendMessage = (message: Record<string, unknown>): Promise<unknown> => {
  return new Promise((resolve) => {
    rexCorePlugin.handleMessage(message, {}, resolve)
  })
}

// Signal that the shim has finished loading (module setup() may still be in-flight).
g.__shimLoaded = true
