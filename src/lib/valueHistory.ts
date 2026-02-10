/**
 * Value history: fetch item_value_history and build chart series (by item, by category, or net worth).
 * Uses current quantity; value at date = latest unit_value on or before date × quantity.
 */

export interface HistoryDataPoint {
  date: string // YYYY-MM-DD
  value: number
}

export interface ValueSeries {
  id: string
  label: string
  color?: string
  data: HistoryDataPoint[]
}

export interface ItemForHistory {
  id: string
  quantity: number
  category_id: string
  name: string
}

interface HistoryRow {
  item_id: string
  recorded_at: string
  unit_value: number
}

/** Get all dates from start to end (inclusive), YYYY-MM-DD in the user's local timezone. */
function getDateRange(days: number): string[] {
  const out: string[] = []
  const end = new Date()
  const start = new Date(end)
  start.setDate(start.getDate() - days)
  start.setHours(0, 0, 0, 0)
  end.setHours(23, 59, 59, 999)
  for (const d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    out.push(`${y}-${m}-${day}`)
  }
  return out
}

/** For each date, get latest unit_value per item from history (recorded_at <= end of date). */
function buildValueByItemByDate(
  itemIds: string[],
  items: Map<string, ItemForHistory>,
  history: HistoryRow[],
  dates: string[]
): Map<string, Map<string, number>> {
  // Sort history by recorded_at asc per item
  const byItem = new Map<string, HistoryRow[]>()
  for (const r of history) {
    if (!byItem.has(r.item_id)) byItem.set(r.item_id, [])
    byItem.get(r.item_id)!.push(r)
  }
  for (const arr of byItem.values()) {
    arr.sort((a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime())
  }

  const result = new Map<string, Map<string, number>>()
  for (const itemId of itemIds) {
    const item = items.get(itemId)
    if (!item) continue
    const rows = byItem.get(itemId) ?? []
    const byDate = new Map<string, number>()
    let lastUnitValue: number | null = null
    let rowIdx = 0
    for (const date of dates) {
      const [y, m, day] = date.split('-').map(Number)
      const dayEnd = new Date(y, m - 1, day, 23, 59, 59, 999).getTime()
      while (rowIdx < rows.length && new Date(rows[rowIdx].recorded_at).getTime() <= dayEnd) {
        lastUnitValue = Number(rows[rowIdx].unit_value)
        rowIdx++
      }
      const value = lastUnitValue != null ? lastUnitValue * Number(item.quantity) : 0
      byDate.set(date, value)
    }
    result.set(itemId, byDate)
  }
  return result
}

import { useValueHistoryStore } from '@/stores/valueHistory'

/** Clear cached history (e.g. after refresh price or sign out). Call when data may have changed. */
export function invalidateHistoryCache(): void {
  useValueHistoryStore().invalidate()
}

/** Fetch history rows for given item ids (user must own items). Uses store cache + RPC; parallel calls for same key share one request. */
async function fetchHistory(
  itemIds: string[],
  userId: string,
  days?: number
): Promise<HistoryRow[]> {
  return useValueHistoryStore().getHistory(itemIds, userId, days)
}

/** Build series by item for the given items and history. */
export function buildSeriesByItem(
  items: ItemForHistory[],
  valueByItemByDate: Map<string, Map<string, number>>,
  dates: string[]
): ValueSeries[] {
  return items.map((item) => {
    const byDate = valueByItemByDate.get(item.id) ?? new Map()
    const data: HistoryDataPoint[] = dates.map((date) => ({
      date,
      value: byDate.get(date) ?? 0,
    }))
    return { id: item.id, label: item.name, data }
  })
}

/** Build one series that is the sum across all items per date. */
export function buildSeriesTotal(
  items: ItemForHistory[],
  valueByItemByDate: Map<string, Map<string, number>>,
  dates: string[]
): ValueSeries {
  const byDate = new Map<string, number>()
  for (const date of dates) {
    let sum = 0
    for (const item of items) {
      const m = valueByItemByDate.get(item.id)
      if (m) sum += m.get(date) ?? 0
    }
    byDate.set(date, sum)
  }
  const data: HistoryDataPoint[] = dates.map((date) => ({ date, value: byDate.get(date) ?? 0 }))
  return { id: 'total', label: 'Total', data }
}

/**
 * Fetch history and build series for a single category (one series per item, or total).
 */
export async function fetchCategoryHistory(
  userId: string,
  items: ItemForHistory[],
  days: number
): Promise<{ series: ValueSeries[]; dates: string[] }> {
  const dates = getDateRange(days)
  const itemIds = items.map((i) => i.id)
  const history = await fetchHistory(itemIds, userId, days)
  if (history.length === 0) return { series: [], dates }
  const itemsMap = new Map(items.map((i) => [i.id, i]))
  const valueByItemByDate = buildValueByItemByDate(itemIds, itemsMap, history, dates)
  const series = buildSeriesByItem(items, valueByItemByDate, dates)
  return { series, dates }
}

/**
 * Fetch history and build series for all categories (one series per category).
 */
export async function fetchCategoriesHistory(
  userId: string,
  itemsByCategory: { categoryId: string; categoryName: string; items: ItemForHistory[] }[],
  days: number
): Promise<{ series: ValueSeries[]; dates: string[] }> {
  const allItems = itemsByCategory.flatMap((g) => g.items)
  const itemIds = [...new Set(allItems.map((i) => i.id))]
  const dates = getDateRange(days)
  const history = await fetchHistory(itemIds, userId, days)
  if (history.length === 0) return { series: [], dates }
  const itemsMap = new Map(allItems.map((i) => [i.id, i]))
  const valueByItemByDate = buildValueByItemByDate(itemIds, itemsMap, history, dates)

  const series: ValueSeries[] = itemsByCategory.map((g) => {
    const byDate = new Map<string, number>()
    for (const date of dates) {
      let sum = 0
      for (const item of g.items) {
        const m = valueByItemByDate.get(item.id)
        if (m) sum += m.get(date) ?? 0
      }
      byDate.set(date, sum)
    }
    const data: HistoryDataPoint[] = dates.map((date) => ({ date, value: byDate.get(date) ?? 0 }))
    return { id: g.categoryId, label: g.categoryName, data }
  })
  return { series, dates }
}

/**
 * Fetch history and build one series for net worth (all items summed).
 */
export async function fetchNetWorthHistory(
  userId: string,
  items: ItemForHistory[],
  days: number
): Promise<{ series: ValueSeries[]; dates: string[] }> {
  const dates = getDateRange(days)
  const itemIds = items.map((i) => i.id)
  const history = await fetchHistory(itemIds, userId, days)
  if (history.length === 0) return { series: [], dates }
  const itemsMap = new Map(items.map((i) => [i.id, i]))
  const valueByItemByDate = buildValueByItemByDate(itemIds, itemsMap, history, dates)
  const series = [buildSeriesTotal(items, valueByItemByDate, dates)]
  return { series, dates }
}

/** Get net worth on a single date (local YYYY-MM-DD). Uses latest unit_value per item on or before that date × quantity. */
export async function getNetWorthAtDate(
  userId: string,
  items: ItemForHistory[],
  dateStr: string
): Promise<number> {
  const itemIds = items.map((i) => i.id)
  const history = await fetchHistory(itemIds, userId)
  if (history.length === 0) return 0
  const itemsMap = new Map(items.map((i) => [i.id, i]))
  const valueByItemByDate = buildValueByItemByDate(itemIds, itemsMap, history, [dateStr])
  const total = buildSeriesTotal(items, valueByItemByDate, [dateStr])
  return total.data[0]?.value ?? 0
}

/** Earliest history date (local YYYY-MM-DD) for the given items, or null if no history. */
export async function getEarliestHistoryDate(userId: string, itemIds: string[]): Promise<string | null> {
  const history = await fetchHistory(itemIds, userId)
  if (history.length === 0) return null
  const earliest = history[0].recorded_at
  const d = new Date(earliest)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export interface PnLResult {
  startValue: number
  endValue: number
}

/**
 * Compute PnL for the given period. Returns start and end value so caller can show $ and %.
 * Returns null if no history.
 */
export async function getPnL(
  userId: string,
  items: ItemForHistory[],
  period: '30d' | 'all'
): Promise<PnLResult | null> {
  const itemIds = items.map((i) => i.id)
  const history = await fetchHistory(itemIds, userId)
  if (history.length === 0) return null

  if (period === '30d') {
    const { series } = await fetchNetWorthHistory(userId, items, 30)
    const data = series[0]?.data ?? []
    if (data.length < 2) return null
    const startValue = data[0].value
    const endValue = data[data.length - 1].value
    return { startValue, endValue }
  }

  const earliest = await getEarliestHistoryDate(userId, itemIds)
  if (!earliest) return null
  const startValue = await getNetWorthAtDate(userId, items, earliest)
  const today = getDateRange(0)[0]
  const endValue = await getNetWorthAtDate(userId, items, today)
  return { startValue, endValue }
}
