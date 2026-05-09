---
name: cma-research
description: Build a comparative market analysis (CMA) for a subject property using Zillow sold comps. Use when asked to research comparable sales, build a CMA, or analyze market value for a specific property before a listing appointment.
metadata: {
  "openclaw": {
    "emoji": "📊",
    "requires": {
      "env": [],
      "bins": []
    }
  }
}
---

# CMA Research

Builds a comparative market analysis using Zillow sold data and the Zillow skill's pricing framework. Always delivers to Admin Agent for review before the report goes to the client — never send directly.

## When to use
- Admin Agent delegates a CMA request for a specific property
- Real estate agent asks "build a CMA for [address]" or "I have a listing appointment at [address]"
- A seller wants to know what their home is worth

## Required inputs (from Admin Agent's delegation message)
- Subject property full address
- Beds, baths, approximate sqft
- Property type (single-family, condo, townhome, multi-family)

## Steps

### Step 1 — Look up subject property on Zillow
Navigate to zillow.com and search for the subject property address. Note:
- Zestimate (flag if wildly off — caveat: typically 5-15% off in most markets)
- Property details (confirm beds/baths/sqft accuracy)
- Any listed price or sold history shown

### Step 2 — Pull sold comparables
Search Zillow for recently SOLD properties near the subject address using these filters:
- **Sold:** Last 90 days (extend to 180 if fewer than 3 results)
- **Type:** Same property type as subject
- **Distance:** Within 0.5 miles (extend to 1 mile if needed)
- **Sqft:** ±15% of subject sqft
- **Beds:** Same count or one off

For each comp, record:

| Address | Sold Price | Sold Date | Beds/Baths | Sqft | Price/Sqft | DOM | Notes |
|---|---|---|---|---|---|---|---|
| ... | ... | ... | ... | ... | ... | ... | upgrades, condition |

Collect 3–6 comps. Note any market thinness if fewer than 3 found.

### Step 3 — Survey active competition
Search currently ACTIVE listings in the same area with similar specs. These are what the subject will compete against.

For each active listing: address, list price, DOM, standout features.

### Step 4 — Calculate value range
1. Calculate average price/sqft across all sold comps
2. Multiply by subject sqft → baseline value
3. Apply condition adjustments:
   - Upgraded kitchen/baths vs comps: +3–7%
   - Below-average condition vs comps: −3–7%
   - Premium location (cul-de-sac, views, large lot): +2–5%
   - Inferior location (busy road, power lines, backing to commercial): −2–5%
4. Set value range: conservative / midpoint / aggressive

### Step 5 — Structure the CMA report

```
CMA REPORT — [Subject Address]
Prepared: [Today's Date]

SUBJECT PROPERTY
Address:      [full address]
Specs:        [Beds]BR / [Baths]BA / [Sqft] sqft / [Property Type]
Zestimate:    $[X] (note: Zillow estimate — verify against comps)

SOLD COMPARABLES (last [90/180] days)
[Address] | $[price] | [date] | [beds/baths] | [sqft] | $[price/sqft] | [DOM] days
[repeat for each comp]

Average Price/Sqft of Comps: $[X]
Baseline Value (avg $/sqft × subject sqft): $[X]

ACTIVE COMPETITION
[Address] | $[list price] | [DOM] days on market | [notes]

ESTIMATED MARKET VALUE
Conservative:  $[low]
Midpoint:      $[mid]
Aggressive:    $[high]

PRICING RECOMMENDATION
[1–2 sentences: where to price based on DOM trends, inventory level, 
and subject condition vs comps. Reference whether it's a buyer's or seller's market.]

DATA NOTES
- Source: Zillow. Verify sqft and bed counts with county assessor before finalizing.
- Zestimate of $[X] is [above/below] comp-derived value by approximately [%].
- Comp pool: [N] sales within [distance] in [timeframe].
```

### Step 6 — Deliver to Admin Agent
Send the completed report via sessions_send:
- Target: `agent:admin-agent-$CLIENT_ID:main`
- timeoutSeconds: 0
- Message prefix: "CMA complete — [address] — ready for your review before sending to client"

## Error handling
- Fewer than 3 comps: expand radius to 1 mile and/or window to 180 days, note thin market in report
- Property not on Zillow: ask Admin Agent if county records or MLS printout can be provided
- Zestimate is more than 15% off comps: flag explicitly — worth discussing with the seller
- Do not send the CMA to the client directly — always route through Admin Agent first
