export interface SchemaField {
  key: string
  label: string
  required: boolean
}

export interface CategoryDetail {
  id: string
  user_id: string
  name: string
  slug: string
  price_provider: string | null
  schema_fields: SchemaField[]
}
