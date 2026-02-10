/**
 * Cache for item_value_history RPC results. Avoids duplicate requests when the same
 * (userId, itemIds, days) is requested (e.g. dashboard chart + PnL in parallel).
 * Coalesces in-flight requests so one RPC serves multiple callers.
 */
import { defineStore } from 'pinia'
import { supabase } from '@/lib/supabase'

const TTL_MS = 5 * 60 * 1000 // 5 minutes

interface HistoryRow {
  item_id: string
  recorded_at: string
  unit_value: number
}

function cacheKey(userId: string, itemIds: string[], days?: number): string {
  const sorted = [...itemIds].sort()
  return `${userId}:${days ?? 'all'}:${sorted.join(',')}`
}

export const useValueHistoryStore = defineStore('valueHistory', () => {
  const cache = new Map<string, { data: HistoryRow[]; expiresAt: number }>()
  const inFlight = new Map<string, Promise<HistoryRow[]>>()

  async function getHistory(
    itemIds: string[],
    userId: string,
    days?: number
  ): Promise<HistoryRow[]> {
    if (itemIds.length === 0) return []
    const key = cacheKey(userId, itemIds, days)
    const now = Date.now()
    const entry = cache.get(key)
    if (entry && entry.expiresAt > now) return entry.data

    const existing = inFlight.get(key)
    if (existing) return existing

    const promise = (async () => {
      const { data, error } = await supabase.rpc('get_item_value_history', {
        p_item_ids: itemIds,
        p_days: days ?? null,
      })
      inFlight.delete(key)
      if (error) return []
      const rows = (data ?? []) as HistoryRow[]
      cache.set(key, { data: rows, expiresAt: Date.now() + TTL_MS })
      return rows
    })()
    inFlight.set(key, promise)
    return promise
  }

  function invalidate(): void {
    cache.clear()
  }

  return { getHistory, invalidate }
})
