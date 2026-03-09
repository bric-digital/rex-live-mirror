import { test, expect } from '@playwright/test'

/**
 * Tier 1: PerplexityDiscoverParser unit tests
 * Tests run against the discover-test-page.html fixture which replicates
 * the real Perplexity Discover page DOM structure (captured from live site).
 * The parser is loaded via discover-shim.bundle.js which exposes it on window.__DiscoverParser.
 */

test.describe('PerplexityDiscoverParser', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/discover-test-page.html')
    await page.waitForFunction(() => (window as any).testUtilitiesReady === true)
    await page.waitForFunction(() => (window as any).__discoverShimLoaded === true)
  })

  test('extractNewsBlurbs() returns array of NewsBlurb objects', async ({ page }) => {
    const blurbs = await page.evaluate(() => {
      const parser = new (window as any).__DiscoverParser()
      return parser.extractNewsBlurbs()
    })

    expect(Array.isArray(blurbs)).toBe(true)
    expect(blurbs.length).toBe(5)
  })

  test('extracts headline text from each card', async ({ page }) => {
    const blurbs = await page.evaluate(() => {
      const parser = new (window as any).__DiscoverParser()
      return parser.extractNewsBlurbs()
    })

    expect(blurbs[0].headline).toBe('Video shows US Tomahawk missile hitting near Iran school that killed 175')
    expect(blurbs[1].headline).toBe("Goldman Sachs warns of 'extreme fragility' beneath calm US stock market")
    expect(blurbs[2].headline).toBe('Yardeni raises market meltdown odds to 35% as Iran war widens')
    expect(blurbs[3].headline).toBe('Iran reaffirms military alliance with Russia as war intensifies')
    expect(blurbs[4].headline).toBe('Chinese scientists set record with quantum computing breakthrough')
  })

  test('extracts summary/blurb text from featured cards', async ({ page }) => {
    const blurbs = await page.evaluate(() => {
      const parser = new (window as any).__DiscoverParser()
      return parser.extractNewsBlurbs()
    })

    // Only featured cards (1 and 4) have summaries with line-clamp-6
    expect(blurbs[0].summary).toContain('Bellingcat geolocated footage')
    expect(blurbs[3].summary).toContain('Foreign Minister Araghchi')
  })

  test('extracts posted time as raw text DateString', async ({ page }) => {
    const blurbs = await page.evaluate(() => {
      const parser = new (window as any).__DiscoverParser()
      const results = parser.extractNewsBlurbs()
      // DateString instances serialize with a .value property
      return results.map((b: any) => ({ posted: b.posted?.value ?? b.posted }))
    })

    expect(blurbs[0].posted).toBe('4 hours ago')
    expect(blurbs[3].posted).toBe('9 hours ago')
    expect(blurbs[4].posted).toBe('12 hours ago')
    // Cards 2 and 3 have no posted time
    expect(blurbs[1].posted).toBe('')
    expect(blurbs[2].posted).toBe('')
  })

  test('extracts card URL from link href', async ({ page }) => {
    const blurbs = await page.evaluate(() => {
      const parser = new (window as any).__DiscoverParser()
      return parser.extractNewsBlurbs()
    })

    expect(blurbs[0].url).toContain('/discover/you/video-shows-us-tomahawk-missil')
    expect(blurbs[1].url).toContain('/discover/you/goldman-sachs-warns-of-extreme')
    expect(blurbs[2].url).toContain('/discover/you/yardeni-raises-market-meltdown')
    expect(blurbs[3].url).toContain('/discover/you/iran-reaffirms-military-allian')
    expect(blurbs[4].url).toContain('/discover/you/chinese-scientists-set-record')
  })

  test('extracts source domains from favicon images into citations[]', async ({ page }) => {
    const blurbs = await page.evaluate(() => {
      const parser = new (window as any).__DiscoverParser()
      return parser.extractNewsBlurbs()
    })

    // Card 1 has youtube.com, en.wikipedia.org, nytimes.com
    expect(blurbs[0].citations).toHaveLength(3)
    expect(blurbs[0].citations[0].source).toBe('youtube.com')
    expect(blurbs[0].citations[1].source).toBe('en.wikipedia.org')
    expect(blurbs[0].citations[2].source).toBe('nytimes.com')

    // Card 2 has bloomberg.com, finance.yahoo.com, news.bloomberglaw.com
    expect(blurbs[1].citations).toHaveLength(3)
    expect(blurbs[1].citations[0].source).toBe('bloomberg.com')

    // Card 5 has scmp.com, nature.com
    expect(blurbs[4].citations).toHaveLength(2)
    expect(blurbs[4].citations[0].source).toBe('scmp.com')
    expect(blurbs[4].citations[1].source).toBe('nature.com')
  })

  test('uses first source domain as source field', async ({ page }) => {
    const blurbs = await page.evaluate(() => {
      const parser = new (window as any).__DiscoverParser()
      return parser.extractNewsBlurbs()
    })

    expect(blurbs[0].source).toBe('youtube.com')
    expect(blurbs[1].source).toBe('bloomberg.com')
    expect(blurbs[2].source).toBe('yardeniquicktakes.com')
    expect(blurbs[3].source).toBe('youtube.com')
    expect(blurbs[4].source).toBe('scmp.com')
  })

  test('sets authors to empty array', async ({ page }) => {
    const blurbs = await page.evaluate(() => {
      const parser = new (window as any).__DiscoverParser()
      return parser.extractNewsBlurbs()
    })

    for (const blurb of blurbs) {
      expect(blurb.authors).toEqual([])
    }
  })

  test('only extracts from main column, not sidebar', async ({ page }) => {
    const blurbs = await page.evaluate(() => {
      const parser = new (window as any).__DiscoverParser()
      return parser.extractNewsBlurbs()
    })

    // Sidebar has "Make it yours" and topic buttons but parser should only extract from main column
    const headlines = blurbs.map((b: any) => b.headline)
    expect(headlines).not.toContain('Make it yours')
    expect(headlines).not.toContain('Tech & Science')
    expect(headlines).not.toContain('Business')
    expect(blurbs.length).toBe(5)
  })

  test('skips cards without headlines', async ({ page }) => {
    // Add a card without a headline to the main feed container
    await page.evaluate(() => {
      const mainCol = document.querySelector('[data-testid="discover-you"]')!
      const grid = mainCol.querySelector('.gap-md.pb-lg')!
      const noHeadlineCard = document.createElement('div')
      noHeadlineCard.innerHTML = `
        <a class="group/card block h-full outline-none" href="/discover/you/no-headline">
          <div class="group relative h-full">
            <div class="relative flex h-full flex-col">
              <div class="gap-xs flex size-full grow transform-gpu flex-col">
                <div class="gap-md flex flex-col prose">
                  <div class="gap-sm flex flex-col">
                    <!-- No thread-title element here -->
                    <p class="text-quiet text-sm">Some text but no headline</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </a>
      `
      grid.appendChild(noHeadlineCard)
    })

    const blurbs = await page.evaluate(() => {
      const parser = new (window as any).__DiscoverParser()
      return parser.extractNewsBlurbs()
    })

    // Should still be 5 (the no-headline card is skipped)
    expect(blurbs.length).toBe(5)
  })

  test('handles cards with no summary gracefully', async ({ page }) => {
    const blurbs = await page.evaluate(() => {
      const parser = new (window as any).__DiscoverParser()
      return parser.extractNewsBlurbs()
    })

    // Cards 2, 3, and 5 have no summary (no .line-clamp-6 element)
    expect(blurbs[1].headline).toBe("Goldman Sachs warns of 'extreme fragility' beneath calm US stock market")
    expect(blurbs[1].summary).toBeUndefined()
    expect(blurbs[2].summary).toBeUndefined()
    expect(blurbs[4].summary).toBeUndefined()
  })

  test('validateSelectors() returns valid=true when cards present', async ({ page }) => {
    const validation = await page.evaluate(() => {
      const parser = new (window as any).__DiscoverParser()
      return parser.validateSelectors()
    })

    expect(validation.valid).toBe(true)
    expect(validation.cardsFound).toBe(5)
  })

  test('validateSelectors() returns valid=false on empty page', async ({ page }) => {
    // Remove the discover-you container to simulate an empty page
    await page.evaluate(() => {
      const discoverYou = document.querySelector('[data-testid="discover-you"]')
      if (discoverYou) discoverYou.remove()
    })

    const validation = await page.evaluate(() => {
      const parser = new (window as any).__DiscoverParser()
      return parser.validateSelectors()
    })

    expect(validation.valid).toBe(false)
    expect(validation.cardsFound).toBe(0)
  })

  test('uses custom selectors from config when provided', async ({ page }) => {
    const blurbs = await page.evaluate(() => {
      const parser = new (window as any).__DiscoverParser({
        selectors: {
          mainColumn: '[data-testid="discover-you"]',
          newsCard: 'a.group\\/card',
          headline: '[data-testid="thread-title"]',
        }
      })
      return parser.extractNewsBlurbs()
    })

    expect(blurbs.length).toBe(5)
  })

  test('falls back to default selectors when no config', async ({ page }) => {
    const blurbs = await page.evaluate(() => {
      const parser = new (window as any).__DiscoverParser()
      return parser.extractNewsBlurbs()
    })

    // Default selectors should work with the real DOM structure
    expect(blurbs.length).toBe(5)
    expect(blurbs[0].headline).toBeTruthy()
  })
})
