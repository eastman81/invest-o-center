// Proxy Discogs database search so the client can search by album/artist name.
// Uses per-user Discogs token from user_api_keys when set; else DISCOGS_TOKEN env.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SB_PUBLISHABLE_KEY') ?? ''
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const DISCOGS_TOKEN = Deno.env.get('DISCOGS_TOKEN')
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

async function resolveDiscogsToken(userId: string): Promise<string | null> {
  if (SERVICE_ROLE_KEY && ENCRYPTION_KEY_HEX?.length === 64) {
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
    const { data: row } = await admin
      .from('user_api_keys')
      .select('encrypted_key')
      .eq('user_id', userId)
      .eq('provider', 'discogs')
      .maybeSingle()
    if (row?.encrypted_key && typeof row.encrypted_key === 'string') {
      try {
        return await decrypt(row.encrypted_key)
      } catch {
        // fall through
      }
    }
  }
  return DISCOGS_TOKEN ?? null
}

interface SearchResult {
  id: number
  title: string
  thumb: string
  year?: string
  format?: string[]
  lowest_price?: number | null
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

    let body: { q?: string }
    try {
      body = (await req.json()) as { q?: string }
    } catch {
      return jsonResponse({ code: 'BAD_REQUEST', message: 'Invalid JSON body.' }, 400)
    }

    const q = typeof body?.q === 'string' ? body.q.trim() : ''
    if (!q) {
      return jsonResponse({ code: 'BAD_REQUEST', message: 'Query "q" is required.' }, 400)
    }

    const discogsToken = await resolveDiscogsToken(userId)
    if (!discogsToken) {
      return jsonResponse({
        code: 'PROVIDER_ERROR',
        message: 'Add your Discogs token in Account → API keys, or ask the app admin to set DISCOGS_TOKEN.',
      }, 502)
    }

    const url = new URL('https://api.discogs.com/database/search')
    url.searchParams.set('q', q)
    url.searchParams.set('type', 'release')
    url.searchParams.set('per_page', '15')

    const res = await fetch(url.toString(), {
      headers: {
        'Authorization': `Discogs token=${discogsToken}`,
        'User-Agent': 'InvestOCenter/1.0 +https://github.com/investocenter',
      },
    })

    if (res.status === 429) {
      return jsonResponse({ code: 'RATE_LIMIT', message: 'Discogs rate limit. Try again in a minute.' }, 429)
    }
    if (!res.ok) {
      return jsonResponse({ code: 'PROVIDER_ERROR', message: `Discogs returned ${res.status}.` }, 502)
    }

    const data = (await res.json()) as { results?: Array<{ id: number; title: string; thumb?: string; year?: string; format?: string[] }> }
    const raw = data?.results ?? []
    const results: SearchResult[] = []
    const headers = {
      'Authorization': `Discogs token=${discogsToken}`,
      'User-Agent': 'InvestOCenter/1.0 +https://github.com/investocenter',
    }
    for (let i = 0; i < Math.min(raw.length, 8); i++) {
      const r = raw[i]
      const releaseUrl = `https://api.discogs.com/releases/${r.id}?curr_abbr=USD`
      let lowest_price: number | null = null
      try {
        const releaseRes = await fetch(releaseUrl, { headers })
        if (releaseRes.ok) {
          const releaseData = (await releaseRes.json()) as { lowest_price?: number }
          lowest_price = typeof releaseData.lowest_price === 'number' ? releaseData.lowest_price : null
        }
      } catch {
        // keep null
      }
      results.push({
        id: r.id,
        title: r.title ?? '',
        thumb: r.thumb ?? '',
        year: r.year,
        format: Array.isArray(r.format) ? r.format : undefined,
        lowest_price,
      })
    }

    return jsonResponse({ results }, 200)
  } catch (e) {
    console.error('discogs-search error:', e)
    return jsonResponse({ code: 'SERVER_ERROR', message: 'Something went wrong. Try again.' }, 500)
  }
})
