---
name: crm-write
description: Create contacts, update pipeline stages, and log interactions in the client's GoHighLevel CRM
user-invocable: false
metadata: {
  "openclaw": {
    "emoji": "📋",
    "requires": {
      "bins": ["curl"],
      "env": ["SUPABASE_URL", "SUPABASE_ANON_KEY", "AGENT_ID"]
    }
  }
}
---

# crm-write

Writes to the real estate agent's GoHighLevel CRM via the crm-write Edge Function. Handles three operations: creating new contacts, moving contacts through the pipeline, and logging interaction notes.

## When to use
- **create_contact** — immediately after a new lead is qualified (any tier: hot, warm, or cold)
- **update_stage** — when a lead's status changes (showing booked, showing complete, under contract, etc.)
- **log_interaction** — after every conversation or interaction, regardless of outcome

Always call crm-write. Never skip it. Every lead and every interaction must be logged.

## Operations

### create_contact
Creates a new GHL contact and places them in the pipeline at the correct stage.

```bash
curl -s -X POST "$SUPABASE_URL/functions/v1/crm-write" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"agent_id\": \"$AGENT_ID\",
    \"operation\": \"create_contact\",
    \"contact\": {
      \"name\": \"<full_name>\",
      \"phone\": \"<e164_phone>\",
      \"email\": \"<email_or_omit>\",
      \"lead_source\": \"<zillow|web|whatsapp|sms|email|phone>\",
      \"pipeline_stage\": \"<stage_key>\",
      \"score\": <0-100>,
      \"notes\": \"<qualifying_summary>\"
    }
  }"
```

### update_stage
Moves an existing contact to a new pipeline stage. Looks up the contact by phone number.

```bash
curl -s -X POST "$SUPABASE_URL/functions/v1/crm-write" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"agent_id\": \"$AGENT_ID\",
    \"operation\": \"update_stage\",
    \"contact\": {
      \"phone\": \"<e164_phone>\",
      \"pipeline_stage\": \"<stage_key>\",
      \"notes\": \"<reason_for_stage_change>\"
    }
  }"
```

### log_interaction
Adds a note to an existing contact's record. Looks up the contact by phone number.

```bash
curl -s -X POST "$SUPABASE_URL/functions/v1/crm-write" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"agent_id\": \"$AGENT_ID\",
    \"operation\": \"log_interaction\",
    \"contact\": {
      \"phone\": \"<e164_phone>\",
      \"notes\": \"<interaction_summary>\"
    }
  }"
```

## Pipeline Stage Keys

| Key | GHL Stage Name | When to use |
|---|---|---|
| `new_lead` | New Lead | First contact, unqualified |
| `qualified` | Qualified | Qualifying complete, warm routing |
| `showing_scheduled` | Showing Scheduled | Showing booked |
| `showing_complete` | Showing Complete | After the showing happens |
| `active_buyer` | Active Buyer/Seller | Actively searching, agent engaged |
| `under_contract` | Under Contract | Offer accepted |
| `closed` | Closed | Deal closed |
| `drip` | New Lead | Cold lead, entering drip sequence |
| `crm_followup` | Qualified | Warm lead routed to follow-up |

## Standard Flow Per Lead

1. Lead makes contact → **create_contact** with stage `new_lead`
2. Qualifying complete → **update_stage** to `qualified` (or `drip` if cold)
3. Showing booked → **update_stage** to `showing_scheduled`
4. After every conversation → **log_interaction** with summary

## Error Handling
- If create_contact fails: log the lead details manually in the conversation and retry once
- If contact not found for update_stage or log_interaction: try create_contact first, then retry
- Never skip logging — if all else fails, note the failure in the next successful log_interaction call
