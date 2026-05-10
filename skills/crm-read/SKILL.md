---
name: crm-read
description: Read contact records, active buyers, upcoming showings, and pipeline counts from the client's GoHighLevel CRM. Use when you need to look up lead data, find active buyers for listing matches, check pipeline health, or read transaction details.
user-invocable: false
metadata: {
  "openclaw": {
    "emoji": "📖",
    "requires": {
      "bins": ["curl"],
      "env": ["SUPABASE_URL", "SUPABASE_ANON_KEY", "AGENT_ID"]
    }
  }
}
---

# crm-read

Reads from the client's GoHighLevel CRM via the crm-read Edge Function. Three operations covering contact lookup, filtered contact lists, and pipeline summaries.

## When to use

| Agent | Use case | Operation |
|---|---|---|
| Intake | Look up an existing lead by phone before creating a duplicate | `get_contact` |
| Showing Coordinator | Check which leads have upcoming showings (returns phone for sms-send) | `list_contacts` with `showing_scheduled` stage |
| Showing Coordinator | Get full contact details including phone by GHL contact ID | `get_contact_by_id` |
| Deadline Monitor | Find all active transactions to check deadlines | `list_contacts` with `under_contract` or `active_buyer` stage |
| Listings & Market | Get active buyers and their criteria for MLS matching | `list_contacts` with `active_buyer` stage |
| Admin | Get pipeline counts for morning briefing | `pipeline_summary` |

---

## Operations

### get_contact — look up a single contact by phone number

```bash
curl -s -X POST "$SUPABASE_URL/functions/v1/crm-read" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"agent_id\": \"$AGENT_ID\",
    \"operation\": \"get_contact\",
    \"filters\": { \"phone\": \"+12025551234\" }
  }"
```

Returns: `{ contact: { id, firstName, lastName, email, phone, tags, notes: [...] } }` or `{ contact: null }` if not found.

---

### get_contact_by_id — look up a single contact by their GHL contact ID

Use this when you have a `contact_id` from `list_contacts` and need the full contact including phone.

```bash
curl -s -X POST "$SUPABASE_URL/functions/v1/crm-read" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"agent_id\": \"$AGENT_ID\",
    \"operation\": \"get_contact_by_id\",
    \"filters\": { \"contact_id\": \"ghl-contact-id-here\" }
  }"
```

Returns: `{ contact: { id, firstName, lastName, email, phone, tags, notes: [...] } }` or `{ contact: null }`.

---

### list_contacts — list contacts filtered by pipeline stage or tags

```bash
# By pipeline stage (e.g. active buyers)
curl -s -X POST "$SUPABASE_URL/functions/v1/crm-read" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"agent_id\": \"$AGENT_ID\",
    \"operation\": \"list_contacts\",
    \"filters\": {
      \"pipeline_stage\": \"active_buyer\",
      \"limit\": 50
    }
  }"

# By tags
curl -s -X POST "$SUPABASE_URL/functions/v1/crm-read" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"agent_id\": \"$AGENT_ID\",
    \"operation\": \"list_contacts\",
    \"filters\": {
      \"tags\": [\"buyer\"],
      \"limit\": 50
    }
  }"
```

**Pipeline stage values:** `new_lead`, `qualified`, `showing_scheduled`, `showing_complete`, `active_buyer`, `under_contract`, `closed`

Returns: `{ contacts: [...], total: N }`

**For MLS monitoring:** Use `pipeline_stage: "active_buyer"` to get active buyers. Their notes contain qualifying answers (areas, budget, bedrooms) from the intake conversation.

---

### pipeline_summary — count opportunities per stage

```bash
curl -s -X POST "$SUPABASE_URL/functions/v1/crm-read" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"agent_id\": \"$AGENT_ID\",
    \"operation\": \"pipeline_summary\"
  }"
```

Returns:
```json
{
  "pipeline_summary": {
    "New Lead": 12,
    "Qualified": 5,
    "Showing Scheduled": 3,
    "Active Buyer/Seller": 8,
    "Under Contract": 2
  },
  "total_open": 30
}
```

Use this for the Admin Agent morning briefing pipeline section.

---

## Error handling
- `contact: null` from `get_contact` → lead is not yet in CRM, create them with crm-write
- Empty `contacts: []` from `list_contacts` → no contacts match that stage/tags
- 503 error → GHL connection not configured; note in your report and flag to Admin Agent
