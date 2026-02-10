import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useFavoritesStore } from './favorites'

let selectResult: { data: { category_id: string }[]; error: Error | null } = {
  data: [],
  error: null,
}

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => Promise.resolve(selectResult),
      }),
      insert: () => Promise.resolve({ error: null }),
      delete: () => ({
        eq: () => ({
          eq: () => Promise.resolve({ error: null }),
        }),
      }),
    }),
  },
}))

vi.mock('@/stores/auth', () => ({
  useAuthStore: () => ({ user: { id: 'test-user-id' } }),
}))

describe('favorites store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    selectResult = { data: [], error: null }
  })

  it('load() initializes from Supabase', async () => {
    selectResult = {
      data: [{ category_id: 'cat-1' }, { category_id: 'cat-2' }],
      error: null,
    }
    const store = useFavoritesStore()
    await store.load()
    expect(store.favoriteCategoryIds).toEqual(['cat-1', 'cat-2'])
  })

  it('load() sets empty array when no rows', async () => {
    const store = useFavoritesStore()
    await store.load()
    expect(store.favoriteCategoryIds).toEqual([])
  })

  it('load() sets empty array on Supabase error', async () => {
    selectResult = { data: [], error: new Error('fail') }
    const store = useFavoritesStore()
    await store.load()
    expect(store.favoriteCategoryIds).toEqual([])
  })

  it('isFavorite returns true when id is in list', async () => {
    selectResult = { data: [{ category_id: 'cat-1' }], error: null }
    const store = useFavoritesStore()
    await store.load()
    expect(store.isFavorite('cat-1')).toBe(true)
    expect(store.isFavorite('cat-2')).toBe(false)
  })

  it('toggle removes category and updates state', async () => {
    selectResult = { data: [{ category_id: 'cat-1' }], error: null }
    const store = useFavoritesStore()
    await store.load()
    await store.toggle('cat-1')
    expect(store.isFavorite('cat-1')).toBe(false)
  })

  it('toggle adds category and updates state', async () => {
    const store = useFavoritesStore()
    await store.load()
    expect(store.isFavorite('cat-1')).toBe(false)
    await store.toggle('cat-1')
    expect(store.isFavorite('cat-1')).toBe(true)
  })

  it('clear() empties favoriteCategoryIds', async () => {
    selectResult = { data: [{ category_id: 'cat-1' }], error: null }
    const store = useFavoritesStore()
    await store.load()
    store.clear()
    expect(store.favoriteCategoryIds).toEqual([])
  })
})
