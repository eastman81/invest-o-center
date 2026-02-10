/**
 * Top categories shown in the "Get started" step after signup.
 * User can select one or more; selected items are batch-created as their categories.
 */
export interface TopCategory {
  name: string
  slug: string
  price_provider?: string
  schema_fields?: { key: string; label: string; required: boolean }[]
}

export const TOP_CATEGORIES: TopCategory[] = [
  { name: 'Stocks', slug: 'stocks', price_provider: 'alpha_vantage', schema_fields: [{ key: 'ticker', label: 'Ticker', required: true }] },
  { name: 'Crypto', slug: 'crypto', price_provider: 'coin_gecko', schema_fields: [{ key: 'coin_id', label: 'Coin ID', required: true }] },
  { name: 'Gold & Silver', slug: 'gold-silver', price_provider: 'gold_api', schema_fields: [] },
  { name: 'Vinyl Records', slug: 'vinyl', price_provider: 'discogs', schema_fields: [{ key: 'discogs_release_id', label: 'Discogs Release ID', required: false }] },
  { name: 'Trading Cards', slug: 'trading-cards', schema_fields: [] },
  {
    name: 'Real Estate',
    slug: 'real-estate',
    price_provider: 'rent_cast',
    schema_fields: [
      { key: 'address', label: 'Street address', required: true },
      { key: 'city', label: 'City', required: false },
      { key: 'state', label: 'State (e.g. TX)', required: false },
      { key: 'zip', label: 'ZIP code', required: false },
    ],
  },
  { name: 'Lego', slug: 'lego', schema_fields: [{ key: 'set_number', label: 'Set number', required: false }] },
  { name: 'Video Games', slug: 'video-games', schema_fields: [] },
]

/** Slug normalized for matching (lowercase, collapse spaces to single hyphen). */
function normalizeForMatch(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
}

/**
 * Keywords that indicate a category should use a given TOP_CATEGORIES template.
 * First match wins; order matters (more specific first).
 */
const SLUG_KEYWORDS: { keywords: string[]; template: TopCategory }[] = [
  { keywords: ['stock', 'stocks', 'equity', 'equities', 'etf', 'etfs'], template: TOP_CATEGORIES[0] },
  { keywords: ['crypto', 'cryptocurrency', 'bitcoin', 'ethereum', 'coin'], template: TOP_CATEGORIES[1] },
  { keywords: ['gold', 'silver', 'precious-metal'], template: TOP_CATEGORIES[2] },
  { keywords: ['vinyl', 'record', 'records', 'discogs'], template: TOP_CATEGORIES[3] },
  { keywords: ['trading-card', 'tcg', 'pokemon', 'mtg', 'yugioh'], template: TOP_CATEGORIES[4] },
  { keywords: ['real-estate', 'property', 'properties', 'home', 'homes', 'house', 'houses'], template: TOP_CATEGORIES[5] },
  { keywords: ['lego', 'legos'], template: TOP_CATEGORIES[6] },
  { keywords: ['video-game', 'video-games', 'videogame', 'videogames'], template: TOP_CATEGORIES[7] },
]

/**
 * If the category name or slug closely matches a known type (e.g. stocks, crypto),
 * returns that template's price_provider and schema_fields so the item form shows
 * the right fields (Ticker, Coin ID, etc.) and Refresh can work.
 */
export function getCategoryTemplateForNameOrSlug(name: string, slug: string): Pick<TopCategory, 'price_provider' | 'schema_fields'> | null {
  const normName = normalizeForMatch(name)
  const normSlug = slug ? normalizeForMatch(slug) : normName
  const combined = `${normSlug} ${normName}`

  for (const { slug: templateSlug } of TOP_CATEGORIES) {
    if (normSlug === templateSlug || normName === templateSlug) {
      const t = TOP_CATEGORIES.find((c) => c.slug === templateSlug)!
      return { price_provider: t.price_provider ?? undefined, schema_fields: t.schema_fields ?? [] }
    }
  }

  for (const { keywords, template } of SLUG_KEYWORDS) {
    for (const kw of keywords) {
      if (combined.includes(kw) || normSlug.includes(kw) || normName.includes(kw)) {
        return { price_provider: template.price_provider ?? undefined, schema_fields: template.schema_fields ?? [] }
      }
    }
  }

  return null
}
