import { test, expect } from '@playwright/test'

/**
 * Tests for the post-2026 Perplexity Discover DOM:
 *  - favicons via Google's proxy (`/s2/favicons?domain=<host>`) with empty alt text
 *  - visible "N sources" string per card
 *  - new fields populated: position (getBoundingClientRect), metadata.{cardIndex, sourceCount}
 */
test.describe('PerplexityDiscoverParser -- new DOM (Google favicon proxy)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/discover-test-page-new-dom.html')
    await page.waitForFunction(() => (window as any).testUtilitiesReady === true)
    await page.waitForFunction(() => (window as any).__discoverShimLoaded === true)
  })

  test('extracts citations from favicon-proxy `?domain=` query param', async ({ page }) => {
    const blurbs = await page.evaluate(() => {
      const parser = new (window as any).__DiscoverParser()
      return parser.extractNewsBlurbs()
    })

    expect(blurbs).toHaveLength(3)

    expect(blurbs[0].citations).toHaveLength(3)
    expect(blurbs[0].citations[0].source).toBe('macrumors.com')
    expect(blurbs[0].citations[1].source).toBe('youtube.com')
    expect(blurbs[0].citations[2].source).toBe('forbes.com')

    expect(blurbs[1].citations).toHaveLength(3)
    expect(blurbs[1].citations[0].source).toBe('news.bitcoin.com')
  })

  test('citations are deduplicated when the same domain appears twice in one card', async ({ page }) => {
    const blurbs = await page.evaluate(() => {
      const parser = new (window as any).__DiscoverParser()
      return parser.extractNewsBlurbs()
    })

    // Card 3 has reuters.com listed twice in favicons; dedup → 2 entries
    expect(blurbs[2].citations).toHaveLength(2)
    expect(blurbs[2].citations[0].source).toBe('reuters.com')
    expect(blurbs[2].citations[1].source).toBe('cnbc.com')
  })

  test('source field equals first citation domain', async ({ page }) => {
    const blurbs = await page.evaluate(() => {
      const parser = new (window as any).__DiscoverParser()
      return parser.extractNewsBlurbs()
    })

    expect(blurbs[0].source).toBe('macrumors.com')
    expect(blurbs[1].source).toBe('news.bitcoin.com')
    expect(blurbs[2].source).toBe('reuters.com')
  })

  test('metadata.sourceCount parses from "N sources" text', async ({ page }) => {
    const blurbs = await page.evaluate(() => {
      const parser = new (window as any).__DiscoverParser()
      return parser.extractNewsBlurbs()
    })

    expect(blurbs[0].metadata.sourceCount).toBe(29)
    expect(blurbs[1].metadata.sourceCount).toBe(15)
    expect(blurbs[2].metadata.sourceCount).toBe(69)
  })

  test('metadata.cardIndex is 0-based document order', async ({ page }) => {
    const blurbs = await page.evaluate(() => {
      const parser = new (window as any).__DiscoverParser()
      return parser.extractNewsBlurbs()
    })

    expect(blurbs[0].metadata.cardIndex).toBe(0)
    expect(blurbs[1].metadata.cardIndex).toBe(1)
    expect(blurbs[2].metadata.cardIndex).toBe(2)
  })

  test('position carries getBoundingClientRect width/height — wide vs narrow cards differ', async ({ page }) => {
    const blurbs = await page.evaluate(() => {
      const parser = new (window as any).__DiscoverParser()
      return parser.extractNewsBlurbs()
    })

    // Card 0 is the wide hero (mock styled to 900px); cards 1 and 2 are narrow (290px).
    expect(blurbs[0].position.width).toBeGreaterThan(blurbs[1].position.width)
    expect(blurbs[1].position.width).toBeCloseTo(blurbs[2].position.width, 0)
    // All four rect fields are present and finite
    for (const blurb of blurbs) {
      expect(Number.isFinite(blurb.position.top)).toBe(true)
      expect(Number.isFinite(blurb.position.left)).toBe(true)
      expect(Number.isFinite(blurb.position.width)).toBe(true)
      expect(Number.isFinite(blurb.position.height)).toBe(true)
    }
  })

  test('posted is a DateString (object with .value) when present, empty value otherwise', async ({ page }) => {
    const blurbs = await page.evaluate(() => {
      const parser = new (window as any).__DiscoverParser()
      return parser.extractNewsBlurbs()
    })

    // DateString serializes through JSON as { value: '...' }
    expect(blurbs[0].posted.value).toBe('2 hours ago')
    expect(blurbs[1].posted.value).toBe('')
    expect(blurbs[2].posted.value).toBe('')
  })
})
