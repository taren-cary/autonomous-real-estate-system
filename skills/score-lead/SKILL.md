---
name: score-lead
description: Score a lead from qualifying answers and get routing decision — book showing, follow up, or drip
user-invocable: false
metadata: {
  "openclaw": {
    "emoji": "🎯",
    "requires": {
      "bins": ["curl"],
      "env": ["SUPABASE_URL", "SUPABASE_ANON_KEY", "AGENT_ID"]
    }
  }
}
---

# score-lead

Scores a lead after all qualifying answers are collected. Returns a tier (hot/warm/cold) and routing decision that determines the next step in the intake flow.

## When to use
- Immediately after collecting all 6 qualifying answers from a new lead
- Before deciding whether to book a showing or route to follow-up
- Never call this more than once per lead intake conversation

## Qualifying Questions to Collect First (one at a time, never all at once)
1. Are you looking to buy or sell?
2. What is your timeline?
3. What is your budget range?
4. Have you been pre-approved for financing?
5. What areas or neighborhoods are you interested in?
6. Are you currently working with another agent?

## Steps

1. Once all 6 answers are collected, POST to the score-lead Edge Function:

```bash
curl -s -X POST "$SUPABASE_URL/functions/v1/score-lead" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"agent_id\": \"$AGENT_ID\",
    \"answers\": {
      \"intent\": \"<buy|sell>\",
      \"timeline\": \"<timeline_string>\",
      \"budget\": \"<budget_string>\",
      \"pre_approved\": <true|false>,
      \"areas\": [\"<area1>\", \"<area2>\"],
      \"working_with_agent\": <true|false>
    }
  }"
```

2. Read the `routing` field from the response and act accordingly:
   - `"book_showing"` (hot, score ≥ 70) → use calendar-check skill, then calendar-book skill
   - `"crm_followup"` (warm, score 40–69) → collect contact details, use crm-write skill, schedule follow-up
   - `"drip"` (cold, score < 40) → collect contact details, use crm-write skill with stage "drip", end warmly

3. Always use crm-write after scoring to log the lead score, tier, and qualifying answers regardless of routing.

## Example

```bash
# Response
{
  "score": 85,
  "tier": "hot",
  "routing": "book_showing",
  "reason": "Pre-approved for financing, Short timeline (1-3 months), Clear intent to buy, Budget defined"
}
```

Next step: "Great news — let me check some available times for a showing."
Then call the calendar-check skill.

## Error Handling
- If the request fails (non-200): default to "warm" routing — collect contact info and use crm-write to log manually
- Never tell the lead their numeric score or tier label
- Never skip calling crm-write, even if scoring fails
