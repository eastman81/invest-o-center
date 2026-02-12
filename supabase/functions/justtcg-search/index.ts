// Proxy JustTCG card search so the client can search by card name.
// Uses per-user JustTCG key from user_api_keys when set; else JUSTTCG_API_KEY env.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SB_PUBLISHABLE_KEY') ?? ''
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const JUSTTCG_API_KEY = Deno.env.get('JUSTTCG_API_KEY')
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

async function resolveJustTCGKey(userId: string, allowAppKeys: boolean): Promise<string | null> {
  if (SERVICE_ROLE_KEY && ENCRYPTION_KEY_HEX?.length === 64) {
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
    const { data: row } = await admin
      .from('user_api_keys')
      .select('encrypted_key')
      .eq('user_id', userId)
      .eq('provider', 'just_tcg')
      .maybeSingle()
    if (row?.encrypted_key && typeof row.encrypted_key === 'string') {
      try {
        return await decrypt(row.encrypted_key)
      } catch {
        // fall through
      }
    }
  }
  if (!allowAppKeys) return null
  return JUSTTCG_API_KEY ?? null
}

interface CardFromApi {
  tcgplayerId?: string
  name?: string
  set_name?: string
  game?: string
  variants?: Array<{ price?: number }>
}

interface SearchResult {
  tcgplayerId: string
  name: string
  set_name: string
  game: string
  lowest_price: number | null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS })
  }

  if (req.method !== 'POST') {
    return jsonResponse({ code: 'METHOD_NOT_ALLOWED' }, 405)
  }

  if (!SUPABASE_ANON_KEY) {
    return jsonResponse({ code: 'CONFIG_ERROR', message: 'Server missing API key.' }, 500)
  }

  try {
    const authHeader = req.headers.get('Authorization')
    const token = authHeader?.replace(/^Bearer\s+/i, '')
    if (!token) {
      return jsonResponse({ code: 'UNAUTHORIZED', message: 'Missing or invalid token.' }, 401)
    }

    let userId: string | null = null
    try {
      const parts = token.split('.')
      if (parts.length === 3) {
        const payloadB64 = parts[1]
        const padded = payloadB64.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (payloadB64.length % 4)) % 4)
        const claims = JSON.parse(atob(padded)) as { sub?: string }
        userId = claims.sub ?? null
      }
    } catch {
      // ignore
    }
    if (!userId) {
      return jsonResponse({ code: 'UNAUTHORIZED', message: 'Invalid or malformed token.' }, 401)
    }

    let body: { q?: string; game?: string }
    try {
      body = (await req.json()) as { q?: string; game?: string }
    } catch {
      return jsonResponse({ code: 'BAD_REQUEST', message: 'Invalid JSON body.' }, 400)
    }

    const q = typeof body?.q === 'string' ? body.q.trim() : ''
    if (!q) {
      return jsonResponse({ code: 'BAD_REQUEST', message: 'Query "q" is required.' }, 400)
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY!)
    const { data: profile } = await admin.from('profiles').select('plan').eq('id', userId).maybeSingle()
    const allowAppKeys = profile?.plan !== 'free'

    const apiKey = await resolveJustTCGKey(userId, allowAppKeys)
    if (!apiKey) {
      const freeHint = !allowAppKeys
        ? " You're on the Free plan — add your own key in Account, or upgrade to Paid to use the app's keys."
        : ''
      return jsonResponse({
        code: 'PROVIDER_ERROR',
        message: 'Add your JustTCG API key in Account → API keys, or ask the app admin to set JUSTTCG_API_KEY.' + freeHint,
      }, 502)
    }

    const url = new URL('https://api.justtcg.com/v1/cards')
    url.searchParams.set('q', q)
    url.searchParams.set('limit', '8')
    if (typeof body?.game === 'string' && body.game.trim()) {
      url.searchParams.set('game', body.game.trim())
    }

    const res = await fetch(url.toString(), {
      headers: { 'x-api-key': apiKey },
    })

    if (res.status === 429) {
      return jsonResponse({ code: 'RATE_LIMIT', message: 'JustTCG rate limit. Try again in a minute.' }, 429)
    }
    if (!res.ok) {
      return jsonResponse({ code: 'PROVIDER_ERROR', message: `JustTCG returned ${res.status}.` }, 502)
    }

    const data = (await res.json()) as { data?: CardFromApi[] }
    const cards = Array.isArray(data?.data) ? data.data : []
    const results: SearchResult[] = cards.slice(0, 8).map((card) => {
      const variants = card?.variants ?? []
      const prices = variants.map((v) => (typeof v?.price === 'number' ? v.price : NaN)).filter((p) => !Number.isNaN(p))
      const lowest_price = prices.length > 0 ? Math.min(...prices) : null
      return {
        tcgplayerId: typeof card?.tcgplayerId === 'string' ? card.tcgplayerId : '',
        name: typeof card?.name === 'string' ? card.name : '',
        set_name: typeof card?.set_name === 'string' ? card.set_name : '',
        game: typeof card?.game === 'string' ? card.game : '',
        lowest_price,
      }
    }).filter((r) => r.tcgplayerId)

    return jsonResponse({ results }, 200)
  } catch (e) {
    console.error('justtcg-search error:', e)
    return jsonResponse({ code: 'SERVER_ERROR', message: 'Something went wrong. Try again.' }, 500)
  }
})
