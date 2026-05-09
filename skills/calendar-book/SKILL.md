---
name: calendar-book
description: Book a confirmed property showing on the agent's Google Calendar
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

Books a 1-hour property showing on the real estate agent's Google Calendar. Always call calendar-check first and only book a slot from the returned `available_slots` list.

## When to use
- Lead has verbally confirmed a specific date and time for a showing
- Only after calendar-check has confirmed the slot is available
- Never book a time the lead mentioned without first verifying it via calendar-check

## Steps

1. Confirm you have all required information before calling:
   - Lead's full name
   - Lead's phone number (E.164 format, e.g. +12025551234)
   - Lead's email (optional — include if provided)
   - Property address for the showing
   - Confirmed datetime (use the exact ISO 8601 UTC string from `available_slots`)

2. POST to the book-showing Edge Function:

```bash
curl -s -X POST "$SUPABASE_URL/functions/v1/book-showing" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"agent_id\": \"$AGENT_ID\",
    \"datetime\": \"<CONFIRMED_SLOT_UTC>\",
    \"lead_name\": \"<LEAD_FULL_NAME>\",
    \"lead_phone\": \"<LEAD_PHONE_E164>\",
    \"lead_email\": \"<LEAD_EMAIL_OR_OMIT>\",
    \"property_address\": \"<FULL_PROPERTY_ADDRESS>\"
  }"
```

3. On success (`"confirmed": true`):
   - Confirm the booking verbally/in chat with the lead
   - Use crm-write to update lead's pipeline stage to `"showing_scheduled"` and log the `event_id`
   - Use gmail-send with template `"showing_confirmation"` if lead provided an email

4. On failure: apologize, offer a different time from the `available_slots` list, try again.

## Example

```bash
# Response
{
  "confirmed": true,
  "event_id": "abc123xyz456",
  "confirmation_sent": true
}
```

Say to lead: "You're all set! I've booked your showing at 123 Main St for Friday May 8th at 10am. You'll receive a confirmation email shortly."

## Error Handling
- If request fails: offer the next available slot from the calendar-check results and retry
- If `confirmed` is false: call calendar-check again to get a fresh list of slots — the previous one may be stale
- Always confirm verbally with the lead before ending the conversation, even if the calendar event was created
- Store `event_id` in crm-write notes — needed by the Showing Coordinator agent for follow-up
