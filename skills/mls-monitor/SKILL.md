---
name: mls-monitor
description: Scan Zillow for new listings in the agent's market area and match them against active buyer criteria. Use on each heartbeat run or when Admin Agent asks to check for new listings matching a specific buyer's needs.
metadata: {
  "openclaw": {
    "emoji": "🔔",
    "requires": {
      "env": [],
      "bins": []
    }
  }
}
---

# MLS Monitor

Scans Zillow for properties listed in the last 48 hours, matches them against active buyer criteria, notifies matched buyers via email, logs to CRM, and reports to Admin Agent. Zillow data lags MLS by 1–2 days — flag this when timing is critical.

## When to use
- On each heartbeat run (automated monitoring)
- When Admin Agent delegates: "check for new listings for [buyer name]" or "scan the market for new [criteria]"

## Inputs

The market area to scan comes from the triggering message. Active buyer criteria are fetched live from the CRM — do not wait for the Admin Agent to provide them.

## Steps

### Step 0 — Fetch active buyers from CRM

Pull the current list of active buyers and their criteria before scanning Zillow:

```bash
curl -s -X POST "$SUPABASE_URL/functions/v1/crm-read" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"agent_id\": \"$AGENT_ID\",
    \"operation\": \"list_contacts\",
    \"filters\": { \"pipeline_stage\": \"active_buyer\", \"limit\": 50 }
  }"
```

For each contact returned, read their notes to extract their criteria — the intake agent logged areas, price range, and bedroom requirements there during qualifying.

### Step 1 — Browse Zillow for new listings
Navigate to zillow.com and search the market area with these filters:
- **Listed:** Last 2 days (or "Last 48 hours")
- **Status:** For Sale (active only)
- **Type:** Residential (or per buyer criteria)

If no "listed date" filter is available, look for listings marked "New" or "Just Listed."

### Step 2 — Record new listings found
For each new listing, capture:
- Full address
- List price
- Beds / Baths / Sqft
- Key features or description highlights
- Zillow URL
- Date listed (confirm it's within 48 hours)

If no new listings found → reply **HEARTBEAT_OK** and stop here.

### Step 3 — Match against buyer criteria
For each new listing, check against each active buyer's criteria:

A match requires ALL of:
- Area: listing address is in buyer's target neighborhood/city/ZIP
- Price: list price is within buyer's max budget (allow +10% — they may negotiate)
- Bedrooms: meets or exceeds buyer's minimum

Record: which listing matches which buyer (can be multiple buyers per listing).

### Step 4 — Act on matches

**For each buyer match:**

1. Log to CRM via crm-write (log_interaction):
   ```
   New listing match found: [address] listed at $[price] — [beds/baths/sqft]
   Matches [buyer name]'s criteria: [area], $[budget], [beds]+ BR
   Zillow: [url]
   ```

2. Notify the buyer via gmail-send (template: follow_up_warm):
   - Variables: lead_name, agent_name
   - Customize the message body to mention the specific property

3. Report to Admin Agent via sessions_send (`agent:admin-agent-$CLIENT_ID:main`, timeoutSeconds: 0):
   ```
   New listing matches found — [date]

   [Buyer Name]: [address] at $[price] ([beds]BR/[baths]BA)
   [repeat per match]

   CRM updated. Buyer notification emails sent.
   Recommended: review each match and confirm whether to schedule showings.
   ```

### Step 5 — Log the scan regardless of matches
Use crm-write (log_interaction) to note the scan completed:
```
MLS scan — [date]: [N] new listings in [area], [M] buyer matches found.
```

## Notes
- Zillow lags MLS by 1–2 days — if a buyer needs immediate alerts, flag this limitation to Admin Agent
- Do not flag the same listing twice across heartbeat runs — if a listing was found in a previous scan, skip it (check CRM log notes to see if it was already flagged)
- If Zillow shows an inaccurate bed/bath count for a match, note "verify specs with MLS" in the CRM log
- Never notify a buyer about a listing without logging it to CRM first
