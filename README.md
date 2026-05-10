# Autonomous Real Estate AI System
**Built by Sauma AI**

A fully autonomous real estate AI employee that handles every stage of an agent's workflow — from the moment a lead enters the system to closing day — without the agent manually managing follow-ups, scheduling, deadlines, or listing content.

The real estate agent interacts with **one agent only**: the Admin Agent via Telegram. Every other agent operates autonomously in the background.

---

## What It Does

### Lead Intake — Every Channel, Automatically

| Channel | How it works |
|---|---|
| **Phone call (inbound)** | Lead calls → SIP trunk → Retell inbound agent answers as receptionist |
| **Phone call (outbound)** | Zillow/web form submitted → instant outbound call to lead within seconds |
| **SMS** | Lead texts → routed to OpenClaw intake agent with per-lead conversation thread |
| **Email** | Inbox polled every 5 minutes → new emails routed to OpenClaw with per-sender thread |

### Qualifying — Voice and Text

Both Retell voice agents and the OpenClaw text agent run the same qualifying flow, one question at a time:

1. Are you looking to buy or sell?
2. What is your timeline?
3. What is your budget range?
4. Have you been pre-approved for financing?
5. What areas or neighborhoods are you interested in?
6. Are you currently working with another agent?

After all 6 answers are collected, the system scores the lead and decides the next step automatically.

### Lead Scoring

Every lead gets scored 0–100 and routed instantly:
- **Hot (70+)** → check calendar, propose times, book a showing
- **Warm (40–69)** → log to CRM, start follow-up sequence
- **Cold (<40)** → log to CRM, enter drip track

### Showing Management

- **Check availability** — queries the agent's Google Calendar for open 1-hour slots during business hours
- **Book a showing** — creates the calendar event, confirms verbally/in-text with the lead
- **Cancel a showing** — removes the calendar event, moves lead back to qualified stage in CRM
- **Reschedule a showing** — updates the event time without touching the title, description, or attendees

### Listing Search (During Conversations)

When a lead asks "what do you have in Bethesda under $500k?" during a call or text, the agent searches the agent's Google Sheet inventory in real time and responds with matching listings. Filters by area, price range, bedrooms, and status.

### CRM — GoHighLevel, Fully Automated

Every lead and every interaction is logged to GHL automatically:
- Contact created (with deduplication — no duplicates if same phone texts and calls)
- Pipeline stage updated as the lead progresses
- Qualifying answers logged as structured notes
- Call transcripts and summaries logged after every voice call
- Showing details (property, datetime, calendar event ID) stored in retrievable format
- Confirmation status tracked by the Showing Coordinator

**Pipeline stages:** New Lead → Qualified → Showing Scheduled → Showing Complete → Active Buyer/Seller → Under Contract → Closed

### Post-Call Intelligence

After every Retell voice call ends, the system automatically:
1. Extracts structured data (intent, timeline, budget, pre-approval, areas, whether a showing was booked, the calendar event ID, lead email, lead name, call summary, sentiment)
2. Creates or updates the lead's CRM contact
3. Sends a showing confirmation email **and** text if a showing was booked
4. Starts a follow-up text sequence for voicemails or unsuccessful calls
5. Notifies the Admin Agent if a showing was booked

### Email — Full Thread Support

Outbound emails are sent from the agent's own Gmail account. When replying to a lead's email, the system uses `In-Reply-To` and `References` headers so the reply lands in the existing thread — both in the agent's Gmail and in the lead's inbox.

**Email templates:** showing confirmation, warm follow-up, cold follow-up, market report

### SMS

Outbound texts are sent from the agent's dedicated Twilio phone number. Every lead gets their own conversation thread — no mixing of different leads in the same chat context.

---

## Operational Agents (Autonomous Background Workers)

### Showing Coordinator Agent
Runs every **30 minutes**. For every showing in the next 48 hours:
- Verifies three confirmations: lead, listing agent, property access
- Sends reminders at 48hr, 24hr, and 2hr intervals via email and SMS
- If a party cancels: attempts to reschedule (uses the stored calendar event ID)
- Escalates to Admin Agent immediately for anything it can't resolve on its own

### Deadline Monitor Agent
Runs every **hour**. Across all active transactions:
- Tracks: inspection contingency, financing contingency, appraisal, repair response window, closing date, listing expiration, warm lead follow-up dates
- 7 days out: logs to CRM only
- 3 days out: priority alert to Admin Agent with recommended action
- 1 day out: urgent alert with specific recommended action
- Never misses a deadline. Never sends a warning without a recommendation.

### Listings & Market Agent
Scans daily at **8am**. On demand via Admin Agent:
- **MLS monitoring** — scans Zillow for new listings posted in the last 48 hours matching active buyers' criteria (fetched live from CRM), notifies matched buyers via email, logs to CRM
- **CMA research** — browses Zillow for recently sold comparables, calculates value range with condition adjustments, delivers structured report to Admin Agent for review before it reaches the client
- **Listing copy** — turns raw property specs into a complete marketing package: MLS description (150–220 words), Instagram caption with hashtags, Facebook post, email blast — all Fair Housing compliant, no clichés

### Admin Agent
The **only agent** the real estate agent interacts with, via Telegram.

**Morning briefing at 7am:**
- Today's showings with confirmation status
- Deadlines this week with urgency level
- Pipeline summary (hot/warm/cold counts, active transactions)
- Active escalations from any agent
- Top 3 action items for today

**On-demand commands:**
- "Follow up with John Smith" → delegates to intake agent
- "Build a CMA for 123 Main St" → delegates to listings agent
- "Check for new listings matching [buyer] criteria" → delegates to listings agent
- "What's the pipeline looking like?" → reads CRM and responds

**Escalation handling:** Any worker agent can send an urgent message to Admin at any time. Admin surfaces it immediately — never waits for the morning briefing.

---

## Agent Communication

All 5 agents can message each other via OpenClaw's inter-agent system:
- Worker agents → Admin Agent only (escalations, completions)
- Admin Agent → any worker (delegated commands from the real estate agent)

Each agent knows exactly when to escalate, what information to include, and what action to recommend. Admin Agent never leaves the real estate agent wondering what to do next.

---

## Technical Architecture

### Entry Points
```
Web Form / Zillow → trigger-outbound-call → Retell Outbound Agent
Inbound Call      → SIP Trunk → Retell Inbound Agent
Twilio SMS        → handle-inbound-sms → OpenClaw (per-lead session)
Email             → check-email cron → OpenClaw (per-sender session)
```

### Supabase Edge Functions (12)

| Function | Purpose |
|---|---|
| `score-lead` | Scores qualifying answers → hot/warm/cold + routing decision |
| `check-availability` | Queries Google Calendar for open showing slots |
| `book-showing` | Creates, cancels, or reschedules calendar events |
| `gmail-send` | Sends templated email with reply threading support |
| `crm-write` | Creates contacts (with dedup), updates pipeline, logs notes |
| `crm-read` | Reads contacts, opportunities, pipeline summary from GHL |
| `sms-send` | Sends SMS from agent's Twilio number |
| `get-listings` | Reads Google Sheet inventory, returns filtered listings |
| `check-email` | Polls Gmail inbox, routes emails to per-sender sessions |
| `trigger-outbound-call` | Fires Retell outbound call from webhook |
| `handle-call-ended` | Bridges Retell post-call analysis → OpenClaw |
| `handle-inbound-sms` | Routes Twilio SMS → OpenClaw with per-lead session |

### Retell Voice Agents (2 per client)

Both share the same Twilio phone number and 4 tools. Different prompts for different roles.

**Outbound Agent** — proactively calls leads from Zillow/web forms
**Inbound Agent** — answers calls as receptionist, qualifies if interest expressed, handles cancel/reschedule requests gracefully

**Tools available to both:** score_lead, check_availability, book_showing, get_listings

**Post-call analysis extracts 13 fields** from every call transcript, including: call summary, sentiment, all 6 qualifying answers, whether a showing was booked, and the Google Calendar event ID.

### OpenClaw Agents (5 per client)

| Agent | Model | Schedule |
|---|---|---|
| Intake | Claude Sonnet 4.6 | Always-on (SMS, email, post-call) |
| Showing Coordinator | Claude Haiku 4.5 | Heartbeat every 30 min |
| Deadline Monitor | Claude Haiku 4.5 | Heartbeat every hour |
| Listings & Market | Claude Sonnet 4.6 | Cron: MLS scan 8am daily |
| Admin Agent | Claude Opus 4.6 | Cron: morning brief 7am + on-demand |

**Scheduled jobs:** Morning briefing (7am), pipeline check (noon), MLS scan (8am), email check (every 5 min)

### Integrations

| Service | What it connects to |
|---|---|
| **Maton** | Google Calendar, Gmail, Google Sheets, GoHighLevel — managed OAuth for all |
| **GoHighLevel** | Primary CRM — contacts, opportunities, pipeline, notes |
| **Retell AI** | Voice agents with post-call analysis and webhook |
| **Twilio** | Phone number, SIP trunk for Retell, SMS for OpenClaw |
| **Telegram** | Admin Agent channel — real estate agent's command interface |
| **OpenClaw** | Multi-agent framework running on Hostinger VPS |
| **Supabase** | Edge functions, client database, webhook endpoints |

### Client Database Schema

Every deployed client has one row storing all their credentials and connection IDs:

```
agent_id, agent_name, agent_email, timezone
maton_connection_id (Google Calendar OAuth)
gmail_connection_id (Gmail OAuth)
ghl_connection_id (GHL Private Integration Token)
ghl_location_id, ghl_pipeline_id
listing_connection_id (Google Sheets OAuth)
listing_sheet_id
retell_agent_id (outbound), retell_inbound_agent_id
twilio_number
openclaw_base_url, openclaw_hooks_token
```

---

## Deployment

Each client gets:
- A dedicated Hostinger VPS running OpenClaw via Docker
- Their own Twilio phone number with SIP trunk for Retell voice
- 2 Retell AI agents (inbound + outbound) with the same number
- 5 OpenClaw agents configured and running
- Google Calendar, Gmail, Google Sheets, and GoHighLevel all connected via Maton OAuth
- Telegram bot for Admin Agent access

Deployment is handled by the Sauma AI Fulfillment Agent running the `onboard-client` skill. The entire process — Maton connections, Retell setup, Twilio provisioning, SIP trunk, Supabase record, OpenClaw deployment, agent configuration, cron jobs, skill deployment — is automated.

**Client onboarding experience:**
1. Receive one email with 4 authorization links (Google Calendar, Gmail, Google Sheets, GoHighLevel)
2. Click each link and authorize
3. Receive a Telegram bot link — message it once to activate the Admin Agent
4. System is live

---

## Repository Structure

```
skills/
  onboard-client/       ← Master deployment skill (Sauma AI Fulfillment Agent)
  calendar-check/       ← Check Google Calendar availability
  calendar-book/        ← Book, cancel, or reschedule showings
  score-lead/           ← Score qualifying answers
  crm-write/            ← Write to GoHighLevel CRM
  crm-read/             ← Read from GoHighLevel CRM
  gmail-send/           ← Send templated emails
  sms-send/             ← Send SMS via Twilio
  email-check/          ← Poll Gmail inbox
  get-listings/         ← Search Google Sheet listing inventory
  zillow/               ← Zillow knowledge + pricing/investing reference
  listing-writer/       ← Generate MLS copy, social posts, email blasts
  cma-research/         ← Build CMAs using Zillow sold comps
  mls-monitor/          ← Scan Zillow for new listings matching buyer criteria

workspace-templates/
  intake/SOUL.md
  showing-coordinator/SOUL.md
  deadline-monitor/SOUL.md
  listings-market/SOUL.md
  admin/SOUL.md

autonomous-realestate-ai.md    ← Full architecture reference (v3.1)
Retell LLM Creation - Fulfillment Agent Guide.md
Openclaw Docs Reference.md
Google Calendar Maton API Reference.md
Gmail Maton API Reference.md
Google Sheets Maton API Reference.md
GoHighLevel Maton API Reference.md
```

---

## Required Supabase Secrets

Set these in the Supabase dashboard before any edge function works:

| Secret | Used by |
|---|---|
| `MATON_API_KEY` | All calendar, email, CRM, and listings functions |
| `RETELL_API_KEY` | trigger-outbound-call |
| `TRIGGER_WEBHOOK_SECRET` | trigger-outbound-call, handle-inbound-sms |
| `RETELL_WEBHOOK_SECRET` | handle-call-ended |
| `TWILIO_ACCOUNT_SID` | sms-send, handle-inbound-sms |
| `TWILIO_AUTH_TOKEN` | sms-send |

---

*Built by [Sauma AI](https://saumaai.com)*
