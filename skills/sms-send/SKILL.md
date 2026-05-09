---
name: sms-send
description: Send an SMS text message to a lead from the agent's dedicated Twilio number. Use when responding to inbound SMS leads or sending follow-up texts.
user-invocable: false
metadata: {
  "openclaw": {
    "emoji": "💬",
    "requires": {
      "bins": ["curl"],
      "env": ["SUPABASE_URL", "SUPABASE_ANON_KEY", "AGENT_ID"]
    }
  }
}
---

# sms-send

Sends an SMS from the client's dedicated Twilio number to a lead's phone. All messages go through the sms-send Supabase edge function — Twilio credentials never touch the VPS.

## When to use
- Replying to a lead who texted in via the Twilio number
- Sending a follow-up text after a voicemail was left
- Sending a showing confirmation text after booking
- Any outbound text communication to a lead's phone number

## The lead's phone number
When responding to an inbound SMS, the lead's phone number is in the `from` field of the hook payload delivered to your session. Always reply to that number.

## Steps

```bash
curl -s -X POST "$SUPABASE_URL/functions/v1/sms-send" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"agent_id\": \"$AGENT_ID\",
    \"to\": \"<lead_phone_e164>\",
    \"message\": \"<your message text>\"
  }"
```

## Parameters

| Field | Required | Notes |
|---|---|---|
| `agent_id` | yes | Always use `$AGENT_ID` |
| `to` | yes | Lead's phone in E.164 format (e.g. +12025551234) |
| `message` | yes | The text to send. Keep it conversational and concise. |

## Example — replying to an inbound SMS

```json
{
  "agent_id": "sarah-johnson-realty",
  "to": "+12025551234",
  "message": "Hi! Thanks for reaching out. I'd love to help — are you looking to buy or sell?"
}
```

## Response

```json
{ "sent": true, "message_sid": "SMxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" }
```

## Tone guidelines for SMS
- Keep messages short — 1-3 sentences max
- Conversational, not formal
- Never send more than one question per message
- Don't use bullet points or markdown formatting — it renders as plain text
- If you need to share a lot of info, split into multiple short messages

## Error handling
- If `sent` is false or request fails: log the failure via crm-write and retry once
- If the lead's phone is unreachable (carrier error in detail): note it in CRM and try email instead
