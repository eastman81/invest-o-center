import { describe, it, expect } from 'vitest'
import {
  buildSeriesByItem,
  buildSeriesTotal,
  type ItemForHistory,
} from './valueHistory'

describe('valueHistory', () => {
  const items: ItemForHistory[] = [
    { id: 'item-1', quantity: 10, category_id: 'cat-1', name: 'VOO' },
    { id: 'item-2', quantity: 2, category_id: 'cat-1', name: 'QQQ' },
  ]
  const dates = ['2026-02-01', '2026-02-02', '2026-02-03']

  describe('buildSeriesByItem', () => {
    it('returns one series per item with correct data', () => {
      const valueByItemByDate = new Map<string, Map<string, number>>()
      const map1 = new Map<string, number>()
      map1.set('2026-02-01', 100)
      map1.set('2026-02-02', 102)
      map1.set('2026-02-03', 101)
      valueByItemByDate.set('item-1', map1)
      const map2 = new Map<string, number>()
      map2.set('2026-02-01', 50)
      map2.set('2026-02-02', 52)
      map2.set('2026-02-03', 51)
      valueByItemByDate.set('item-2', map2)

      const series = buildSeriesByItem(items, valueByItemByDate, dates)

      expect(series).toHaveLength(2)
      expect(series[0]).toEqual({
        id: 'item-1',
        label: 'VOO',
        data: [
          { date: '2026-02-01', value: 100 },
          { date: '2026-02-02', value: 102 },
          { date: '2026-02-03', value: 101 },
        ],
      })
      expect(series[1]).toEqual({
        id: 'item-2',
        label: 'QQQ',
        data: [
          { date: '2026-02-01', value: 50 },
          { date: '2026-02-02', value: 52 },
          { date: '2026-02-03', value: 51 },
        ],
      })
    })

    it('uses 0 for missing dates', () => {
      const valueByItemByDate = new Map<string, Map<string, number>>()
      const map1 = new Map<string, number>()
      map1.set('2026-02-02', 100)
      valueByItemByDate.set('item-1', map1)

      const series = buildSeriesByItem(items.slice(0, 1), valueByItemByDate, dates)

      expect(series[0].data).toEqual([
        { date: '2026-02-01', value: 0 },
        { date: '2026-02-02', value: 100 },
        { date: '2026-02-03', value: 0 },
      ])
    })
  })

  describe('buildSeriesTotal', () => {
    it('returns one series with summed values per date', () => {
      const valueByItemByDate = new Map<string, Map<string, number>>()
      const map1 = new Map<string, number>()
      map1.set('2026-02-01', 100)
      map1.set('2026-02-02', 102)
      map1.set('2026-02-03', 101)
      valueByItemByDate.set('item-1', map1)
      const map2 = new Map<string, number>()
      map2.set('2026-02-01', 50)
      map2.set('2026-02-02', 52)
      map2.set('2026-02-03', 51)
      valueByItemByDate.set('item-2', map2)

      const series = buildSeriesTotal(items, valueByItemByDate, dates)

      expect(series.id).toBe('total')
      expect(series.label).toBe('Total')
      expect(series.data).toEqual([
        { date: '2026-02-01', value: 150 },
        { date: '2026-02-02', value: 154 },
        { date: '2026-02-03', value: 152 },
      ])
    })

    it('returns zeros when no values in map', () => {
      const valueByItemByDate = new Map<string, Map<string, number>>()
      const series = buildSeriesTotal(items, valueByItemByDate, dates)

      expect(series.data).toEqual([
        { date: '2026-02-01', value: 0 },
        { date: '2026-02-02', value: 0 },
        { date: '2026-02-03', value: 0 },
      ])
    })
  })
})
