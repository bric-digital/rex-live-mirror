/**
 * Article parser test shim.
 * Exposes the PerplexityArticleParser class on window so
 * Playwright tests can instantiate and test it directly.
 */
import { PerplexityArticleParser } from '../../src/discover/perplexity-article.js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const g = globalThis as any

g.__ArticleParser = PerplexityArticleParser
g.__articleShimLoaded = true
