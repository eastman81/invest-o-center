# API integrations

This doc describes the external APIs we call for **price refresh** (Edge Function `refresh-item-price`): what we request, how we authenticate, and what we expect from each response.

Keys can be set at **app level** (Edge Function secrets) for all users, or **per user** in Account → API keys (stored encrypted in `user_api_keys`). Per-user keys override app-level keys when present.

---

## 1. Alpha Vantage (stocks)

**Provider id:** `alpha_vantage`  
**Item requirement:** Category has `price_provider: 'alpha_vantage'`. Item has a **ticker** (e.g. `AAPL`, `MSFT`) in `category_fields.ticker` or `external_id`.

### Request

| Field    | Value |
|----------|--------|
| **Method** | `GET` |
| **URL**    | `https://www.alphavantage.co/query` |
| **Query params** | `function=GLOBAL_QUOTE`, `symbol=<ticker>`, `apikey=<key>` |
| **Headers** | None (key in query) |

**Example**

```
GET https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=AAPL&apikey=YOUR_KEY
```

**App key env:** `ALPHA_VANTAGE_API_KEY`  
**Docs:** https://www.alphavantage.co/documentation/

### Response (success)

JSON. We read:

- **Rate limit:** If `Note` or `Information` contains “API call frequency”, we treat as 429.
- **Price:** `data["Global Quote"]["05. price"]` (string, e.g. `"185.23"`).

**Example**

```json
{
  "Global Quote": {
    "01. symbol": "AAPL",
    "05. price": "185.23",
    ...
  }
}
```

We parse `05. price` as a number and use it as `unit_value` (USD).

---

## 2. CoinGecko (crypto)

**Provider id:** `coin_gecko`  
**Item requirement:** Category has `price_provider: 'coin_gecko'`. Item has a **Coin ID** (e.g. `bitcoin`, `ethereum`) in `category_fields.coin_id` or `external_id`. We send the id lowercased.

### Request

| Field    | Value |
|----------|--------|
| **Method** | `GET` |
| **URL**    | `https://api.coingecko.com/api/v3/simple/price` |
| **Query params** | `ids=<coin_id>`, `vs_currencies=usd` |
| **Headers** | `x-cg-demo-api-key: <key>` (Demo API) |

**Example**

```
GET https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd
x-cg-demo-api-key: YOUR_KEY
```

**App key env:** `COINGECKO_API_KEY`  
**Docs:** https://www.coingecko.com/api/documentation (Simple Price, Demo API)

### Response (success)

JSON. Top-level key is the coin id (e.g. `bitcoin`). We read:

- **Price:** `data[<coin_id>].usd` (number).

**Example**

```json
{
  "bitcoin": {
    "usd": 97234.5
  }
}
```

We use `data[coin_id].usd` as `unit_value` (USD).

---

## 3. RentCast (real estate / home value)

**Provider id:** `rent_cast`  
**Item requirement:** Category has `price_provider: 'rent_cast'`. Item has **address** in `category_fields.address` (or `external_id`). Optional but recommended: `city`, `state`, `zip` in `category_fields` for accurate property matching. We build one string: `"<street>, <city>, <state>, <zip>"` (omitting empty parts).

### Request

| Field    | Value |
|----------|--------|
| **Method** | `GET` |
| **URL**    | `https://api.rentcast.io/v1/avm/value` |
| **Query params** | `address=<full address string>` |
| **Headers** | `X-Api-Key: <key>`, `Accept: application/json` |

**Example**

```
GET https://api.rentcast.io/v1/avm/value?address=404%20W%2037th%20St%2C%20Austin%2C%20TX%2078705
X-Api-Key: YOUR_KEY
Accept: application/json
```

**App key env:** `RENTCAST_API_KEY`  
**Docs:** https://developers.rentcast.io/reference/value-estimate (Property Valuation → Value Estimate)

### Response (success)

JSON. We read the **value** from the first of these that is a number:

- `data.price`
- `data.value`
- `data.valuation.value`
- `data.avm.value`
- `data.data.value`

**Example** (actual shape we use)

```json
{
  "price": 886000,
  "priceRangeLow": 689000,
  "priceRangeHigh": 1083000,
  "subjectProperty": {
    "formattedAddress": "404 W 37th St, Austin, TX 78705",
    ...
  },
  "comparables": [...]
}
```

We use `price` as `unit_value` (USD). The Edge Function also logs the full response in Supabase (refresh-item-price logs) for debugging.

---

## 4. Discogs (CDs & records)

**Provider id:** `discogs`  
**Item requirement:** Category has `price_provider: 'discogs'`. Item has a **Discogs Release ID** (numeric, or full release URL) in `category_fields.discogs_release_id` or `external_id`.

Discogs is used for **vinyl and CD** (and other physical formats). Each release has a unique ID; the API returns format and marketplace price. Our “CDs & Records” category uses this template.

### Request

| Field    | Value |
|----------|--------|
| **Method** | `GET` |
| **URL**    | `https://api.discogs.com/releases/<release_id>` |
| **Query params** | `curr_abbr=USD` (optional; currency for marketplace data; defaults to user currency if authenticated as user) |
| **Headers** | **Required:** `User-Agent: <app name/version + URL>` (e.g. `InvestOCenter/1.0 +https://yourapp.com`). **Auth (for 60/min and price):** `Authorization: Discogs token=<token>` or `Authorization: Discogs key=<key>, secret=<secret>` |

**Example**

```
GET https://api.discogs.com/releases/249504?curr_abbr=USD
User-Agent: InvestOCenter/1.0 +https://example.com
Authorization: Discogs token=YOUR_TOKEN
```

**App key env:** `DISCOGS_TOKEN` (Personal Access Token from Developer Settings).  
**Docs:** https://www.discogs.com/developers/ (Database → Release, Authentication)

### Rate limits

- **Unauthenticated:** 25 requests/minute (and no image URLs).  
- **Authenticated** (token or key+secret): 60 requests/minute.  
Response headers: `X-Discogs-Ratelimit-Remaining`, etc.

### Response (success)

JSON. Relevant fields:

- **Price:** `data.lowest_price` (number; marketplace lowest in the requested currency).  
- **Format:** `data.formats` (e.g. `[{ "name": "Vinyl", "qty": "1", "descriptions": ["LP", "Album"] }]` or `"CD"`), so the same endpoint works for vinyl, CD, etc.

**Example (excerpt)**

```json
{
  "id": 249504,
  "title": "Never Gonna Give You Up",
  "lowest_price": 0.63,
  "num_for_sale": 58,
  "formats": [{ "name": "Vinyl", "qty": "1", "descriptions": ["7\"", "Single", "45 RPM"] }],
  "year": 1987,
  ...
}
```

We use `lowest_price` as `unit_value` (USD). Release ID can be the numeric ID or a Discogs release URL; we extract the ID before calling the API.

### Search (by album/artist name)

The app lets users search Discogs by name when adding/editing a CDs & Records item. The **discogs-search** Edge Function proxies the request so the token stays server-side.

| Field    | Value |
|----------|--------|
| **Method** | `POST` |
| **URL**    | (Supabase) `/functions/v1/discogs-search` |
| **Body**   | `{ "q": "<search query>" }` |
| **Headers** | `Authorization: Bearer <user JWT>` (client sends session) |

The function calls Discogs search, then fetches release details for the first 8 results to get `lowest_price` (USD). It returns `{ results: [ { id, title, thumb, year, format, lowest_price } ] }`. The UI shows format (e.g. Vinyl, CD) and price so users can pick releases that have marketplace listings; selecting a result stores the release `id` and auto-fills the item name.

---

## 5. JustTCG (trading cards)

**Provider id:** `just_tcg`  
**Item requirement:** Category has `price_provider: 'just_tcg'`. Item has a **JustTCG card ID** (product ID from JustTCG search or dashboard) in `category_fields.tcgplayer_id` or `external_id`.

JustTCG provides **raw/ungraded** card pricing only. Data is by condition (Near Mint, Lightly Played, etc.) and printing (Normal, Foil, etc.). There is no PSA/BGS/CGC or other graded-slab data; for graded pricing you would need a different source.

**Docs:** https://justtcg.com/docs

### Request

| Field    | Value |
|----------|--------|
| **Method** | `GET` |
| **URL**    | `https://api.justtcg.com/v1/cards` |
| **Query params** | `tcgplayerId=<id>` (card/product ID from JustTCG) |
| **Headers** | `x-api-key: <key>` (no "Bearer") |

**Example**

```
GET https://api.justtcg.com/v1/cards?tcgplayerId=219042
x-api-key: YOUR_KEY
```

**App key env:** `JUSTTCG_API_KEY`  
Get a key at [justtcg.com](https://justtcg.com) (Dashboard → Get API Key).

### Rate limits (from JustTCG docs)

- **Free:** 1,000 requests/month, 100/day, 10/min.
- **Starter / Pro / Enterprise:** higher limits; see [justtcg.com/docs](https://justtcg.com/docs).

### Response (success)

JSON. We read:

- **Data:** `data` is an array of card objects. Each card has a `variants` array; each variant has `price` (USD number).
- **Price used:** We take the **lowest** variant price across all conditions/printings for that card and use it as `unit_value` (USD).

**Example (excerpt)**

```json
{
  "data": [
    {
      "id": "pokemon-battle-academy-fire-energy-22-charizard-stamped",
      "name": "Fire Energy (#22 Charizard Stamped)",
      "game": "Pokemon",
      "variants": [
        { "condition": "Near Mint", "printing": "Normal", "price": 4.99 },
        { "condition": "Lightly Played", "printing": "Normal", "price": 3.50 }
      ]
    }
  ]
}
```

We use `Math.min(...variant.prices)` as `unit_value` (USD).

### Search (by card name)

The app lets users search JustTCG by card name when adding/editing a Trading Cards item. The **justtcg-search** Edge Function proxies the request so the API key stays server-side.

| Field    | Value |
|----------|--------|
| **Method** | `POST` |
| **URL**    | (Supabase) `/functions/v1/justtcg-search` |
| **Body**   | `{ "q": "<search query>" }` — optional: `"game": "<game id>"` to narrow by game |
| **Headers** | `Authorization: Bearer <user JWT>` (client sends session) |

The function calls JustTCG `GET /v1/cards?q=...&limit=8` and returns `{ results: [ { tcgplayerId, name, set_name, game, lowest_price } ] }`. The UI shows set, game, and price; selecting a result stores the card ID and auto-fills the item name so Refresh can use it.

---

## Summary

| Provider       | App key env            | Item identifier     | We extract                    |
|----------------|------------------------|---------------------|-------------------------------|
| Alpha Vantage  | `ALPHA_VANTAGE_API_KEY`| Ticker              | `Global Quote["05. price"]`   |
| CoinGecko      | `COINGECKO_API_KEY`    | Coin ID             | `data[coin_id].usd`           |
| Discogs        | `DISCOGS_TOKEN`        | Release ID (numeric or URL) | `data.lowest_price`   |
| JustTCG        | `JUSTTCG_API_KEY`      | JustTCG card ID     | lowest of `data[0].variants[].price` |
| RentCast       | `RENTCAST_API_KEY`     | Full address string | `data.price` (or fallbacks)   |

All five are invoked from the **refresh-item-price** Edge Function when the user clicks “Refresh” on an item whose category has the matching `price_provider`. Keys can be set in Supabase Edge Function secrets (app-level) or per user in Account → API keys.
