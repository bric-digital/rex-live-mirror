/**
 * Discover parser test shim.
 * Exposes the PerplexityDiscoverParser class on window so
 * Playwright tests can instantiate and test it directly.
 */
import { PerplexityDiscoverParser } from '../../src/discover/perplexity-discover.js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const g = globalThis as any

g.__DiscoverParser = PerplexityDiscoverParser
g.__discoverShimLoaded = true
