export interface ItemRow {
  id: string
  user_id: string
  category_id: string
  name: string
  quantity: number
  unit_value: number | null
  currency: string
  source: 'manual' | 'api'
  external_id: string | null
  category_fields: Record<string, unknown>
  notes: string | null
  last_price_at: string | null
  created_at: string
  updated_at: string
}
