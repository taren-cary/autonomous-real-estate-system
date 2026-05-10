---
name: calendar-book
description: Book, cancel, or reschedule a property showing on the agent's Google Calendar
user-invocable: false
metadata: {
  "openclaw": {
    "emoji": "✅",
    "requires": {
      "bins": ["curl"],
      "env": ["SUPABASE_URL", "SUPABASE_ANON_KEY", "AGENT_ID"]
    }
  }
}
---

# calendar-book

Books, cancels, or reschedules property showings on the real estate agent's Google Calendar. Always call calendar-check first before creating a new booking to confirm the slot is available.

## Operations

### create — Book a new showing

Use after the lead confirms a specific time from calendar-check results.

```bash
curl -s -X POST "$SUPABASE_URL/functions/v1/book-showing" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"agent_id\": \"$AGENT_ID\",
    \"operation\": \"create\",
    \"datetime\": \"<CONFIRMED_SLOT_UTC>\",
    \"lead_name\": \"<LEAD_FULL_NAME>\",
    \"lead_phone\": \"<LEAD_PHONE_E164>\",
    \"lead_email\": \"<LEAD_EMAIL_OR_OMIT>\",
    \"property_address\": \"<FULL_PROPERTY_ADDRESS>\"
  }"
```

**Response:**
```json
{ "confirmed": true, "event_id": "google_cal_event_id_here", "confirmation_sent": false }
```

**After a successful create — always log the event_id to CRM immediately:**
```bash
# Log event_id in a parseable format so it can be retrieved for cancel/reschedule
curl -s -X POST "$SUPABASE_URL/functions/v1/crm-write" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"agent_id\": \"$AGENT_ID\",
    \"operation\": \"log_interaction\",
    \"contact\": {
      \"phone\": \"<LEAD_PHONE>\",
      \"notes\": \"SHOWING_BOOKED | CALENDAR_EVENT_ID: <event_id> | Property: <address> | DateTime: <datetime>\"
    }
  }"
```

The `CALENDAR_EVENT_ID:` prefix makes it parseable when cancel/reschedule is needed later.

---

### cancel — Cancel an existing showing

Requires the `event_id` from the original booking (stored in CRM notes).

```bash
curl -s -X POST "$SUPABASE_URL/functions/v1/book-showing" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"agent_id\": \"$AGENT_ID\",
    \"operation\": \"cancel\",
    \"event_id\": \"<google_cal_event_id>\"
  }"
```

**Response:** `{ "cancelled": true, "event_id": "..." }`

After cancelling, update the lead's CRM stage back to `qualified` and log the cancellation.

---

### reschedule — Move a showing to a new time

Uses PATCH — only updates start/end time. Summary, description, and attendees are preserved.

```bash
curl -s -X POST "$SUPABASE_URL/functions/v1/book-showing" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"agent_id\": \"$AGENT_ID\",
    \"operation\": \"reschedule\",
    \"event_id\": \"<google_cal_event_id>\",
    \"new_datetime\": \"<NEW_CONFIRMED_SLOT_UTC>\"
  }"
```

**Response:** `{ "rescheduled": true, "event_id": "...", "new_datetime": "..." }`

Always call calendar-check first to confirm the new time is available before rescheduling.

---

## How to find the event_id for cancel/reschedule

The `event_id` is logged to CRM notes when a showing is booked. Use crm-read to retrieve it:

```bash
# Look up the lead's contact to find their event_id in notes
curl -s -X POST "$SUPABASE_URL/functions/v1/crm-read" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"agent_id\": \"$AGENT_ID\",
    \"operation\": \"get_contact\",
    \"filters\": { \"phone\": \"<lead_phone>\" }
  }"
```

Search the returned `notes` array for a note containing `CALENDAR_EVENT_ID:` — extract the ID after that prefix.

---

## Error handling
- If create fails: offer the next available slot from calendar-check and retry
- If cancel or reschedule fails with 404: the event may have already been deleted; verify with the real estate agent
- If reschedule fails: the original event is unchanged — offer alternatives and retry
- Always update the CRM stage after any operation (create → showing_scheduled, cancel → qualified, reschedule → log new time)
