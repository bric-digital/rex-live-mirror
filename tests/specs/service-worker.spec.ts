import { test, expect } from '@playwright/test'

/**
 * Tier 1: Service Worker module tests
 * Tests the service worker message handling for both LLM chatbot interactions
 * and Discover news batches, using mock Chrome APIs.
 */

test.describe('Service Worker -- LLM Chatbot Interactions', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/test-page.html')
    await page.waitForFunction(() => (window as any).testUtilitiesReady === true)
    await page.waitForFunction(() => (window as any).__shimLoaded === true)

    // Inject config to enable the module
    await page.evaluate(async () => {
      await window.chrome.storage.local.set({
        rexIdentifier: 'test-user',
        REXConfiguration: {
          llm_capture: {
            enabled: true,
            sources: ['perplexity', 'chatgpt'],
            batch_size: 10,
            transmission_interval_ms: 60000,
          },
          news_capture: {
            enabled: true,
            sources: ['perplexity-discover'],
          },
        },
      })
    })
    // Give setup() time to process the config
    await page.waitForTimeout(500)
  })

  test('handles llmInteractionsBatch message type', async ({ page }) => {
    const response = await page.evaluate(async () => {
      return await (window as any).__sendMessage({
        messageType: 'llmInteractionsBatch',
        interactions: [
          {
            interaction_id: 'test-id-1',
            source: 'perplexity',
            timestamp: Date.now(),
            type: 'question',
            content: 'What is machine learning?',
            length: 25,
            url: 'https://www.perplexity.ai/search/test',
            conversation_id: 'test-convo-1',
          },
        ],
      })
    })

    expect(response).toEqual({ success: true })
  })

  test('dispatches llm-chatbot-interaction event to PDK', async ({ page }) => {
    await page.evaluate(async () => {
      (window as any).__capturedEvents = []
      await (window as any).__sendMessage({
        messageType: 'llmInteractionsBatch',
        interactions: [
          {
            interaction_id: 'test-id-2',
            source: 'chatgpt',
            timestamp: Date.now(),
            type: 'response',
            content: 'Machine learning is a subset of AI...',
            length: 37,
            url: 'https://chatgpt.com/c/abc-123',
            conversation_id: 'abc-123',
            sources: [{ source_title: 'wikipedia', source_url: 'https://en.wikipedia.org/wiki/ML' }],
          },
        ],
      })
    })

    const events = await page.evaluate(() => (window as any).__capturedEvents)
    expect(events.length).toBeGreaterThanOrEqual(1)

    const event = events.find((e: any) => e.name === 'llm-chatbot-interaction')
    expect(event).toBeDefined()
    expect(event.chatbot_name).toBe('chatgpt')
    expect(event.interaction.type).toBe('response')
    expect(event.interaction.content).toBe('Machine learning is a subset of AI...')
    expect(event.interaction.conversation_id).toBe('abc-123')
    expect(event.data_source).toBe('extension_chatgpt_capture')
  })

  test('deduplicates interactions by content hash', async ({ page }) => {
    await page.evaluate(async () => {
      (window as any).__capturedEvents = []

      const interaction = {
        interaction_id: 'test-id-3',
        source: 'perplexity',
        timestamp: Date.now(),
        type: 'question',
        content: 'Tell me about neural networks',
        length: 30,
        url: 'https://www.perplexity.ai/search/test',
        conversation_id: 'convo-dedup',
      }

      // Send same interaction twice
      await (window as any).__sendMessage({
        messageType: 'llmInteractionsBatch',
        interactions: [interaction],
      })
      await (window as any).__sendMessage({
        messageType: 'llmInteractionsBatch',
        interactions: [interaction],
      })
    })

    const events = await page.evaluate(() => (window as any).__capturedEvents)
    const llmEvents = events.filter((e: any) => e.name === 'llm-chatbot-interaction')
    // Should only have 1 event (second was deduplicated)
    expect(llmEvents.length).toBe(1)
  })

  test('returns false for unknown message types', async ({ page }) => {
    // Unknown messages are not handled by the module (handleMessage returns false).
    // rex-core's dispatch never calls sendResponse for unhandled messages, so
    // we verify indirectly: no events captured, no errors thrown.
    await page.evaluate(async () => {
      (window as any).__capturedEvents = [];

      // Use a race with a timeout since unhandled messages never resolve
      const result = await Promise.race([
        (window as any).__sendMessage({
          messageType: 'unknownMessageType',
          data: {},
        }),
        new Promise(resolve => setTimeout(() => resolve('timeout'), 500)),
      ])
      return result
    })

    // No events should have been dispatched
    const events = await page.evaluate(() => (window as any).__capturedEvents)
    expect(events.length).toBe(0)
  })
})

test.describe('Service Worker -- Discover News', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/test-page.html')
    await page.waitForFunction(() => (window as any).testUtilitiesReady === true)
    await page.waitForFunction(() => (window as any).__shimLoaded === true)

    // Inject config
    await page.evaluate(async () => {
      await window.chrome.storage.local.set({
        rexIdentifier: 'test-user',
        REXConfiguration: {
          llm_capture: {
            enabled: true,
            sources: ['perplexity', 'chatgpt'],
          },
          news_capture: {
            enabled: true,
            sources: ['perplexity-discover'],
          },
        },
      })
    })
    await page.waitForTimeout(500)
  })

  test('handles discoverNewsBatch message type', async ({ page }) => {
    const response = await page.evaluate(async () => {
      return await (window as any).__sendMessage({
        messageType: 'discoverNewsBatch',
        source: 'perplexity-discover',
        url: 'https://www.perplexity.ai/discover',
        timestamp: Date.now(),
        blurbs: [
          {
            headline: 'Test Headline',
            posted: { value: '3 hours ago' },
            source: 'reuters.com',
            authors: [],
            summary: 'Test summary text',
            url: 'https://www.perplexity.ai/page/test-slug',
            citations: [{ source: 'reuters.com', title: 'reuters.com', url: 'https://www.reuters.com/test' }],
          },
        ],
      })
    })

    expect(response).toEqual({ success: true })
  })

  test('dispatches perplexity-discover-news event to PDK', async ({ page }) => {
    await page.evaluate(async () => {
      (window as any).__capturedEvents = []
      await (window as any).__sendMessage({
        messageType: 'discoverNewsBatch',
        source: 'perplexity-discover',
        url: 'https://www.perplexity.ai/discover',
        timestamp: Date.now(),
        blurbs: [
          {
            headline: 'AI Breakthrough',
            posted: { value: '18 hours ago' },
            source: 'reuters.com',
            authors: [],
            summary: 'Researchers developed a new model',
            citations: [{ source: 'reuters.com', title: 'reuters.com', url: 'https://www.reuters.com/ai' }],
          },
        ],
      })
    })

    const events = await page.evaluate(() => (window as any).__capturedEvents)
    const discoverEvents = events.filter((e: any) => e.name === 'perplexity-discover-news')
    expect(discoverEvents.length).toBeGreaterThanOrEqual(1)

    const event = discoverEvents[0]
    expect(event.platform).toBe('perplexity-discover')
    expect(event.data_source).toBe('extension_discover_capture')
    expect(event.blurb).toBeDefined()
    expect(event.blurb.headline).toBe('AI Breakthrough')
    expect(event.blurb.source).toBe('reuters.com')
  })

  test('event includes blurb data: headline, posted, source, citations', async ({ page }) => {
    await page.evaluate(async () => {
      (window as any).__capturedEvents = []
      await (window as any).__sendMessage({
        messageType: 'discoverNewsBatch',
        source: 'perplexity-discover',
        url: 'https://www.perplexity.ai/discover',
        timestamp: Date.now(),
        blurbs: [
          {
            headline: 'Climate Summit',
            posted: { value: '3 hours ago' },
            source: 'bbc.com',
            authors: [],
            summary: 'World leaders agreed',
            citations: [
              { source: 'bbc.com', title: 'bbc.com', url: 'https://www.bbc.com/climate' },
              { source: 'reuters.com', title: 'reuters.com', url: 'https://www.reuters.com/climate' },
            ],
          },
        ],
      })
    })

    const events = await page.evaluate(() => (window as any).__capturedEvents)
    const event = events.find((e: any) => e.name === 'perplexity-discover-news')

    expect(event.blurb.headline).toBe('Climate Summit')
    expect(event.blurb.posted).toEqual({ value: '3 hours ago' })
    expect(event.blurb.source).toBe('bbc.com')
    expect(event.blurb.citations).toHaveLength(2)
    expect(event.blurb.citations[0].source).toBe('bbc.com')
  })

  test('skips blurbs already transmitted (same headline)', async ({ page }) => {
    await page.evaluate(async () => {
      (window as any).__capturedEvents = []

      const blurb = {
        headline: 'Duplicate Headline Test',
        posted: { value: '1 hour ago' },
        source: 'test.com',
        authors: [],
        summary: 'Test summary',
      }

      // Send same blurb twice
      await (window as any).__sendMessage({
        messageType: 'discoverNewsBatch',
        source: 'perplexity-discover',
        url: 'https://www.perplexity.ai/discover',
        timestamp: Date.now(),
        blurbs: [blurb],
      })
      await (window as any).__sendMessage({
        messageType: 'discoverNewsBatch',
        source: 'perplexity-discover',
        url: 'https://www.perplexity.ai/discover',
        timestamp: Date.now(),
        blurbs: [blurb],
      })
    })

    const events = await page.evaluate(() => (window as any).__capturedEvents)
    const discoverEvents = events.filter((e: any) =>
      e.name === 'perplexity-discover-news' && e.blurb?.headline === 'Duplicate Headline Test'
    )
    expect(discoverEvents.length).toBe(1)
  })

  test('processes new blurbs with different headlines', async ({ page }) => {
    await page.evaluate(async () => {
      (window as any).__capturedEvents = []

      await (window as any).__sendMessage({
        messageType: 'discoverNewsBatch',
        source: 'perplexity-discover',
        url: 'https://www.perplexity.ai/discover',
        timestamp: Date.now(),
        blurbs: [
          {
            headline: 'Unique Headline A',
            posted: { value: '1 hour ago' },
            source: 'a.com',
            authors: [],
          },
          {
            headline: 'Unique Headline B',
            posted: { value: '2 hours ago' },
            source: 'b.com',
            authors: [],
          },
        ],
      })
    })

    const events = await page.evaluate(() => (window as any).__capturedEvents)
    const discoverEvents = events.filter((e: any) => e.name === 'perplexity-discover-news')
    expect(discoverEvents.length).toBe(2)

    const headlines = discoverEvents.map((e: any) => e.blurb.headline)
    expect(headlines).toContain('Unique Headline A')
    expect(headlines).toContain('Unique Headline B')
  })
})

test.describe('Service Worker -- Discover Articles', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/test-page.html')
    await page.waitForFunction(() => (window as any).testUtilitiesReady === true)
    await page.waitForFunction(() => (window as any).__shimLoaded === true)

    // Inject config
    await page.evaluate(async () => {
      await window.chrome.storage.local.set({
        rexIdentifier: 'test-user',
        REXConfiguration: {
          llm_capture: {
            enabled: true,
            sources: ['perplexity', 'chatgpt'],
          },
          news_capture: {
            enabled: true,
            sources: ['perplexity-discover'],
          },
        },
      })
    })
    await page.waitForTimeout(500)
  })

  test('handles discoverArticleBatch message type', async ({ page }) => {
    const response = await page.evaluate(async () => {
      return await (window as any).__sendMessage({
        messageType: 'discoverArticleBatch',
        article: {
          headline: 'Test Article Headline',
          posted: { value: '4 hours ago' },
          source: 'cnn.com',
          authors: [],
          'content*': 'Paragraph one.\n\nParagraph two.',
          summary: 'Paragraph one.',
          url: 'https://www.perplexity.ai/discover/you/test-article-slug',
          citations: [{ source: 'cnn.com', title: 'cnn.com', url: 'https://cnn.com/test' }],
        },
      })
    })

    expect(response).toEqual({ success: true })
  })

  test('dispatches perplexity-discover-article event to PDK', async ({ page }) => {
    await page.evaluate(async () => {
      (window as any).__capturedEvents = []
      await (window as any).__sendMessage({
        messageType: 'discoverArticleBatch',
        article: {
          headline: 'Breaking News Article',
          posted: { value: '2 hours ago' },
          source: 'reuters.com',
          authors: [],
          'content*': 'Full article body here.',
          summary: 'Full article body here.',
          url: 'https://www.perplexity.ai/discover/you/breaking-news-slug',
          citations: [{ source: 'reuters.com', title: 'reuters.com', url: 'https://reuters.com/breaking' }],
        },
      })
    })

    const events = await page.evaluate(() => (window as any).__capturedEvents)
    const articleEvents = events.filter((e: any) => e.name === 'perplexity-discover-article')
    expect(articleEvents.length).toBe(1)

    const event = articleEvents[0]
    expect(event.platform).toBe('perplexity-article')
    expect(event.data_source).toBe('extension_discover_capture')
    expect(event.article).toBeDefined()
    expect(event.article.headline).toBe('Breaking News Article')
    expect(event.article.source).toBe('reuters.com')
  })

  test('article event includes content, summary, citations, and url', async ({ page }) => {
    await page.evaluate(async () => {
      (window as any).__capturedEvents = []
      await (window as any).__sendMessage({
        messageType: 'discoverArticleBatch',
        article: {
          headline: 'Detailed Article',
          posted: { value: '6 hours ago' },
          source: 'bbc.com',
          authors: [],
          'content*': 'First paragraph.\n\nSecond paragraph.\n\nThird paragraph.',
          summary: 'First paragraph.',
          url: 'https://www.perplexity.ai/discover/you/detailed-article-slug',
          citations: [
            { source: 'bbc.com', title: 'bbc.com', url: 'https://bbc.com/detail' },
            { source: 'nytimes.com', title: 'nytimes.com', url: 'https://nytimes.com/detail' },
          ],
        },
      })
    })

    const events = await page.evaluate(() => (window as any).__capturedEvents)
    const event = events.find((e: any) => e.name === 'perplexity-discover-article')

    expect(event.article['content*']).toBe('First paragraph.\n\nSecond paragraph.\n\nThird paragraph.')
    expect(event.article.summary).toBe('First paragraph.')
    expect(event.article.url).toBe('https://www.perplexity.ai/discover/you/detailed-article-slug')
    expect(event.article.citations).toHaveLength(2)
    expect(event.article.citations[0].source).toBe('bbc.com')
    expect(event.article.citations[1].source).toBe('nytimes.com')
  })

  test('re-dispatches same URL with updated content (progressive loading)', async ({ page }) => {
    await page.evaluate(async () => {
      (window as any).__capturedEvents = []

      // First dispatch with partial content
      await (window as any).__sendMessage({
        messageType: 'discoverArticleBatch',
        article: {
          headline: 'Progressive Article',
          posted: { value: '1 hour ago' },
          source: 'test.com',
          authors: [],
          'content*': 'First paragraph only.',
          summary: 'First paragraph only.',
          url: 'https://www.perplexity.ai/discover/you/progressive-slug',
        },
      })

      // Second dispatch with more content (page finished loading)
      await (window as any).__sendMessage({
        messageType: 'discoverArticleBatch',
        article: {
          headline: 'Progressive Article',
          posted: { value: '1 hour ago' },
          source: 'test.com',
          authors: [],
          'content*': 'First paragraph only.\n\nSecond paragraph now loaded.',
          summary: 'First paragraph only.',
          url: 'https://www.perplexity.ai/discover/you/progressive-slug',
        },
      })
    })

    const events = await page.evaluate(() => (window as any).__capturedEvents)
    const articleEvents = events.filter((e: any) =>
      e.name === 'perplexity-discover-article' && e.article?.headline === 'Progressive Article'
    )
    // Both dispatches go through — the server uses the latest/longest content
    expect(articleEvents.length).toBe(2)
    expect(articleEvents[1].article['content*']).toContain('Second paragraph now loaded')
  })
})

test.describe('Service Worker -- Finance Sources', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/test-page.html')
    await page.waitForFunction(() => (window as any).testUtilitiesReady === true)
    await page.waitForFunction(() => (window as any).__shimLoaded === true)

    await page.evaluate(async () => {
      await window.chrome.storage.local.set({
        rexIdentifier: 'test-user',
        REXConfiguration: {
          llm_capture: { enabled: true, sources: ['perplexity', 'chatgpt'] },
          news_capture: { enabled: true, sources: ['perplexity-discover', 'perplexity-finance'] },
        },
      })
    })
    await page.waitForTimeout(500)
  })

  test('handles financeMarketSources message type', async ({ page }) => {
    const response = await page.evaluate(async () => {
      return await (window as any).__sendMessage({
        messageType: 'financeMarketSources',
        source: 'perplexity-finance',
        url: 'https://www.perplexity.ai/finance',
        timestamp: Date.now(),
        domains: ['dailyforex.com', 'paybis.com', 'investing.com'],
      })
    })

    expect(response).toEqual({ success: true })
  })

  test('dispatches perplexity-finance-sources event to PDK', async ({ page }) => {
    await page.evaluate(async () => {
      (window as any).__capturedEvents = []
      await (window as any).__sendMessage({
        messageType: 'financeMarketSources',
        source: 'perplexity-finance',
        url: 'https://www.perplexity.ai/finance',
        timestamp: Date.now(),
        domains: ['dailyforex.com', 'paybis.com', 'investing.com'],
      })
    })

    const events = await page.evaluate(() => (window as any).__capturedEvents)
    const financeEvents = events.filter((e: any) => e.name === 'perplexity-finance-sources')
    expect(financeEvents.length).toBe(1)

    const event = financeEvents[0]
    expect(event.platform).toBe('perplexity-finance')
    expect(event.data_source).toBe('extension_finance_capture')
    expect(event.domains).toEqual(['dailyforex.com', 'paybis.com', 'investing.com'])
    expect(event.url).toBe('https://www.perplexity.ai/finance')
  })

  test('does not dispatch when domains array is empty', async ({ page }) => {
    await page.evaluate(async () => {
      (window as any).__capturedEvents = []
      await (window as any).__sendMessage({
        messageType: 'financeMarketSources',
        source: 'perplexity-finance',
        url: 'https://www.perplexity.ai/finance',
        timestamp: Date.now(),
        domains: [],
      })
    })

    const events = await page.evaluate(() => (window as any).__capturedEvents)
    const financeEvents = events.filter((e: any) => e.name === 'perplexity-finance-sources')
    expect(financeEvents.length).toBe(0)
  })
})
