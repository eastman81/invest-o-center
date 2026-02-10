// Save (encrypt and store) a user's API key for a provider. Requires ENCRYPTION_KEY (32-byte hex).
// Auth: we read user from JWT and use it for PostgREST (RLS). Gateway validates JWT by default.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SB_PUBLISHABLE_KEY') ?? ''
const ENCRYPTION_KEY_HEX = Deno.env.get('ENCRYPTION_KEY')

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, DELETE, OPTIONS',
}

function jsonResponse(body: object, status: number, headers?: Record<string, string>) {
  return Response.json(body, { status, headers: { ...CORS_HEADERS, ...headers } })
}

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2)
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  }
  return out
}

async function encrypt(plaintext: string): Promise<string> {
  if (!ENCRYPTION_KEY_HEX || ENCRYPTION_KEY_HEX.length !== 64) {
    throw new Error('ENCRYPTION_KEY must be 32 bytes (64 hex chars)')
  }
  const keyBytes = hexToBytes(ENCRYPTION_KEY_HEX)
  const key = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt']
  )
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const data = new TextEncoder().encode(plaintext)
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    data
  )
  const ivB64 = btoa(String.fromCharCode(...iv))
  const ctB64 = btoa(String.fromCharCode(...new Uint8Array(ciphertext)))
  return `${ivB64}:${ctB64}`
}

interface RequestBody {
  provider: string
  key: string
}

const ALLOWED_PROVIDERS = ['alpha_vantage', 'coin_gecko', 'discogs', 'gold_api', 'just_tcg', 'rent_cast']

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS })
  }

  if (req.method === 'DELETE') {
    const authHeader = req.headers.get('Authorization')
    const token = authHeader?.replace(/^Bearer\s+/i, '')
    if (!token) return jsonResponse({ code: 'UNAUTHORIZED', message: 'Missing token.' }, 401)
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
    if (!userId) return jsonResponse({ code: 'UNAUTHORIZED', message: 'Invalid token.' }, 401)
    let delBody: { provider?: string }
    try {
      delBody = (await req.json()) as { provider?: string }
    } catch {
      delBody = {}
    }
    const provider = typeof delBody?.provider === 'string' ? delBody.provider.trim() : ''
    if (!provider || !ALLOWED_PROVIDERS.includes(provider)) {
      return jsonResponse({ code: 'BAD_REQUEST', message: 'Valid provider required in body.' }, 400)
    }
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    })
    const { error } = await supabase
      .from('user_api_keys')
      .delete()
      .eq('user_id', userId)
      .eq('provider', provider)
    if (error) return jsonResponse({ code: 'DELETE_ERROR', message: error.message }, 500)
    return jsonResponse({ ok: true }, 200)
  }

  if (req.method !== 'POST') {
    return jsonResponse({ code: 'METHOD_NOT_ALLOWED' }, 405)
  }

  if (!SUPABASE_ANON_KEY) {
    return jsonResponse({ code: 'CONFIG_ERROR', message: 'Missing SUPABASE_ANON_KEY.' }, 500)
  }
  if (!ENCRYPTION_KEY_HEX || ENCRYPTION_KEY_HEX.length !== 64) {
    return jsonResponse({ code: 'CONFIG_ERROR', message: 'ENCRYPTION_KEY must be 32 bytes (64 hex chars).' }, 500)
  }

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

  let body: RequestBody
  try {
    body = (await req.json()) as RequestBody
  } catch {
    return jsonResponse({ code: 'BAD_REQUEST', message: 'Invalid JSON body.' }, 400)
  }

  const provider = typeof body?.provider === 'string' ? body.provider.trim() : ''
  const key = typeof body?.key === 'string' ? body.key.trim() : ''
  if (!provider || !ALLOWED_PROVIDERS.includes(provider)) {
    return jsonResponse({ code: 'BAD_REQUEST', message: 'provider must be one of: ' + ALLOWED_PROVIDERS.join(', ') }, 400)
  }
  if (!key) {
    return jsonResponse({ code: 'BAD_REQUEST', message: 'key is required.' }, 400)
  }

  let encrypted: string
  try {
    encrypted = await encrypt(key)
  } catch (e) {
    return jsonResponse({ code: 'CONFIG_ERROR', message: (e as Error).message }, 500)
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  })

  const { error } = await supabase
    .from('user_api_keys')
    .upsert(
      { user_id: userId, provider, encrypted_key: encrypted },
      { onConflict: 'user_id,provider' }
    )

  if (error) {
    return jsonResponse({ code: 'SAVE_ERROR', message: error.message }, 500)
  }
  return jsonResponse({ ok: true, provider }, 200)
})
