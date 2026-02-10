import { describe, it, expect } from 'vitest'
import { getCategoryTemplateForNameOrSlug } from './topCategories'

describe('getCategoryTemplateForNameOrSlug', () => {
  describe('exact slug match', () => {
    it('returns Stocks template for name "Stocks" and slug "stocks"', () => {
      const t = getCategoryTemplateForNameOrSlug('Stocks', 'stocks')
      expect(t).not.toBeNull()
      expect(t!.price_provider).toBe('alpha_vantage')
      expect(t!.schema_fields).toEqual([{ key: 'ticker', label: 'Ticker', required: true }])
    })

    it('returns Crypto template for slug "crypto"', () => {
      const t = getCategoryTemplateForNameOrSlug('Crypto', 'crypto')
      expect(t).not.toBeNull()
      expect(t!.price_provider).toBe('coin_gecko')
      expect(t!.schema_fields).toEqual([{ key: 'coin_id', label: 'Coin ID', required: true }])
    })

    it('returns Video Games template for slug "video-games"', () => {
      const t = getCategoryTemplateForNameOrSlug('Video Games', 'video-games')
      expect(t).not.toBeNull()
      expect(t!.schema_fields).toEqual([])
    })
  })

  describe('keyword match - stocks', () => {
    it('matches "My Stock Portfolio"', () => {
      const t = getCategoryTemplateForNameOrSlug('My Stock Portfolio', 'my-stock-portfolio')
      expect(t).not.toBeNull()
      expect(t!.price_provider).toBe('alpha_vantage')
      expect(t!.schema_fields).toHaveLength(1)
      expect(t!.schema_fields![0].key).toBe('ticker')
    })

    it('matches "Equities"', () => {
      const t = getCategoryTemplateForNameOrSlug('Equities', 'equities')
      expect(t).not.toBeNull()
      expect(t!.price_provider).toBe('alpha_vantage')
    })

    it('matches "ETF" in name', () => {
      const t = getCategoryTemplateForNameOrSlug('ETF Holdings', 'etf-holdings')
      expect(t).not.toBeNull()
      expect(t!.price_provider).toBe('alpha_vantage')
    })
  })

  describe('keyword match - crypto', () => {
    it('matches "Cryptocurrency"', () => {
      const t = getCategoryTemplateForNameOrSlug('Cryptocurrency', 'cryptocurrency')
      expect(t).not.toBeNull()
      expect(t!.price_provider).toBe('coin_gecko')
      expect(t!.schema_fields![0].key).toBe('coin_id')
    })

    it('matches "Bitcoin" in name', () => {
      const t = getCategoryTemplateForNameOrSlug('Bitcoin', 'bitcoin')
      expect(t).not.toBeNull()
      expect(t!.price_provider).toBe('coin_gecko')
    })
  })

  describe('keyword match - video games only (not board games)', () => {
    it('matches "Video Games"', () => {
      const t = getCategoryTemplateForNameOrSlug('Video Games', 'video-games')
      expect(t).not.toBeNull()
    })

    it('matches "Videogames"', () => {
      const t = getCategoryTemplateForNameOrSlug('Videogames', 'videogames')
      expect(t).not.toBeNull()
    })

    it('returns null for "Board Games"', () => {
      const t = getCategoryTemplateForNameOrSlug('Board Games', 'board-games')
      expect(t).toBeNull()
    })

    it('returns null for "Card Games"', () => {
      const t = getCategoryTemplateForNameOrSlug('Card Games', 'card-games')
      expect(t).toBeNull()
    })

    it('returns null for "Party Games"', () => {
      const t = getCategoryTemplateForNameOrSlug('Party Games', 'party-games')
      expect(t).toBeNull()
    })
  })

  describe('other keyword matches', () => {
    it('matches "Vinyl Records"', () => {
      const t = getCategoryTemplateForNameOrSlug('Vinyl Records', 'vinyl')
      expect(t).not.toBeNull()
      expect(t!.price_provider).toBe('discogs')
    })

    it('matches "Real Estate"', () => {
      const t = getCategoryTemplateForNameOrSlug('Real Estate', 'real-estate')
      expect(t).not.toBeNull()
      expect(t!.schema_fields).toContainEqual(expect.objectContaining({ key: 'address' }))
    })

    it('matches "Lego"', () => {
      const t = getCategoryTemplateForNameOrSlug('Lego', 'lego')
      expect(t).not.toBeNull()
    })

    it('matches "Gold & Silver"', () => {
      const t = getCategoryTemplateForNameOrSlug('Gold & Silver', 'gold-silver')
      expect(t).not.toBeNull()
      expect(t!.price_provider).toBe('gold_api')
    })
  })

  describe('no match', () => {
    it('returns null for "Misc"', () => {
      const t = getCategoryTemplateForNameOrSlug('Misc', 'misc')
      expect(t).toBeNull()
    })

    it('returns null for "Other"', () => {
      const t = getCategoryTemplateForNameOrSlug('Other', 'other')
      expect(t).toBeNull()
    })

    it('returns null for "Collectibles" (no keyword match)', () => {
      const t = getCategoryTemplateForNameOrSlug('Collectibles', 'collectibles')
      expect(t).toBeNull()
    })
  })
})
