---
name: calendar-check
description: Check agent's Google Calendar for open showing time slots in a given date range
user-invocable: false
metadata: {
  "openclaw": {
    "emoji": "📅",
    "requires": {
      "bins": ["curl"],
      "env": ["SUPABASE_URL", "SUPABASE_ANON_KEY", "AGENT_ID"]
    }
  }
}
---

# calendar-check

Checks the real estate agent's Google Calendar and returns available 1-hour showing slots within a requested date range. Business hours only (Mon–Sat, 9am–6pm in the agent's timezone). Minimum 2-hour lead time enforced automatically.

## When to use
- A hot lead wants to schedule a showing
- You need to propose available times before booking
- Checking whether a specific time is open before calling calendar-book

## Steps

1. Determine the date range to check:
   - Default: today through 5 days from now
   - Adjust if the lead specifies preferred days or says "this week" / "next week"
   - Format dates as ISO 8601 UTC (e.g., `2026-05-07T00:00:00Z`)

2. POST to the check-availability Edge Function:

```bash
curl -s -X POST "$SUPABASE_URL/functions/v1/check-availability" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"agent_id\": \"$AGENT_ID\",
    \"date_range\": {
      \"start\": \"<TODAY>T00:00:00Z\",
      \"end\": \"<END_DATE>T23:59:59Z\"
    }
  }"
```

3. Parse the `available_slots` array. Each slot is a UTC ISO 8601 timestamp for the start of a 1-hour block.

4. Present 2–3 options conversationally. Convert UTC times to the lead's local timezone if known, otherwise present in the agent's timezone.

## Example

```bash
# Response
{
  "available_slots": [
    "2026-05-08T14:00:00Z",
    "2026-05-09T10:00:00Z",
    "2026-05-09T15:00:00Z"
  ]
}
```

Say to lead: "I have Friday at 10am, Friday at 3pm, and Saturday at 10am open. Which works best for you?"

Once they confirm a time, use the calendar-book skill with that exact slot timestamp.

## Error Handling
- If `available_slots` is empty: "I don't see any open times in that range — would you like me to check the following week?"
- If request fails (non-200): apologize, say you'll follow up to confirm a time, use crm-write to log the issue
- Never reveal error details to the lead
