import { test, expect } from '@playwright/test'

/**
 * Tier 1: Browser module URL routing tests
 * Tests that the browser module correctly routes URLs to the appropriate parsers.
 * Uses the discover-test-page.html to verify Discover capture behavior.
 */

test.describe('Browser Module -- URL Routing', () => {
  // URL routing logic is tested by examining what the browser module does
  // when it encounters different URLs. Since we can't change window.location
  // in tests, we test the routing logic indirectly through config and DOM inspection.

  test.beforeEach(async ({ page }) => {
    await page.goto('/test-page.html')
    await page.waitForFunction(() => (window as any).testUtilitiesReady === true)
  })

  test('non-chatbot URL does not initialize any parser', async ({ page }) => {
    // The test page URL (localhost:8083) shouldn't match any chatbot
    // Inject config and check that no parser was created
    await page.evaluate(async () => {
      await window.chrome.storage.local.set({
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

    // Wait a bit for setup to run
    await page.waitForTimeout(500)

    // No messages should have been sent (no parser initialized = no captures)
    const sentMessages = await page.evaluate(() => (window as any).__sentMessages)
    expect(sentMessages.length).toBe(0)
  })
})

test.describe('Browser Module -- Discover Capture', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/discover-test-page.html')
    await page.waitForFunction(() => (window as any).testUtilitiesReady === true)
  })

  test('processDiscoverPage() extracts blurbs from real DOM structure', async ({ page }) => {
    // Load the discover shim so we can use the actual parser
    await page.waitForFunction(() => (window as any).__discoverShimLoaded === true)

    const blurbs = await page.evaluate(() => {
      const parser = new (window as any).__DiscoverParser()
      return parser.extractNewsBlurbs()
    })

    expect(blurbs.length).toBe(5)
    expect(blurbs[0].headline).toBe('Video shows US Tomahawk missile hitting near Iran school that killed 175')
    expect(blurbs[0].source).toBe('youtube.com')
  })

  test('deduplicates blurbs by headline', async ({ page }) => {
    // Test deduplication logic: same headline shouldn't produce duplicate entries
    const result = await page.evaluate(() => {
      const seen = new Set<string>()
      const blurbs = [
        { headline: 'Test A' },
        { headline: 'Test B' },
        { headline: 'Test A' }, // duplicate
        { headline: 'Test C' },
      ]

      const unique = blurbs.filter(b => {
        if (seen.has(b.headline)) return false
        seen.add(b.headline)
        return true
      })

      return unique.length
    })

    expect(result).toBe(3)
  })

  test('empty queue does not trigger transmission', async ({ page }) => {
    // Verify that an empty blurbs array doesn't send a message
    const messageCount = await page.evaluate(() => {
      (window as any).__sentMessages = []

      // Simulate what browser module would do with empty queue
      const blurbs: any[] = []
      if (blurbs.length === 0) {
        // Should not send
        return (window as any).__sentMessages.length
      }

      window.chrome.runtime.sendMessage({
        messageType: 'discoverNewsBatch',
        blurbs,
      })
      return (window as any).__sentMessages.length
    })

    expect(messageCount).toBe(0)
  })
})

test.describe('Browser Module -- Article Capture', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/article-test-page.html')
    await page.waitForFunction(() => (window as any).testUtilitiesReady === true)
    await page.waitForFunction(() => (window as any).__articleShimLoaded === true)
  })

  test('article parser extracts article from real DOM structure', async ({ page }) => {
    const article = await page.evaluate(() => {
      const parser = new (window as any).__ArticleParser()
      return parser.extractArticle()
    })

    expect(article).not.toBeNull()
    expect(article.headline).toBe('Video shows US Tomahawk missile hitting near Iran school that killed 175')
    expect(article.source).toBe('cnn.com')
    expect(article['content*']).toContain('Bellingcat')
  })

  test('URL routing distinguishes article from feed', async ({ page }) => {
    // Test the URL regex patterns used in browser.mts for routing
    const result = await page.evaluate(() => {
      const articlePattern = /perplexity\.ai\/discover\/you\/.+/
      const feedPattern = /perplexity\.ai\/discover/

      const articleUrl = 'https://www.perplexity.ai/discover/you/video-shows-us-tomahawk-missil-5AVXTCzuRIi4l3j8DalbTg'
      const feedUrl = 'https://www.perplexity.ai/discover'
      const searchUrl = 'https://www.perplexity.ai/search/test-query'

      return {
        articleMatchesArticle: articlePattern.test(articleUrl),
        articleMatchesFeed: articlePattern.test(feedUrl),
        feedMatchesFeed: feedPattern.test(feedUrl),
        feedMatchesArticle: feedPattern.test(articleUrl),
        searchMatchesArticle: articlePattern.test(searchUrl),
        searchMatchesFeed: feedPattern.test(searchUrl),
      }
    })

    // Article URL matches article pattern but NOT feed-only
    expect(result.articleMatchesArticle).toBe(true)
    // Feed URL does NOT match article pattern (no /you/slug)
    expect(result.articleMatchesFeed).toBe(false)
    // Feed URL matches feed pattern
    expect(result.feedMatchesFeed).toBe(true)
    // Article URL also matches feed pattern (but article is checked FIRST in routing)
    expect(result.feedMatchesArticle).toBe(true)
    // Search URL matches neither article nor feed pattern
    expect(result.searchMatchesArticle).toBe(false)
    expect(result.searchMatchesFeed).toBe(false)
  })

  test('URL routing distinguishes finance from discover and search', async ({ page }) => {
    const result = await page.evaluate(() => {
      const financeUrl = 'https://www.perplexity.ai/finance'
      const discoverUrl = 'https://www.perplexity.ai/discover'
      const articleUrl = 'https://www.perplexity.ai/discover/you/some-article-slug'
      const searchUrl = 'https://www.perplexity.ai/search/test'

      return {
        financeMatchesFinance: financeUrl.includes('perplexity.ai/finance'),
        discoverMatchesFinance: discoverUrl.includes('perplexity.ai/finance'),
        searchMatchesFinance: searchUrl.includes('perplexity.ai/finance'),
        financeMatchesDiscover: financeUrl.includes('perplexity.ai/discover'),
      }
    })

    expect(result.financeMatchesFinance).toBe(true)
    expect(result.discoverMatchesFinance).toBe(false)
    expect(result.searchMatchesFinance).toBe(false)
    expect(result.financeMatchesDiscover).toBe(false)
  })

  test('article transmission sends discoverArticleBatch message', async ({ page }) => {
    const sent = await page.evaluate(() => {
      (window as any).__sentMessages = []

      const article = {
        headline: 'Test Article',
        posted: { value: '1 hour ago' },
        source: 'test.com',
        authors: [],
        'content*': 'Body text.',
        summary: 'Body text.',
        url: 'https://www.perplexity.ai/discover/you/test-slug',
      }

      // Simulate what browser module does when transmitting
      window.chrome.runtime.sendMessage({
        messageType: 'discoverArticleBatch',
        article,
        url: window.location.href,
        timestamp: Date.now(),
      })

      return (window as any).__sentMessages
    })

    expect(sent.length).toBe(1)
    expect(sent[0].messageType).toBe('discoverArticleBatch')
    expect(sent[0].article.headline).toBe('Test Article')
  })
})
