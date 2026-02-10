# Future improvements

Ideas to revisit when core features are done.

## Free tier vs paid tier

- **Paid tier:** Can use all of the app’s API keys (yours in Edge Function secrets). Price refresh and features work without users adding their own keys.
- **Free tier:** Must enter their own API keys in Account → API keys for the site to work (stocks, crypto, real estate refresh, etc.). No access to app-level keys.

## PriceCharting (paid)

- **URL:** https://www.pricecharting.com/api-documentation  
- **Coverage:** Video games, sports cards, comics, Funko Pops, Legos, coins, and more.  
- **Access:** API is available with a custom price guide purchase (paid only).  
- **Use case:** Single provider for many collectible categories we track; would reduce need for multiple separate APIs.  
- **When:** Consider once other integrations are stable and we want to consolidate collectibles pricing.

## Zillow / Bridge (home value)

- **Use case:** Higher-volume or alternative home value source. Requires approval; ~1K calls/day when approved. Consider if RentCast limits (50 free/month) are too low.

## Other possibilities

- **More TCG/collectible sources:** If JustTCG limits or coverage are tight, look at other niche APIs for specific games or categories.
