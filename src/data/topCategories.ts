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
  { name: 'Real Estate', slug: 'real-estate', schema_fields: [{ key: 'address', label: 'Address', required: false }] },
  { name: 'Lego', slug: 'lego', schema_fields: [{ key: 'set_number', label: 'Set number', required: false }] },
  { name: 'Video Games', slug: 'video-games', schema_fields: [] },
]
