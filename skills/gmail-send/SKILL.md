---
name: gmail-send
description: Send a templated email from the agent's Gmail account — showing confirmations, warm follow-ups, cold follow-ups, market reports
user-invocable: false
metadata: {
  "openclaw": {
    "emoji": "📧",
    "requires": {
      "bins": ["curl"],
      "env": ["SUPABASE_URL", "SUPABASE_ANON_KEY", "AGENT_ID"]
    }
  }
}
---

# gmail-send

Sends a templated email from the real estate agent's connected Gmail account via the gmail-send Edge Function. The Edge Function handles building the RFC 2822 message, base64url encoding, and sending via the agent's authenticated Gmail connection.

## When to use
- Immediately after `book_showing` confirms successfully (use template: `showing_confirmation`)
- When routing a warm lead to follow-up sequence (use template: `follow_up_warm`)
- When routing a cold lead to drip sequence (use template: `follow_up_cold`)
- When the Listings & Market agent delivers a market report to a buyer (use template: `market_report`)
- Only call if the lead has provided an email address

## Templates

| Template | When to use | Required variables |
|---|---|---|
| `showing_confirmation` | After booking a showing | `lead_name`, `showing_datetime`, `property_address`, `agent_name` |
| `follow_up_warm` | Warm lead routed to follow-up | `lead_name`, `agent_name` |
| `follow_up_cold` | Cold lead routed to drip | `lead_name`, `agent_name` |
| `market_report` | Delivering a CMA or market update | `lead_name`, `agent_name`, `report_area`, `report_content` |

## Steps

1. Confirm the lead has provided an email address. If no email, skip this skill entirely.

2. POST to the gmail-send Edge Function:

```bash
curl -s -X POST "$SUPABASE_URL/functions/v1/gmail-send" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"agent_id\": \"$AGENT_ID\",
    \"template\": \"<template_name>\",
    \"to\": \"<lead_email>\",
    \"variables\": {
      \"lead_name\": \"<lead_first_name>\",
      \"agent_name\": \"<agent_display_name>\",
      \"showing_datetime\": \"<human_readable_datetime>\",
      \"property_address\": \"<full_address>\"
    }
  }"
```

3. On success (`"sent": true`): no further action needed — confirmation is sent.

4. Update the CRM via crm-write to log that an email was sent.

## Example — Showing Confirmation

```bash
# Request
{
  "agent_id": "sarah-johnson-realty",
  "template": "showing_confirmation",
  "to": "john@email.com",
  "variables": {
    "lead_name": "John",
    "showing_datetime": "Thursday May 8th at 10:00 AM",
    "property_address": "123 Main St, Bethesda MD",
    "agent_name": "Sarah Johnson"
  }
}

# Response
{
  "sent": true,
  "message_id": "18f2a3b4c5d6e7f8"
}
```

## Notes on showing_datetime Format
For `showing_datetime`, always convert the ISO 8601 UTC timestamp from `book_showing` into a human-readable string before passing it here. Example: `"2026-05-08T14:00:00Z"` → `"Thursday May 8th at 10:00 AM EST"`.

## Error Handling
- If `sent` is false or request fails: log the failure via crm-write and note that email was not sent — do not retry automatically
- If lead has no email: skip this skill entirely, confirm booking verbally/in chat only
- Never surface error details to the lead
