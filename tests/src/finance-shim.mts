import { PerplexityFinanceParser } from '../../src/finance/perplexity-finance.js'

const g = globalThis as any
g.__FinanceParser = PerplexityFinanceParser
g.__financeShimLoaded = true
