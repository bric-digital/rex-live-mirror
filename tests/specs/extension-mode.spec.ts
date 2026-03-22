import { test, expect, chromium, type BrowserContext, type Worker } from '@playwright/test'
import path from 'path'
import { fileURLToPath } from 'url'
import {
  injectConfigAndIdentifier,
  resetCapturedEvents,
  waitForCapturedEvent,
} from '../utils/extension.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

/**
 * Tier 2: Real extension e2e tests
 * Loads the test extension in Chromium and validates the service worker
 * message pipeline using the real extension.
 */
test.describe('rex-live-mirror -- real extension', () => {
  test.describe.configure({ mode: 'serial' })

  let context: BrowserContext
  let serviceWorker: Worker

  test.beforeAll(async () => {
    const extensionPath = path.resolve(__dirname, '../extension')

    context = await chromium.launchPersistentContext('', {
      headless: false, // CDP bridge doesn't expose service workers in headless mode
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
        '--no-first-run',
        '--disable-gpu',
      ],
    })

    // Wait for the service worker to become available
    const sw = context.serviceWorkers()[0]
      || await context.waitForEvent('serviceworker')
    serviceWorker = sw
  })

  test.afterAll(async () => {
    if (context) await context.close()
  })

  test('service worker starts and loads', async () => {
    expect(serviceWorker).toBeDefined()
  })

  test('discoverNewsBatch message is handled and dispatched to PDK', async () => {
    await injectConfigAndIdentifier(serviceWorker)
    // Give setup time to process
    await new Promise(r => setTimeout(r, 1000))
    await resetCapturedEvents(serviceWorker)

    // Send a discoverNewsBatch message through rex-core's message dispatch
    await serviceWorker.evaluate(async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return await (self as any).__testSendMessage({
        messageType: 'discoverNewsBatch',
        source: 'perplexity-discover',
        url: 'https://www.perplexity.ai/discover',
        timestamp: Date.now(),
        blurbs: [
          {
            headline: 'E2E Test Headline',
            posted: { value: '2 hours ago' },
            source: 'e2e-test.com',
            authors: [],
            summary: 'End to end test summary',
            citations: [
              { source: 'e2e-test.com', title: 'e2e-test.com', url: 'https://e2e-test.com/article' },
            ],
          },
        ],
      })
    })

    // Wait for the event to be captured
    const events = await waitForCapturedEvent(
      serviceWorker,
      (event) => event.name === 'perplexity-discover-news',
      'Expected perplexity-discover-news event to be dispatched',
      10000
    )

    const discoverEvent = events.find((e: any) => e.name === 'perplexity-discover-news')
    expect(discoverEvent).toBeDefined()
  })

  test('dispatched event has correct structure and fields', async () => {
    await resetCapturedEvents(serviceWorker)

    await serviceWorker.evaluate(async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return await (self as any).__testSendMessage({
        messageType: 'discoverNewsBatch',
        source: 'perplexity-discover',
        url: 'https://www.perplexity.ai/discover',
        timestamp: Date.now(),
        blurbs: [
          {
            headline: 'Structure Test',
            posted: { value: 'Yesterday' },
            source: 'structure.com',
            authors: [],
            summary: 'Testing event structure',
            url: 'https://www.perplexity.ai/page/test-slug',
            citations: [
              { source: 'structure.com', title: 'structure.com', url: 'https://structure.com/article' },
            ],
          },
        ],
      })
    })

    const events = await waitForCapturedEvent(
      serviceWorker,
      (event) => (event as any).blurb?.headline === 'Structure Test',
      'Expected event with headline "Structure Test"',
      10000
    )

    const event = events.find((e: any) => e.blurb?.headline === 'Structure Test') as any
    expect(event.name).toBe('perplexity-discover-news')
    expect(event.platform).toBe('perplexity-discover')
    expect(event.data_source).toBe('extension_discover_capture')
    expect(event.blurb.headline).toBe('Structure Test')
    expect(event.blurb.posted).toEqual({ value: 'Yesterday' })
    expect(event.blurb.source).toBe('structure.com')
    expect(event.blurb.authors).toEqual([])
  })

  test('llmInteractionsBatch still works alongside discover', async () => {
    await resetCapturedEvents(serviceWorker)

    await serviceWorker.evaluate(async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return await (self as any).__testSendMessage({
        messageType: 'llmInteractionsBatch',
        interactions: [
          {
            interaction_id: 'e2e-llm-test',
            source: 'perplexity',
            timestamp: Date.now(),
            type: 'question',
            content: 'E2E test question for chatbot pipeline',
            length: 40,
            url: 'https://www.perplexity.ai/search/test',
            conversation_id: 'e2e-convo-1',
          },
        ],
      })
    })

    const events = await waitForCapturedEvent(
      serviceWorker,
      (event) => event.name === 'llm-chatbot-interaction',
      'Expected llm-chatbot-interaction event',
      10000
    )

    const llmEvent = events.find((e: any) => e.name === 'llm-chatbot-interaction')
    expect(llmEvent).toBeDefined()
  })
})
