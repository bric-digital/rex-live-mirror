import { test, expect } from '@playwright/test'

/**
 * Tests for the post-2026 Perplexity Discover article DOM:
 *  - citations come from `<span aria-label="<title>" data-state="closed">` wrappers
 *    that contain an external `<a href>` (covers both inline-prose and trailing list)
 *  - inline citation markers in prose are stripped from `content`
 *  - canonical rex-types.NewsArticle shape (`content` not `content*`, no `source` field)
 *  - favicon-proxy fallback picks up domains not represented by an aria-label wrapper
 */
test.describe('PerplexityArticleParser -- new DOM', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/article-test-page-new-dom.html')
    await page.waitForFunction(() => (window as any).testUtilitiesReady === true)
    await page.waitForFunction(() => (window as any).__articleShimLoaded === true)
  })

  test('extractArticle returns a rex-types NewsArticle shape', async ({ page }) => {
    const article = await page.evaluate(() => {
      const parser = new (window as any).__ArticleParser()
      return parser.extractArticle()
    })

    expect(article).not.toBeNull()
    expect(article).toHaveProperty('headline')
    expect(article).toHaveProperty('posted')
    expect(article).toHaveProperty('authors')
    expect(article).toHaveProperty('content')
    expect(article).toHaveProperty('url')
    expect(article).toHaveProperty('citations')
    expect(article).not.toHaveProperty('content*')
    expect(article).not.toHaveProperty('source')
  })

  test('extracts headline text', async ({ page }) => {
    const article = await page.evaluate(() => {
      const parser = new (window as any).__ArticleParser()
      return parser.extractArticle()
    })

    expect(article.headline).toBe("Tencent used Anthropic's Claude to fine-tune its new Hy3 AI model")
  })

  test('posted is a DateString with the published-meta truncate value', async ({ page }) => {
    const posted = await page.evaluate(() => {
      const parser = new (window as any).__ArticleParser()
      return parser.extractArticle().posted
    })

    expect(posted.value).toBe('2 hours ago')
  })

  test('citations include each aria-labeled source with title + url + source host', async ({ page }) => {
    const citations = await page.evaluate(() => {
      const parser = new (window as any).__ArticleParser()
      return parser.extractArticle().citations
    })

    // Inline-prose citations + trailing list, deduped by URL.
    // Expected unique citations from aria-labels:
    //  1. theinformation (inline + trailing — dedup → 1)
    //  2. tencent.com (inline)
    //  3. reuters.com (inline)
    //  4. computerworld.com (trailing only)
    //  5. tech.yahoo.com (trailing only)
    // Plus 2 favicon-only fallbacks (anthropic.com, cnbc.com — theinformation already covered).
    // = 7 total citations.

    const titles = citations.map((c: any) => c.title)
    expect(titles).toContain("Tencent's New Model Shows Improvement, Partly Thanks to Anthropic")
    expect(titles).toContain('Tencent Unveils Hy3 preview; Model Enhances Agent Capabilities')
    expect(titles).toContain('Anthropic flags distillation by Chinese firms')
    expect(titles).toContain('Former OpenAI research scientist launches new AI model for Tencent')
    expect(titles).toContain("Tencent's New Hy3 AI Model Is the Most Efficient Chinese LLM")

    const sources = citations.map((c: any) => c.source)
    expect(sources).toContain('theinformation.com')
    expect(sources).toContain('tencent.com')
    expect(sources).toContain('reuters.com')
    expect(sources).toContain('computerworld.com')
    expect(sources).toContain('tech.yahoo.com')

    // Each aria-labeled citation has a URL
    const aria = citations.filter((c: any) => c.title)
    for (const c of aria) {
      expect(c.url).toMatch(/^https?:\/\//)
    }
  })

  test('citations dedup the same URL appearing both inline and in the trailing list', async ({ page }) => {
    const citations = await page.evaluate(() => {
      const parser = new (window as any).__ArticleParser()
      return parser.extractArticle().citations
    })

    // theinformation URL appears twice in the fixture; should only emit one citation
    const informationCount = citations.filter((c: any) => c.source === 'theinformation.com').length
    expect(informationCount).toBe(1)
  })

  test('citations exclude perplexity.ai internal links and aria-labeled UI buttons', async ({ page }) => {
    const citations = await page.evaluate(() => {
      const parser = new (window as any).__ArticleParser()
      return parser.extractArticle().citations
    })

    const titles = citations.map((c: any) => c.title)
    expect(titles).not.toContain('Bookmark')
    expect(titles).not.toContain('Perplexity related thread')

    for (const c of citations) {
      if (c.url) expect(c.url).not.toContain('perplexity.ai')
    }
  })

  test('favicon-proxy domains fill in citations not represented by aria-labels', async ({ page }) => {
    const citations = await page.evaluate(() => {
      const parser = new (window as any).__ArticleParser()
      return parser.extractArticle().citations
    })

    // anthropic.com and cnbc.com appear only as favicons in the fixture
    const sources = citations.map((c: any) => c.source)
    expect(sources).toContain('anthropic.com')
    expect(sources).toContain('cnbc.com')

    // Favicon-only fallbacks have empty title and no url
    const anthropic = citations.find((c: any) => c.source === 'anthropic.com')
    expect(anthropic.title).toBe('')
    expect(anthropic.url).toBeUndefined()
  })

  test('content strips inline citation markers (theinformation / tencent+3 / reuters+1)', async ({ page }) => {
    const content = await page.evaluate(() => {
      const parser = new (window as any).__ArticleParser()
      return parser.extractArticle().content
    })

    // The leaked citation slugs should NOT appear in clean content
    expect(content).not.toContain('theinformation')
    expect(content).not.toContain('tencent+3')
    expect(content).not.toContain('reuters+1')

    // But the actual prose should still be present
    expect(content).toContain('Tencent employees used Anthropic')
    expect(content).toContain('Mixture-of-Experts')
    expect(content).toContain('distillation campaigns')
  })

  test('summary is the first paragraph of cleaned content', async ({ page }) => {
    const article = await page.evaluate(() => {
      const parser = new (window as any).__ArticleParser()
      return parser.extractArticle()
    })

    expect(article.summary).toContain('Tencent employees used Anthropic')
    expect(article.summary).not.toContain('theinformation')
  })

  test('validateArticle returns valid=true when headline and content present', async ({ page }) => {
    const validation = await page.evaluate(() => {
      const parser = new (window as any).__ArticleParser()
      return parser.validateArticle()
    })

    expect(validation.valid).toBe(true)
    expect(validation.hasHeadline).toBe(true)
    expect(validation.hasContent).toBe(true)
  })
})
