// Refresh item price from Alpha Vantage (stocks) or RentCast (real estate). Uses per-user API key
// from user_api_keys when set; for stocks, falls back to ALPHA_VANTAGE_API_KEY env.
// Requires ENCRYPTION_KEY (32-byte hex) when using per-user keys.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SB_PUBLISHABLE_KEY') ?? ''
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const ALPHA_VANTAGE_API_KEY = Deno.env.get('ALPHA_VANTAGE_API_KEY')
const RENTCAST_API_KEY = Deno.env.get('RENTCAST_API_KEY')
const ENCRYPTION_KEY_HEX = Deno.env.get('ENCRYPTION_KEY')

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function jsonResponse(body: object, status: number, headers?: Record<string, string>) {
  return Response.json(body, { status, headers: { ...CORS_HEADERS, ...headers } })
}

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2)
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  return out
}

async function decrypt(encrypted: string): Promise<string> {
  if (!ENCRYPTION_KEY_HEX || ENCRYPTION_KEY_HEX.length !== 64) throw new Error('ENCRYPTION_KEY required')
  const [ivB64, ctB64] = encrypted.split(':')
  if (!ivB64 || !ctB64) throw new Error('Invalid encrypted format')
  const iv = Uint8Array.from(atob(ivB64), (c) => c.charCodeAt(0))
  const ct = Uint8Array.from(atob(ctB64), (c) => c.charCodeAt(0))
  const key = await crypto.subtle.importKey(
    'raw',
    hexToBytes(ENCRYPTION_KEY_HEX),
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt']
  )
  const dec = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct)
  return new TextDecoder().decode(dec)
}

/** Resolve API key for a provider: per-user (user_api_keys) if present, else env (Alpha Vantage only). */
async function resolveApiKey(userId: string, provider: string): Promise<string | null> {
  if (SERVICE_ROLE_KEY && ENCRYPTION_KEY_HEX?.length === 64) {
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
    const { data: row } = await admin
      .from('user_api_keys')
      .select('encrypted_key')
      .eq('user_id', userId)
      .eq('provider', provider)
      .maybeSingle()
    if (row?.encrypted_key && typeof row.encrypted_key === 'string') {
      try {
        return await decrypt(row.encrypted_key)
      } catch {
        // fall through
      }
    }
  }
  if (provider === 'alpha_vantage') return ALPHA_VANTAGE_API_KEY ?? null
  if (provider === 'rent_cast') return RENTCAST_API_KEY ?? null
  return null
}

interface RequestBody {
  item_id: string
}

interface ItemRow {
  id: string
  user_id: string
  category_id: string
  category_fields: Record<string, unknown> | null
  external_id: string | null
}

interface CategoryRow {
  price_provider: string | null
}

interface ItemWithCategory extends ItemRow {
  categories: CategoryRow | null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS })
  }

  if (!SUPABASE_ANON_KEY) {
    return jsonResponse({ code: 'CONFIG_ERROR', message: 'Server missing API key. Add SUPABASE_ANON_KEY or SB_PUBLISHABLE_KEY in Edge Function secrets.' }, 500)
  }

  try {
  const authHeader = req.headers.get('Authorization')
  const token = authHeader?.replace(/^Bearer\s+/i, '')
  if (!token) {
    return jsonResponse({ code: 'UNAUTHORIZED', message: 'Missing or invalid token.' }, 401)
  }

  // Get user id from JWT payload (no Auth API call). Token is re-validated when we call PostgREST.
  let userId: string | null = null
  try {
    const parts = token.split('.')
    if (parts.length === 3) {
      const payloadB64 = parts[1]
      const padded = payloadB64.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (payloadB64.length % 4)) % 4)
      const decoded = atob(padded)
      const claims = JSON.parse(decoded) as { sub?: string; id?: string }
      userId = claims.sub ?? claims.id ?? null
    }
  } catch {
    // ignore
  }
  if (!userId) {
    return jsonResponse({ code: 'UNAUTHORIZED', message: 'Invalid or malformed token.' }, 401)
  }

  let body: RequestBody
  try {
    body = (await req.json()) as RequestBody
  } catch {
    return jsonResponse({ code: 'BAD_REQUEST', message: 'Invalid JSON body.' }, 400)
  }

  const itemId = body?.item_id
  if (!itemId || typeof itemId !== 'string') {
    return jsonResponse({ code: 'BAD_REQUEST', message: 'item_id is required.' }, 400)
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  })

  const { data: item, error: fetchError } = await supabase
    .from('items')
    .select('id, user_id, category_id, category_fields, external_id, currency, categories(price_provider)')
    .eq('id', itemId)
    .eq('user_id', userId)
    .single()

  if (fetchError || !item) {
    return jsonResponse({ code: 'ITEM_NOT_FOUND', message: 'Item not found or access denied.' }, 404)
  }

  const row = item as unknown as ItemWithCategory
  const provider = row.categories?.price_provider ?? null
  const categoryFields = (row.category_fields ?? {}) as Record<string, unknown>
  const currency = (row.currency ?? 'USD') as string
  const FETCH_TIMEOUT_MS = 15000

  if (provider === 'alpha_vantage') {
    const ticker = (categoryFields.ticker ?? row.external_id) as string | undefined
    const symbol = typeof ticker === 'string' ? ticker.trim() : ''
    if (!symbol) {
      return jsonResponse({
        code: 'MISSING_IDENTIFIER',
        message: 'Item is missing required identifier for this provider (e.g. ticker).',
      }, 400)
    }
    const apiKey = await resolveApiKey(userId!, 'alpha_vantage')
    if (!apiKey) {
      return jsonResponse({
        code: 'PROVIDER_ERROR',
        message: 'Add your Alpha Vantage API key in Account → API keys, or ask the app admin to set ALPHA_VANTAGE_API_KEY.',
      }, 502)
    }
    const url = new URL('https://www.alphavantage.co/query')
    url.searchParams.set('function', 'GLOBAL_QUOTE')
    url.searchParams.set('symbol', symbol)
    url.searchParams.set('apikey', apiKey)
    let res: Response
    try {
      const ac = new AbortController()
      const timeoutId = setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS)
      res = await fetch(url.toString(), { signal: ac.signal })
      clearTimeout(timeoutId)
    } catch (e) {
      const msg = e instanceof Error && e.name === 'AbortError'
        ? 'Price provider took too long to respond. Try again.'
        : 'Could not fetch price from provider.'
      return jsonResponse({ code: 'PROVIDER_ERROR', message: msg }, 502)
    }
    if (!res.ok) {
      return jsonResponse({ code: 'PROVIDER_ERROR', message: 'Could not fetch price from provider.' }, 502)
    }
    let data: Record<string, unknown>
    try {
      data = (await res.json()) as Record<string, unknown>
    } catch {
      return jsonResponse({ code: 'PROVIDER_ERROR', message: 'Invalid response from price provider. Try again.' }, 502)
    }
    const note = (data['Note'] ?? data['Information']) as string | undefined
    if (typeof note === 'string' && note.toLowerCase().includes('api call frequency')) {
      return jsonResponse(
        { code: 'RATE_LIMIT', message: 'Rate limit exceeded (5 calls per minute on free tier). Please try again in a minute.' },
        429
      )
    }
    const globalQuote = data['Global Quote'] as Record<string, string> | undefined
    const priceStr = globalQuote?.['05. price']
    if (priceStr == null || priceStr === '') {
      return jsonResponse({ code: 'PROVIDER_ERROR', message: 'Could not get price for this symbol.' }, 502)
    }
    const unitValue = parseFloat(priceStr)
    if (Number.isNaN(unitValue) || unitValue < 0) {
      return jsonResponse({ code: 'PROVIDER_ERROR', message: 'Invalid price returned from provider.' }, 502)
    }
    const { error: updateError } = await supabase
      .from('items')
      .update({
        unit_value: unitValue,
        last_price_at: new Date().toISOString(),
        source: 'api',
        updated_at: new Date().toISOString(),
      })
      .eq('id', itemId)
      .eq('user_id', userId)
    if (updateError) {
      return jsonResponse({ code: 'PROVIDER_ERROR', message: 'Could not save updated price.' }, 500)
    }
    const { error: historyError } = await supabase.from('item_value_history').insert({
      item_id: itemId,
      recorded_at: new Date().toISOString(),
      unit_value: unitValue,
      currency,
    })
    if (historyError) console.error('item_value_history insert failed:', historyError.message)
    return jsonResponse({
      ok: true,
      item_id: itemId,
      unit_value: unitValue,
      currency: 'USD',
      last_price_at: new Date().toISOString(),
    }, 200)
  }

  if (provider === 'rent_cast') {
    const street = (categoryFields.address ?? row.external_id) as string | undefined
    const streetStr = typeof street === 'string' ? street.trim() : ''
    if (!streetStr) {
      return jsonResponse({
        code: 'MISSING_IDENTIFIER',
        message: 'Item is missing required street address for real estate value.',
      }, 400)
    }
    // Build full address for accurate matching (city, state, zip reduce wrong-property matches)
    const city = typeof categoryFields.city === 'string' ? categoryFields.city.trim() : ''
    const state = typeof categoryFields.state === 'string' ? categoryFields.state.trim() : ''
    const zip = typeof categoryFields.zip === 'string' ? categoryFields.zip.trim() : ''
    const parts = [streetStr, city, state, zip].filter(Boolean)
    const addressStr = parts.join(', ')
    const apiKey = await resolveApiKey(userId!, 'rent_cast')
    if (!apiKey) {
      return jsonResponse({
        code: 'PROVIDER_ERROR',
        message: 'Add your RentCast API key in Account → API keys, or ask the app admin to set RENTCAST_API_KEY in Edge Function secrets (get a key at rentcast.io/app/api).',
      }, 502)
    }
    // RentCast Property Valuation → Value Estimate: https://developers.rentcast.io/reference/value-estimate
    // GET https://api.rentcast.io/v1/avm/value?address=<full address>
    const url = new URL('https://api.rentcast.io/v1/avm/value')
    url.searchParams.set('address', addressStr)
    console.log('RentCast request:', url.toString())
    let res: Response
    try {
      const ac = new AbortController()
      const timeoutId = setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS)
      res = await fetch(url.toString(), {
        signal: ac.signal,
        headers: {
          'X-Api-Key': apiKey,
          'Accept': 'application/json',
        },
      })
      clearTimeout(timeoutId)
    } catch (e) {
      const msg = e instanceof Error && e.name === 'AbortError'
        ? 'Price provider took too long to respond. Try again.'
        : 'Could not fetch value from RentCast.'
      return jsonResponse({ code: 'PROVIDER_ERROR', message: msg }, 502)
    }
    const responseText = await res.text()
    if (res.status === 429) {
      return jsonResponse(
        { code: 'RATE_LIMIT', message: 'RentCast rate limit (50 free calls/month). Try again later.' },
        429
      )
    }
    if (!res.ok) {
      console.error('RentCast API error:', res.status, responseText.slice(0, 500))
      const hint = res.status === 401 ? ' Check your RENTCAST_API_KEY.' : res.status === 404 ? ' Address not found or not supported.' : ''
      return jsonResponse({
        code: 'PROVIDER_ERROR',
        message: `RentCast returned ${res.status}.${hint}`,
      }, 502)
    }
    let data: Record<string, unknown>
    try {
      data = JSON.parse(responseText) as Record<string, unknown>
    } catch {
      console.error('RentCast parse error:', responseText.slice(0, 500))
      return jsonResponse({ code: 'PROVIDER_ERROR', message: 'Invalid response from RentCast.' }, 502)
    }
    // Log full response so you can see it in Supabase → Edge Functions → refresh-item-price → Logs
    console.log('RentCast response:', JSON.stringify(data))
    // Property Valuation schema: value may be at different paths; try common ones
    const value = data?.value ?? data?.price ?? (data?.valuation as Record<string, unknown>)?.value ?? (data?.avm as Record<string, unknown>)?.value ?? (data?.data as Record<string, unknown>)?.value
    const unitValue = typeof value === 'number' ? value : parseFloat(String(value ?? ''))
    if (Number.isNaN(unitValue) || unitValue < 0) {
      console.error('RentCast value not found in response. Keys:', Object.keys(data))
      return jsonResponse({ code: 'PROVIDER_ERROR', message: 'Could not get value for this address. Check Supabase function logs for response shape.' }, 502)
    }
    const { error: updateError } = await supabase
      .from('items')
      .update({
        unit_value: unitValue,
        last_price_at: new Date().toISOString(),
        source: 'api',
        updated_at: new Date().toISOString(),
      })
      .eq('id', itemId)
      .eq('user_id', userId)
    if (updateError) {
      return jsonResponse({ code: 'PROVIDER_ERROR', message: 'Could not save updated value.' }, 500)
    }
    const { error: historyError } = await supabase.from('item_value_history').insert({
      item_id: itemId,
      recorded_at: new Date().toISOString(),
      unit_value: unitValue,
      currency,
    })
    if (historyError) console.error('item_value_history insert failed:', historyError.message)
    return jsonResponse({
      ok: true,
      item_id: itemId,
      unit_value: unitValue,
      currency: 'USD',
      last_price_at: new Date().toISOString(),
    }, 200)
  }

  return jsonResponse({ code: 'NO_PROVIDER', message: 'This category does not support automatic price refresh.' }, 400)
  } catch (e) {
    console.error('refresh-item-price error:', e)
    return jsonResponse(
      { code: 'SERVER_ERROR', message: 'Something went wrong. Try again.' },
      500
    )
  }
})
