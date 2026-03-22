import { test, expect } from '@playwright/test'

/**
 * Tier 1: PerplexityFinanceParser unit tests
 * Tests run against the finance-test-page.html fixture which replicates
 * the Market Summary section from the real Perplexity Finance page.
 * The parser is loaded via finance-shim.bundle.js which exposes it on window.__FinanceParser.
 */

test.describe('PerplexityFinanceParser', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/finance-test-page.html')
    await page.waitForFunction(() => (window as any).testUtilitiesReady === true)
    await page.waitForFunction(() => (window as any).__financeShimLoaded === true)
  })

  test('extractMarketSummarySources() returns array of domain strings', async ({ page }) => {
    const domains = await page.evaluate(() => {
      const parser = new (window as any).__FinanceParser()
      return parser.extractMarketSummarySources()
    })

    expect(Array.isArray(domains)).toBe(true)
    expect(domains.length).toBe(3)
  })

  test('extracts correct domains from favicon alt text', async ({ page }) => {
    const domains = await page.evaluate(() => {
      const parser = new (window as any).__FinanceParser()
      return parser.extractMarketSummarySources()
    })

    expect(domains[0]).toBe('dailyforex.com')
    expect(domains[1]).toBe('paybis.com')
    expect(domains[2]).toBe('investing.com')
  })

  test('only extracts from Market Summary section, not other sections', async ({ page }) => {
    const domains = await page.evaluate(() => {
      const parser = new (window as any).__FinanceParser()
      return parser.extractMarketSummarySources()
    })

    // Recent Developments section has sharecafe.com.au and atb.com — should not appear
    expect(domains).not.toContain('sharecafe.com.au')
    expect(domains).not.toContain('atb.com')
  })

  test('returns empty array when Market Summary section not found', async ({ page }) => {
    await page.evaluate(() => {
      const h2s = document.querySelectorAll('h2')
      h2s.forEach(h2 => {
        if (h2.textContent?.trim() === 'Market Summary') {
          h2.closest('.border-subtlest')?.remove()
        }
      })
    })

    const domains = await page.evaluate(() => {
      const parser = new (window as any).__FinanceParser()
      return parser.extractMarketSummarySources()
    })

    expect(domains).toEqual([])
  })

  test('deduplicates domains', async ({ page }) => {
    // Add a duplicate favicon to the Market Summary section
    await page.evaluate(() => {
      const h2s = document.querySelectorAll('h2')
      let container: Element | null = null
      for (const h2 of h2s) {
        if (h2.textContent?.trim() === 'Market Summary') {
          container = h2.closest('.border-subtlest')
          break
        }
      }
      if (!container) return

      const faviconDiv = container.querySelector('.ml-xs.flex')
      if (!faviconDiv) return

      // Add a duplicate dailyforex.com favicon
      const dup = document.createElement('div')
      dup.innerHTML = `
        <div class="inline-flex rounded-full" style="width: 14px; height: 14px;">
          <div class="rounded-full" style="width: 14px; height: 14px;">
            <img class="relative block" alt="dailyforex.com favicon" width="14" height="14" src="https://www.google.com/s2/favicons?sz=128&domain=dailyforex.com">
          </div>
        </div>
      `
      faviconDiv.appendChild(dup)
    })

    const domains = await page.evaluate(() => {
      const parser = new (window as any).__FinanceParser()
      return parser.extractMarketSummarySources()
    })

    // Should still be 3 (no duplicate)
    expect(domains.length).toBe(3)
    expect(domains.filter((d: string) => d === 'dailyforex.com').length).toBe(1)
  })

  test('returns empty array when no favicons in Market Summary', async ({ page }) => {
    // Remove all favicon images from Market Summary
    await page.evaluate(() => {
      const h2s = document.querySelectorAll('h2')
      for (const h2 of h2s) {
        if (h2.textContent?.trim() === 'Market Summary') {
          const container = h2.closest('.border-subtlest')
          if (container) {
            container.querySelectorAll('img[alt$=" favicon"]').forEach(img => img.remove())
          }
          break
        }
      }
    })

    const domains = await page.evaluate(() => {
      const parser = new (window as any).__FinanceParser()
      return parser.extractMarketSummarySources()
    })

    expect(domains).toEqual([])
  })
})
