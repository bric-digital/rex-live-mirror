import { test, expect } from '@playwright/test'

/**
 * Tier 1: PerplexityFinanceParser unit tests
 *
 * Post-2026 Perplexity Finance DOM uses Google's favicon proxy
 * (https://www.google.com/s2/favicons?sz=128&domain=<host>) with empty alt
 * text, so the domain must be parsed from the `src` query string.
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

  test('extracts correct domains from favicon proxy src', async ({ page }) => {
    const domains = await page.evaluate(() => {
      const parser = new (window as any).__FinanceParser()
      return parser.extractMarketSummarySources()
    })

    expect(domains).toEqual(['finance.yahoo.com', 'financemagnates.com', 'investing.com'])
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
      document.querySelectorAll('h2').forEach(h2 => {
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
    await page.evaluate(() => {
      let container: Element | null = null
      document.querySelectorAll('h2').forEach(h2 => {
        if (h2.textContent?.trim() === 'Market Summary') {
          container = h2.closest('.border-subtlest')
        }
      })
      if (!container) return
      const faviconRow = (container as Element).querySelector('.ml-xs.flex')
      if (!faviconRow) return

      const dup = document.createElement('img')
      dup.setAttribute('src', 'https://www.google.com/s2/favicons?sz=128&domain=finance.yahoo.com')
      dup.setAttribute('alt', '')
      faviconRow.appendChild(dup)
    })

    const domains = await page.evaluate(() => {
      const parser = new (window as any).__FinanceParser()
      return parser.extractMarketSummarySources()
    })

    expect(domains.length).toBe(3)
    expect(domains.filter((d: string) => d === 'finance.yahoo.com').length).toBe(1)
  })

  test('returns empty array when no favicons in Market Summary', async ({ page }) => {
    await page.evaluate(() => {
      document.querySelectorAll('h2').forEach(h2 => {
        if (h2.textContent?.trim() === 'Market Summary') {
          const container = h2.closest('.border-subtlest')
          if (container) {
            container.querySelectorAll('img[src*="favicons"]').forEach(img => img.remove())
          }
        }
      })
    })

    const domains = await page.evaluate(() => {
      const parser = new (window as any).__FinanceParser()
      return parser.extractMarketSummarySources()
    })

    expect(domains).toEqual([])
  })
})
