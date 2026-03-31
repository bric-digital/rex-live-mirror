export interface HomepageBlurb {
  headline: string
  posted: string
  source: string
  authors: string[]
  summary?: string
  url: string
  rank: number
}

export interface HomepageParserValidation {
  valid: boolean
  itemsFound: number
}

export interface HomepageParser {
  validateSelectors(): HomepageParserValidation
  extractBlurbs(): HomepageBlurb[]
}

export interface HomepageSiteConfig {
  domain: string
  paths?: string[]
  selectors: Record<string, string>
}
