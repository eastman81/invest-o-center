# Plan tier: edits for refresh-item-price

The `refresh-item-price` Edge Function is not in the repo (only `helpers.ts` is). When you have `index.ts` back, apply these edits so free users cannot use app-level API keys.

## 1. Fetch plan after loading the item

After you have `userId` and have loaded the item (and categories), fetch the user's plan:

```ts
const { data: profile } = await supabase
  .from('profiles')
  .select('plan')
  .eq('id', userId)
  .maybeSingle()
const allowAppKeys = profile?.plan !== 'free'  // treat null/missing as paid
```

## 2. Change resolveApiKey signature and behavior

- **Signature:** `resolveApiKey(userId: string, provider: string, options?: { allowAppKeys?: boolean }): Promise<string | null>`
- **Behavior:** When `options?.allowAppKeys === false`, only look up `user_api_keys` for that user; do **not** return any app-level env key. When `allowAppKeys` is true or omitted, keep current behavior (user key if present, else app-level key).

So at the start of the function body, if `allowAppKeys === false` and no user key was found, return null; otherwise when true, fall through to the existing env key lookup.

## 3. Pass allowAppKeys into every resolveApiKey call

Replace each:

- `resolveApiKey(userId!, 'alpha_vantage')`  
with  
- `resolveApiKey(userId!, 'alpha_vantage', { allowAppKeys })`

Do the same for every provider: `coin_gecko`, `gold_api`, `discogs`, `just_tcg`, `rent_cast`.

## 4. Error message when free and no key

When you return a 502 because the key is missing (e.g. "Add your JustTCG API key in Account..."), if `allowAppKeys === false` append:

` You're on the Free plan — add your own key in Account, or upgrade to Paid to use the app's keys.`

You can add a helper like `const freePlanHint = !allowAppKeys ? " You're on the Free plan — add your own key in Account, or upgrade to Paid to use the app's keys." : ""` and append it to the relevant error messages.
