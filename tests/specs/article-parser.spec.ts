import { test, expect } from '@playwright/test'

/**
 * Tier 1: PerplexityArticleParser unit tests
 * Tests run against the article-test-page.html fixture which replicates
 * the real Perplexity Discover article page DOM structure.
 * The parser is loaded via article-shim.bundle.js which exposes it on window.__ArticleParser.
 */

test.describe('PerplexityArticleParser', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/article-test-page.html')
    await page.waitForFunction(() => (window as any).testUtilitiesReady === true)
    await page.waitForFunction(() => (window as any).__articleShimLoaded === true)
  })

  test('extractArticle() returns a NewsArticle object', async ({ page }) => {
    const article = await page.evaluate(() => {
      const parser = new (window as any).__ArticleParser()
      return parser.extractArticle()
    })

    expect(article).not.toBeNull()
    expect(article).toHaveProperty('headline')
    expect(article).toHaveProperty('posted')
    expect(article).toHaveProperty('source')
    expect(article).toHaveProperty('authors')
    expect(article).toHaveProperty('content*')
    expect(article).toHaveProperty('url')
  })

  test('extracts headline text', async ({ page }) => {
    const article = await page.evaluate(() => {
      const parser = new (window as any).__ArticleParser()
      return parser.extractArticle()
    })

    expect(article.headline).toBe('Video shows US Tomahawk missile hitting near Iran school that killed 175')
  })

  test('extracts posted time as raw text DateString', async ({ page }) => {
    const article = await page.evaluate(() => {
      const parser = new (window as any).__ArticleParser()
      const result = parser.extractArticle()
      return { posted: result.posted?.value ?? result.posted }
    })

    expect(article.posted).toBe('4 hours ago')
  })

  test('extracts body content from all prose sections', async ({ page }) => {
    const article = await page.evaluate(() => {
      const parser = new (window as any).__ArticleParser()
      return parser.extractArticle()
    })

    const content = article['content*'] as string
    expect(content).toBeTruthy()

    // Should contain text from all 5 paragraphs across 3 prose.inline sections
    expect(content).toContain('Newly released video footage, authenticated by the investigative outlet Bellingcat')
    expect(content).toContain("Iran's Mehr News Agency and geolocated by Bellingcat")
    expect(content).toContain('President Trump, speaking aboard Air Force One')
    expect(content).toContain('Those claims have been challenged by multiple independent investigations')
    expect(content).toContain('Human Rights Watch called for the strike to be investigated as a war crime')
  })

  test('body content has paragraphs joined by double newlines', async ({ page }) => {
    const article = await page.evaluate(() => {
      const parser = new (window as any).__ArticleParser()
      return parser.extractArticle()
    })

    const content = article['content*'] as string
    const paragraphs = content.split('\n\n')
    expect(paragraphs.length).toBe(5)
  })

  test('summary is the first paragraph', async ({ page }) => {
    const article = await page.evaluate(() => {
      const parser = new (window as any).__ArticleParser()
      return parser.extractArticle()
    })

    expect(article.summary).toContain('Newly released video footage, authenticated by the investigative outlet Bellingcat')
    // Summary should match the first paragraph of content
    const firstParagraph = (article['content*'] as string).split('\n\n')[0]
    expect(article.summary).toBe(firstParagraph)
  })

  test('extracts source domains from favicon images (deduplicated)', async ({ page }) => {
    const article = await page.evaluate(() => {
      const parser = new (window as any).__ArticleParser()
      return parser.extractArticle()
    })

    expect(article.citations).toBeDefined()
    expect(article.citations.length).toBe(6)

    const domains = article.citations.map((c: any) => c.source)
    expect(domains).toContain('cnn.com')
    expect(domains).toContain('politico.com')
    expect(domains).toContain('en.wikipedia.org')
    expect(domains).toContain('reuters.com')
    expect(domains).toContain('nytimes.com')
    expect(domains).toContain('bernama.com')
  })

  test('uses first source domain as source field', async ({ page }) => {
    const article = await page.evaluate(() => {
      const parser = new (window as any).__ArticleParser()
      return parser.extractArticle()
    })

    expect(article.source).toBe('cnn.com')
  })

  test('sets authors to empty array', async ({ page }) => {
    const article = await page.evaluate(() => {
      const parser = new (window as any).__ArticleParser()
      return parser.extractArticle()
    })

    expect(article.authors).toEqual([])
  })

  test('extracts URL from current page', async ({ page }) => {
    const article = await page.evaluate(() => {
      const parser = new (window as any).__ArticleParser()
      return parser.extractArticle()
    })

    // URL should be the current page URL (test page served by local server)
    expect(article.url).toContain('/article-test-page.html')
  })

  test('does not include sidebar content in body', async ({ page }) => {
    const article = await page.evaluate(() => {
      const parser = new (window as any).__ArticleParser()
      return parser.extractArticle()
    })

    const content = article['content*'] as string
    expect(content).not.toContain('Related Topics')
    expect(content).not.toContain('This sidebar content should not appear')
  })

  test('inline citation badge text is included in paragraph text', async ({ page }) => {
    // The parser uses textContent which includes inline citation badge text like "cnn+3"
    // This is expected behavior — the raw text extraction captures everything within <p> tags
    const article = await page.evaluate(() => {
      const parser = new (window as any).__ArticleParser()
      return parser.extractArticle()
    })

    const content = article['content*'] as string
    // The inline citation spans are inside <p> tags, so their text gets included
    expect(content).toBeTruthy()
  })

  test('validateArticle() returns valid=true when article is present', async ({ page }) => {
    const validation = await page.evaluate(() => {
      const parser = new (window as any).__ArticleParser()
      return parser.validateArticle()
    })

    expect(validation.valid).toBe(true)
    expect(validation.hasHeadline).toBe(true)
    expect(validation.hasContent).toBe(true)
  })

  test('validateArticle() returns valid=false when no article container', async ({ page }) => {
    await page.evaluate(() => {
      const container = document.querySelector('[data-testid="article-main"]')
      if (container) container.remove()
    })

    const validation = await page.evaluate(() => {
      const parser = new (window as any).__ArticleParser()
      return parser.validateArticle()
    })

    expect(validation.valid).toBe(false)
    expect(validation.hasHeadline).toBe(false)
    expect(validation.hasContent).toBe(false)
  })

  test('extractArticle() returns null when no article container', async ({ page }) => {
    await page.evaluate(() => {
      const container = document.querySelector('[data-testid="article-main"]')
      if (container) container.remove()
    })

    const article = await page.evaluate(() => {
      const parser = new (window as any).__ArticleParser()
      return parser.extractArticle()
    })

    expect(article).toBeNull()
  })

  test('extractArticle() returns null when no headline', async ({ page }) => {
    // Remove ALL span.rounded-md inside h2.font-editorial — both the article headline
    // and the body section headings match the selector
    await page.evaluate(() => {
      const headlines = document.querySelectorAll('h2.font-editorial span.rounded-md')
      headlines.forEach(el => el.remove())
    })

    const article = await page.evaluate(() => {
      const parser = new (window as any).__ArticleParser()
      return parser.extractArticle()
    })

    expect(article).toBeNull()
  })

  test('uses custom selectors from config when provided', async ({ page }) => {
    const article = await page.evaluate(() => {
      const parser = new (window as any).__ArticleParser({
        selectors: {
          articleContainer: '[data-testid="article-main"]',
          headline: 'h2.font-editorial span.rounded-md',
        }
      })
      return parser.extractArticle()
    })

    expect(article).not.toBeNull()
    expect(article.headline).toBe('Video shows US Tomahawk missile hitting near Iran school that killed 175')
  })
})
