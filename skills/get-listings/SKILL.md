---
name: get-listings
description: Search the agent's current property listings by area, price range, and bedrooms — returns active listings matching the lead's criteria
user-invocable: false
metadata: {
  "openclaw": {
    "emoji": "🏠",
    "requires": {
      "bins": ["curl"],
      "env": ["SUPABASE_URL", "SUPABASE_ANON_KEY", "AGENT_ID"]
    }
  }
}
---

# get-listings

Searches the real estate agent's current Google Sheets listing inventory and returns active properties matching optional filter criteria. Defaults to Active status only.

## When to use
- A lead asks what properties are available ("what do you have in Bethesda?")
- A lead mentions specific criteria ("I'm looking for a 3BR under $500k")
- A lead asks about a specific property ("tell me about the house on Maple Ave")
- After qualifying, to match lead's criteria against current inventory

## Steps

1. Call the get-listings Edge Function with optional filters based on what the lead shared:

```bash
# Without filters — returns all active listings
curl -s -X POST "$SUPABASE_URL/functions/v1/get-listings" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"agent_id\": \"$AGENT_ID\"}"

# With filters
curl -s -X POST "$SUPABASE_URL/functions/v1/get-listings" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"agent_id\": \"$AGENT_ID\",
    \"filters\": {
      \"areas\": [\"Bethesda\", \"Silver Spring\"],
      \"min_price\": 300000,
      \"max_price\": 500000,
      \"bedrooms\": 3
    }
  }"
```

2. Parse the `listings` array. Each listing has:
   - `address`, `price`, `status`, `bedrooms`, `bathrooms`, `sqft`
   - `hoa_fee` (0 if none), `features`, `school_district`

3. Present listings conversationally — summarize key details, don't recite every field.

## Available Filters

| Filter | Type | Description |
|---|---|---|
| `areas` | string[] | Match against address (e.g. ["Bethesda", "Silver Spring"]) |
| `min_price` | number | Minimum price in dollars |
| `max_price` | number | Maximum price in dollars |
| `bedrooms` | number | Minimum number of bedrooms |
| `status` | string | Default: "Active". Use "Pending" or "Sold" to see others. |

## Example

```json
{
  "listings": [
    {
      "address": "123 Main St, Bethesda MD",
      "price": 450000,
      "status": "Active",
      "bedrooms": 3,
      "bathrooms": 2,
      "sqft": 1800,
      "hoa_fee": 0,
      "features": "Renovated kitchen, large backyard, 2-car garage",
      "school_district": "Bethesda-Chevy Chase"
    }
  ],
  "total": 1
}
```

Present as: "I have a 3-bedroom, 2-bath home at 123 Main St in Bethesda listed at $450,000. It features a renovated kitchen, large backyard, and 2-car garage — in the Bethesda-Chevy Chase school district. Would you like to schedule a showing?"

## Error Handling
- `total: 0` → "I don't currently have any listings matching those criteria — would you like me to check a wider area or price range?"
- 503 error → listings not yet configured; apologize and offer to follow up
- 502 error → sheet temporarily unavailable; note it and follow up via email/text
