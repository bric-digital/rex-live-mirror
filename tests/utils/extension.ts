import { expect } from '@playwright/test'

type ServiceWorkerLike = {
  evaluate: (pageFunction: any, arg?: unknown) => Promise<unknown> // eslint-disable-line @typescript-eslint/no-explicit-any
}

/**
 * Inject live mirror config + identifier directly into chrome.storage and wait for
 * the module to acknowledge it.
 */
export async function injectConfigAndIdentifier(
  serviceWorker: ServiceWorkerLike,
  overrides: Record<string, unknown> = {}
): Promise<void> {
  await serviceWorker.evaluate(async (config) => {
    await chrome.storage.local.set({
      rexIdentifier: 'rex-live-mirror-test-user',
      REXConfiguration: config,
    })
  }, {
    llm_capture: {
      enabled: true,
      sources: ['perplexity', 'chatgpt', 'gemini', 'claude'],
      batch_size: 10,
      transmission_interval_ms: 60000,
      capture_logged_out: true,
      min_content_length: 10,
      platforms: {},
    },
    news_capture: {
      enabled: true,
      sources: ['perplexity-discover'],
      platforms: {
        perplexity_discover: {
          enabled: true,
          selectors: {},
        },
      },
    },
    ...overrides,
  })
}

/** Clear the captured events array in the service worker. */
export async function resetCapturedEvents(serviceWorker: ServiceWorkerLike): Promise<void> {
  await serviceWorker.evaluate(() => { (self as any).__capturedEvents = [] }) // eslint-disable-line @typescript-eslint/no-explicit-any
}

/**
 * Poll __capturedEvents in the service worker until the predicate matches,
 * then return all matching events.
 */
export async function waitForCapturedEvent(
  serviceWorker: ServiceWorkerLike,
  predicate: (event: Record<string, unknown>) => boolean,
  message: string,
  timeoutMs = 15000
): Promise<Record<string, unknown>[]> {
  await expect.poll(async () => {
    const events = await serviceWorker.evaluate(
      () => (self as any).__capturedEvents as Record<string, unknown>[] // eslint-disable-line @typescript-eslint/no-explicit-any
    ) as Record<string, unknown>[]
    return events.some(predicate)
  }, { timeout: timeoutMs, message }).toBe(true)

  return serviceWorker.evaluate(
    () => (self as any).__capturedEvents as Record<string, unknown>[] // eslint-disable-line @typescript-eslint/no-explicit-any
  ) as Promise<Record<string, unknown>[]>
}
