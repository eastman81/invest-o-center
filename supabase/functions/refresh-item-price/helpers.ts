/**
 * Shared helpers for refresh-item-price: provider inference, fetch with timeout, persist + success response.
 */
import { createClient } from 'npm:@supabase/supabase-js@2'

/** When category has no price_provider in DB, derive from name/slug (same logic as frontend template). */
export function getProviderFromTemplate(
  name: string | null | undefined,
  slug: string | null | undefined
): string | null {
  const norm = (s: string) =>
    s
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '')
  const n = name ? norm(String(name)) : ''
  const s = slug ? norm(String(slug)) : n
  const combined = `${s} ${n}`.trim()
  if (s === 'trading-cards' || n === 'trading-cards') return 'just_tcg'
  const justTcgKeywords = ['trading-card', 'tcg', 'pokemon', 'mtg', 'yugioh']
  for (const kw of justTcgKeywords) {
    if (combined.includes(kw) || s.includes(kw) || n.includes(kw)) return 'just_tcg'
  }
  return null
}

export const FETCH_TIMEOUT_MS = 15000

/** Fetch with timeout; throws on AbortError or network error. */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const ac = new AbortController()
  const timeoutId = setTimeout(() => ac.abort(), timeoutMs)
  try {
    const res = await fetch(url, { ...init, signal: ac.signal })
    return res
  } finally {
    clearTimeout(timeoutId)
  }
}

/** Update item unit_value and append to item_value_history. Returns null on success. */
export async function persistPriceAndHistory(
  supabase: ReturnType<typeof createClient>,
  itemId: string,
  userId: string,
  unitValue: number,
  currency: string
): Promise<{ code: string; message: string } | null> {
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
    return { code: 'PROVIDER_ERROR', message: 'Could not save updated price.' }
  }
  const { error: historyError } = await supabase.from('item_value_history').insert({
    item_id: itemId,
    recorded_at: new Date().toISOString(),
    unit_value: unitValue,
    currency,
  })
  if (historyError) console.error('item_value_history insert failed:', historyError.message)
  return null
}

/** Success body for refresh response; callers wrap with jsonResponse(..., 200). */
export function successResponseBody(itemId: string, unitValue: number) {
  return {
    ok: true,
    item_id: itemId,
    unit_value: unitValue,
    currency: 'USD' as const,
    last_price_at: new Date().toISOString(),
  }
}
