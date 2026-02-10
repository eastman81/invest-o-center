// Daily snapshot: insert current unit_value for all items into item_value_history.
// Invoke via cron (e.g. daily at midnight UTC). Uses service role to bypass RLS.
// Optional: set SNAPSHOT_CRON_SECRET and send x-cron-secret header to restrict who can invoke.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const CRON_SECRET = Deno.env.get('SNAPSHOT_CRON_SECRET') ?? ''

interface ItemRow {
  id: string
  unit_value: number | null
  currency: string | null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'authorization, x-cron-secret, content-type' } })
  }

  if (CRON_SECRET && req.headers.get('x-cron-secret') !== CRON_SECRET) {
    return Response.json({ code: 'UNAUTHORIZED', message: 'Missing or invalid x-cron-secret.' }, { status: 401 })
  }

  if (!SERVICE_ROLE_KEY) {
    return Response.json({ code: 'CONFIG_ERROR', message: 'SUPABASE_SERVICE_ROLE_KEY is required for snapshot.' }, { status: 500 })
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
  const recordedAt = new Date().toISOString()

  const { data: items, error: fetchError } = await supabase
    .from('items')
    .select('id, unit_value, currency')
    .not('unit_value', 'is', null)

  if (fetchError) {
    console.error('snapshot fetch items error:', fetchError)
    return Response.json({ code: 'FETCH_ERROR', message: fetchError.message }, { status: 500 })
  }

  const rows = (items ?? []) as ItemRow[]
  if (rows.length === 0) {
    return Response.json({ ok: true, recorded_at: recordedAt, count: 0 }, { status: 200 })
  }

  const toInsert = rows.map((r) => ({
    item_id: r.id,
    recorded_at: recordedAt,
    unit_value: Number(r.unit_value),
    currency: r.currency ?? 'USD',
  }))

  // Insert in chunks to avoid payload limits (e.g. 500 per batch)
  const chunkSize = 500
  let inserted = 0
  for (let i = 0; i < toInsert.length; i += chunkSize) {
    const chunk = toInsert.slice(i, i + chunkSize)
    const { error: insertError } = await supabase.from('item_value_history').insert(chunk)
    if (insertError) {
      console.error('snapshot insert error:', insertError)
      return Response.json({ code: 'INSERT_ERROR', message: insertError.message, inserted }, { status: 500 })
    }
    inserted += chunk.length
  }

  return Response.json({ ok: true, recorded_at: recordedAt, count: inserted }, { status: 200 })
})
