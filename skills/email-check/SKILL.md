---
name: email-check
description: Check the agent's Gmail inbox for new unread emails from leads. Use when triggered by the email-check cron job to process incoming lead inquiries sent to the real estate agent's email address.
user-invocable: false
metadata: {
  "openclaw": {
    "emoji": "📬",
    "requires": {
      "bins": ["curl"],
      "env": ["SUPABASE_URL", "SUPABASE_ANON_KEY", "AGENT_ID"]
    }
  }
}
---

# email-check

Polls the client's Gmail inbox for new unread emails from leads. Each email sender gets their own conversation thread (same session isolation as SMS). The edge function marks emails as read immediately and forwards them to OpenClaw — by the time this skill's cron fires, the emails have already been routed to per-sender sessions.

## When to use
- Triggered automatically by the `email-check-$CLIENT_ID` cron job (every 5 minutes)
- When the Admin Agent asks you to check for new email inquiries

## How it works

The `check-email` edge function does the heavy lifting:
1. Fetches unread emails from inbox (excludes noreply/automated senders)
2. For each email: extracts sender, subject, body
3. Marks email as read
4. Forwards to OpenClaw as a hook with `sessionKey=email:{sender_email}` — each sender gets their own conversation thread

When this skill is called by the cron, the emails may already be processing in their own sessions. The cron call confirms processing and handles any that weren't forwarded.

## Steps

```bash
curl -s -X POST "$SUPABASE_URL/functions/v1/check-email" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"agent_id\": \"$AGENT_ID\"}"
```

## Response

```json
{
  "emails": [
    {
      "message_id": "...",
      "from_name": "John Smith",
      "from_email": "john@email.com",
      "subject": "Interested in your listing on Oak Ave",
      "body": "Hi, I saw your listing...",
      "date": "Fri, 09 May 2026 10:22:00 +0000"
    }
  ],
  "total": 1
}
```

## What to do with each email

For each email returned:
1. **Determine if it's a genuine lead inquiry** — ignore automated emails, receipts, newsletters. Look for someone asking about buying/selling or a specific property.
2. **If it's a lead:** reply using gmail-send, log to CRM using crm-write (create_contact or log_interaction), and continue the qualifying conversation via email
3. **If it's not a lead:** skip it — it's already marked as read

## Handling ongoing email conversations

Each email sender has their own session keyed by their email address. If a lead has emailed before, their full conversation history is in this session. Continue from where you left off — don't re-introduce yourself.

## Reply guidelines for email
- Professional but warm — more formal than SMS
- Can be longer than SMS replies (1-3 short paragraphs is fine)
- Address what they asked before asking qualifying questions
- Sign off with the agent's name
- Use gmail-send with template `follow_up_warm` as a base, or craft a direct reply

## Error handling
- `total: 0` → no new emails, reply HEARTBEAT_OK
- 503 → Gmail not connected, log and notify Admin Agent
- 502 → Gmail API error, retry on next cron cycle
