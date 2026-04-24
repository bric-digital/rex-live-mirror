import { expect } from '@playwright/test'

type ServiceWorkerLike = {
  evaluate: (pageFunction: any, arg?: unknown) => Promise<unknown> // eslint-disable-line @typescript-eslint/no-explicit-any
}

/**
 * Inject live mirror config + identifier via rex-core's message API.
 * Identifier is set through `setIdentifier`; configuration through
 * `loadInitialConfiguration` — both consumed by rex-core, not by direct
 * chrome.storage.local writes, so modules follow their real config path.
 */
export async function injectConfigAndIdentifier(
  serviceWorker: ServiceWorkerLike,
  overrides: Record<string, unknown> = {}
): Promise<void> {
  const configuration = {
    configuration_url: 'config.json',
    identifier: 'rex-live-mirror-test-user',
    ui: [{ title: 'Test', identifier: 'main', default: true }],
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
  }

  await serviceWorker.evaluate(async (payload) => {
    const sendCore = (message: Record<string, unknown>) => new Promise<unknown>((resolve) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(self as any).rexCorePlugin.handleMessage(message, {}, resolve)
    })

    await sendCore({
      messageType: 'setIdentifier',
      identifier: 'rex-live-mirror-test-user',
    })
    await sendCore({
      messageType: 'loadInitialConfiguration',
      configuration: payload,
    })
  }, configuration)
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
