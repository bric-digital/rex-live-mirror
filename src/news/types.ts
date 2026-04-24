export interface HomepageBlurb {
  headline: string
  posted: string
  source: string
  authors: string[]
  summary?: string
  url: string
  rank: number
  relatedTickers?: string[]
}

export interface HomepageParserValidation {
  valid: boolean
  itemsFound: number
}

export interface StockTicker {
  symbol: string
  name?: string
  price: string
  change: string
  changePercent: string
  direction: 'up' | 'down'
  lastUpdated?: string
  url?: string
  category?: string
}

export interface MarketTeaser {
  headline: string
  url: string
}

export interface HomepageParser {
  validateSelectors(): HomepageParserValidation
  extractBlurbs(): HomepageBlurb[]
  extractTickers?(): StockTicker[]
  extractMarketTeaser?(): MarketTeaser | null
  extractBreakingNews?(): string | null
  extractQuickLinks?(): string[]
}

export interface HomepageSiteConfig {
  domain: string
  paths?: string[]
  selectors: Record<string, string>
}
