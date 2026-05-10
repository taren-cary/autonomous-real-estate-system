# Sauma AI — Autonomous Real Estate AI System
**Version:** 3.1
**Last Updated:** May 2026
**Platform:** OpenClaw + Retell AI + Supabase + Maton + GoHighLevel + Twilio + Telegram

---

## Table of Contents
1. [System Overview](#system-overview)
2. [Architecture Diagram](#architecture-diagram)
3. [Entry Points](#entry-points)
4. [Intake Layer](#intake-layer)
5. [Post-Call Bridge](#post-call-bridge)
6. [Supabase Edge Functions](#supabase-edge-functions)
7. [Clients Table](#clients-table)
8. [Operational Agents](#operational-agents)
9. [Agent Communication](#agent-communication)
10. [CRM Layer](#crm-layer)
11. [Shared Skills](#shared-skills)
12. [Client Onboarding Flow](#client-onboarding-flow)
13. [Agent Config Build Order](#agent-config-build-order)
14. [Environment Variables & Secrets](#environment-variables--secrets)

---

## System Overview

A fully autonomous real estate AI assistant handling every stage of an agent's workflow — from the moment a lead enters to closing day — without manual management of follow-ups, scheduling, deadlines, or listing content.

**The real estate agent interacts with one agent only: the Admin Agent via Telegram.**

All other agents operate autonomously and report to Admin via OpenClaw's `sessions_send` inter-agent messaging.

---

## Architecture Diagram

```
ENTRY POINTS
──────────────────────────────────────────────────────────────────────────
Web/Zillow  │  Inbound Call  │  Twilio SMS  │  Email  │  Outbound Call
     │              │                │            │            │
trigger-    │     Retell         handle-     check-    trigger-
outbound-   │     Inbound        inbound-    email     outbound-
call (fn)   │     Agent          sms (fn)    cron      call (fn)
     │              │                │            │            │
     ↓              │                └─────┬──────┘            ↓
Retell Outbound     │               OpenClaw Intake      Retell Outbound
Agent (voice)       │               Agent (text)         Agent (voice)
     │              │                    │
     └──────────────┴────────────────────┘
                          │
               ┌──────────┴──────────┐
               │  SUPABASE EDGE FNS  │
               │  score-lead         │
               │  check-availability │
               │  book-showing       │
               │  crm-write          │
               │  crm-read           │
               │  gmail-send         │
               │  sms-send           │
               │  get-listings       │
               │  check-email        │
               │  trigger-outbound   │
               │  handle-call-ended  │
               │  handle-inbound-sms │
               └──────────┬──────────┘
                          │
               ┌──────────┴──────────┐
               │                     │
          CRM (GHL)         GOOGLE CALENDAR
          via Maton          via Maton
               │
     ┌─────────┴──────────────────────────┐
     │              │                     │
 SHOWING        DEADLINE            LISTINGS &
 COORDINATOR    MONITOR             MARKET AGENT
 AGENT          AGENT
     │              │                     │
     └──────────────┴─────────────────────┘
                    │ (sessions_send)
              ADMIN AGENT
                    │ (Telegram)
          REAL ESTATE AGENT
```

---

## Entry Points

### 1. Web Form / Zillow
- Lead submits form → webhook to `trigger-outbound-call` edge function
- Edge function calls Retell → outbound call to lead within seconds

### 2. Inbound Phone Call
- Lead calls the Twilio number
- SIP trunk → `sip:sip.retellai.com` → Retell Inbound Agent

### 3. Twilio SMS
- Lead texts the Twilio number
- `SmsUrl` → `handle-inbound-sms` edge function
- Extracts `From` number → builds session key `sms:{phone}` → forwards to OpenClaw intake agent
- Each lead gets their own conversation thread

### 4. Email
- Lead emails the agent's Gmail address
- `email-check-$CLIENT_ID` cron fires every 5 minutes
- `check-email` edge function fetches unread emails via Maton Gmail API
- Each sender gets their own conversation thread (session key `email:{sender_email}`)
- Marks emails as read, forwards to OpenClaw intake agent via hook

### 5. Outbound (Zillow/web form trigger)
- Same as #1 — `trigger-outbound-call` initiates within seconds of form submission

---

## Intake Layer

### Two Retell Agents — Same Number, Different Roles

**Outbound Agent** — calls leads from Zillow/web forms
- Receives lead context via `retell_llm_dynamic_variables`: `lead_name`, `lead_source`, `property_interest`
- Opens assertively: *"Hi {{lead_name}}, this is {{agent_name}} — I'm reaching out because you expressed interest in {{property_interest}}..."*

**Inbound Agent** — answers calls to the Twilio number
- Opens as receptionist: *"Thank you for calling {{agent_name}} Real Estate, how can I help you today?"*

#### Qualifying Flow (both Retell agents)
1. Are you looking to buy or sell?
2. What is your timeline?
3. What is your budget range?
4. Have you been pre-approved for financing?
5. What areas or neighborhoods are you interested in?
6. Are you currently working with another agent?

#### Retell Tools (both agents — 4 tools)
| Tool | Purpose |
|---|---|
| `score_lead` | Scores answers, returns hot/warm/cold + routing |
| `check_availability` | Returns open 1-hour showing slots |
| `book_showing` | Creates calendar event, confirms verbally |
| `get_listings` | Searches client's Google Sheet for matching active listings |

**Retell does NOT write to CRM or send emails during the call.** All post-call work is handled by OpenClaw via the `handle-call-ended` bridge.

**Inbound agent — cancel/reschedule:** When a caller wants to cancel or reschedule, the agent acknowledges warmly, collects the preferred new time if rescheduling, and tells the caller they'll receive a text confirmation shortly. OpenClaw handles the actual calendar update post-call via SMS.

#### Post-Call Analysis
Both agents configured with `post_call_analysis_data` (13 fields) and `webhook_events: ["call_analyzed"]`. Extracts: `call_summary`, `call_successful`, `user_sentiment`, `intent`, `timeline`, `budget`, `pre_approved`, `areas`, `working_with_agent`, `showing_booked`, `calendar_event_id`, `lead_email`, `lead_name`.

---

### OpenClaw Intake Agent
Handles all text-based lead channels: SMS, email, phone call follow-up.

**Post-Retell-Call Responsibilities** (when `retell_call_analyzed` hook fires):
1. Create/update GHL contact via `crm-write` with call data + transcript
2. Send confirmation email via `gmail-send` if showing booked and lead has email
3. Send confirmation text via `sms-send` if showing booked
4. Start follow-up sequence if call was unsuccessful or voicemail reached
5. Notify Admin Agent of showing bookings via `sessions_send`

**Email intake:** Triggered by `email-check-$CLIENT_ID` cron (every 5 min). Each sender gets their own conversation session. Replies via `gmail-send`.

**SMS intake:** Triggered by `inbound-sms-$CLIENT_ID` hook (real-time). Each sender gets their own session. Replies via `sms-send`.

---

## Post-Call Bridge

### `handle-call-ended` Edge Function
Receives Retell's `call_analyzed` webhook → packages full `call_analysis` → forwards to OpenClaw.

**Webhook URL:** `https://ydimcpjsscevgjjyrdjp.supabase.co/functions/v1/handle-call-ended?token=$RETELL_WEBHOOK_SECRET&client=$CLIENT_ID`

### `handle-inbound-sms` Edge Function
Receives Twilio's SMS webhook → extracts `From`/`Body`/`To` → looks up client by `twilio_number` → builds session key `sms:{digits_only_phone}` → forwards to OpenClaw hook with per-lead session.

**SMS URL (set on Twilio number):** `https://ydimcpjsscevgjjyrdjp.supabase.co/functions/v1/handle-inbound-sms?token=$TRIGGER_WEBHOOK_SECRET`

---

## Supabase Edge Functions

All external integrations go through Supabase Edge Functions. Client credentials never touch OpenClaw or Retell directly.

| Function | Caller | Purpose |
|---|---|---|
| `score-lead` | Retell + OpenClaw | Score qualifying answers → tier + routing |
| `check-availability` | Retell + OpenClaw | Query Google Calendar freeBusy → open slots |
| `book-showing` | Retell + OpenClaw | Create, cancel, or reschedule calendar events via Maton |
| `crm-write` | OpenClaw only | create_contact (with dedup) / update_stage / log_interaction in GHL |
| `crm-read` | OpenClaw only | get_contact / get_contact_by_id / list_contacts (with phone) / pipeline_summary |
| `gmail-send` | OpenClaw only | Send templated email; supports reply threading via thread_id + In-Reply-To headers |
| `sms-send` | OpenClaw only | Send SMS from agent's Twilio number via Twilio Messages API |
| `get-listings` | Retell + OpenClaw | Read Google Sheet → return filtered active listings |
| `check-email` | OpenClaw (cron) | Poll Gmail → return thread_id + rfc_message_id; forward to OpenClaw per-sender sessions |
| `trigger-outbound-call` | Web/Zillow webhooks | Initiate outbound Retell call to lead |
| `handle-call-ended` | Retell webhook | Bridge call_analyzed data → OpenClaw with sessionKey in body + calendar_event_id |
| `handle-inbound-sms` | Twilio SMS webhook | Route inbound SMS → OpenClaw with sessionKey in request body (per-lead session) |

---

## Clients Table

```sql
CREATE TABLE clients (
  agent_id              TEXT PRIMARY KEY,
  agent_name            TEXT,
  agent_email           TEXT,           -- agent's Gmail address
  timezone              TEXT,           -- IANA timezone
  -- Maton connections
  maton_connection_id   TEXT,           -- Google Calendar OAuth via Maton
  gmail_connection_id   TEXT,           -- Gmail OAuth via Maton
  ghl_connection_id     TEXT,           -- GHL Private Integration Token via Maton
  ghl_location_id       TEXT,           -- GHL sub-account location ID
  ghl_pipeline_id       TEXT,           -- GHL pipeline ID (fetched post-onboarding)
  listing_connection_id TEXT,           -- Google Sheets OAuth via Maton
  listing_sheet_id      TEXT,           -- Google Sheet ID of current listings
  -- Retell
  retell_agent_id       TEXT,           -- Retell outbound agent ID
  retell_inbound_agent_id TEXT,         -- Retell inbound agent ID
  -- Twilio
  twilio_number         TEXT,           -- E.164 Twilio number
  -- OpenClaw
  openclaw_base_url     TEXT,           -- http://VPS_HOST:18789
  openclaw_hooks_token  TEXT,           -- hooks.token from openclaw.json
  created_at            TIMESTAMPTZ DEFAULT NOW()
);
```

---

## Operational Agents

### Showing Coordinator
**Type:** Heartbeat every 30 minutes
**Skills:** calendar-check, crm-write, crm-read, gmail-send, sms-send
- Checks showings in next 48 hours for confirmation status
- Sends reminders at 48hr, 24hr, 2hr intervals
- Alerts Admin Agent via `sessions_send` for unresolved issues

### Deadline Monitor
**Type:** Heartbeat every 1 hour
**Skills:** crm-write, crm-read, gmail-send
- Tracks all deadlines across active transactions
- 7 days: CRM log only | 3 days: priority alert to Admin | 1 day: urgent alert with recommended action

### Listings & Market Agent
**Type:** Cron-driven (mls-scan daily at 8am)
**Skills:** crm-write, crm-read, gmail-send, get-listings, zillow, listing-writer, cma-research, mls-monitor
- Writes MLS-ready listing descriptions (listing-writer skill)
- Builds CMAs using Zillow data (cma-research skill)
- Scans Zillow for new listings matching active buyer criteria daily (mls-monitor skill)
- Fetches active buyers from CRM via crm-read before each scan

### Admin Agent
**Channel:** Telegram (the real estate agent's command interface)
**Type:** Cron-driven morning brief (7am daily)
**Skills:** crm-write, crm-read, gmail-send
- Delivers morning briefings with pipeline summary (via crm-read `pipeline_summary`)
- Surfaces escalations from all worker agents immediately
- Delegates commands to worker agents via `sessions_send`

---

## Agent Communication

`tools.agentToAgent.enabled: true` in openclaw.json. All 5 agent IDs in the `allow` list.

```
Intake Agent       → Admin Agent  (showing booked, unreachable lead alerts)
Showing Coord      → Admin Agent  (unconfirmed showings, cancellations)
Deadline Monitor   → Admin Agent  (3-day and 1-day deadline alerts)
Listings & Market  → Admin Agent  (CMA ready, new listing matches)
Admin Agent        → ALL workers  (delegated commands from real estate agent)
```

Session key format: `agent:<agent-id>:main` | Method: `sessions_send` with `timeoutSeconds: 0`

---

## CRM Layer

**Primary CRM:** GoHighLevel (GHL) via Maton `highlevel-pit` (Private Integration Token)

Client provides their sub-account PIT via the Maton connection URL during onboarding. `ghl_pipeline_id` is fetched automatically after GHL connection goes ACTIVE.

**Pipeline Stages:** `New Lead → Qualified → Showing Scheduled → Showing Complete → Active Buyer/Seller → Under Contract → Closed`

---

## Shared Skills

Skills in `~/.openclaw/skills/` — available to all OpenClaw agents:

| Skill | Edge Function | Purpose |
|---|---|---|
| `calendar-check` | check-availability | Returns open showing slots |
| `calendar-book` | book-showing | Books a showing on Google Calendar |
| `crm-write` | crm-write | Creates contacts, updates pipeline, logs notes |
| `crm-read` | crm-read | Reads contacts, opportunities, pipeline summary |
| `gmail-send` | gmail-send | Sends templated emails from agent's Gmail |
| `sms-send` | sms-send | Sends SMS from agent's Twilio number |
| `email-check` | check-email | Polls Gmail inbox, routes new emails to OpenClaw |
| `score-lead` | score-lead | Scores qualifying answers → routing decision |
| `get-listings` | get-listings | Reads agent's Google Sheet listing inventory |
| `zillow` | — (web browsing) | Zillow domain knowledge + pricing/investing reference |

Workspace-specific skills (Listings & Market agent only):

| Skill | Purpose |
|---|---|
| `listing-writer` | MLS copy, Instagram, Facebook, email blast from property specs |
| `cma-research` | Comparable market analysis using Zillow sold comps |
| `mls-monitor` | Scans Zillow for new listings matching active buyer criteria |

---

## Client Onboarding Flow

Handled by the Sauma AI Fulfillment Agent running `onboard-client` skill.

### Required inputs (collected before onboarding)
- `CLIENT_ID`, `CLIENT_NAME`, `CLIENT_EMAIL`, `CLIENT_GMAIL`, `CLIENT_TIMEZONE`
- `CLIENT_GHL_LOCATION_ID`, `CLIENT_STATE`, `CLIENT_LISTING_SHEET_ID`
- `CLIENT_TELEGRAM_BOT_TOKEN` (from @BotFather: /newbot → copy token)
- `VPS_HOST`, `VPS_USER`, `ANTHROPIC_API_KEY`

> **Future:** VPS provisioning (buying, SSH setup, OpenClaw install) will be automated by the fulfillment agent.

### Phases

**Phase 1 — External Connections**
- Google Calendar OAuth via Maton
- Gmail OAuth via Maton
- GHL Private Integration Token via Maton
- Google Sheets OAuth via Maton
- Generate `HOOKS_SECRET_TOKEN`

**Phase 2 — Retell Setup**
- Create outbound LLM (4 tools: score_lead, check_availability, book_showing, get_listings)
- Create inbound LLM (same 4 tools, receptionist prompt)
- Select voice (default: 11labs-cleo)
- Provision Twilio number in client's state (voice+SMS enabled)
- Create SIP credentials + Elastic SIP Trunk + `sip:sip.retellai.com` origination URL
- Purchase number (SmsUrl → handle-inbound-sms edge function)
- Associate number with trunk
- Create outbound Retell agent (with `post_call_analysis_data` 12 fields, `webhook_events: ["call_analyzed"]`)
- Create inbound Retell agent (same analysis schema)
- Import number to Retell (inbound → inbound agent, outbound → outbound agent, SIP credentials)

**Phase 3 — Supabase Record**
- INSERT into clients table with all IDs and connection references

**Phase 4 — OpenClaw Deployment (Hostinger VPS)**
- Create workspace directories for all 5 agents
- Deploy shared skills (calendar-check, calendar-book, crm-write, crm-read, gmail-send, sms-send, email-check, score-lead, get-listings, zillow)
- Write SOUL.md, AGENTS.md, HEARTBEAT.md for each agent
- Register all 5 agents via CLI
- Bind admin agent to Telegram channel
- Update openclaw.json: agents, channels, hooks (4 mappings), session prefixes (hook:/sms:/email:), env, agentToAgent, hooks.token, Telegram config
- Add 4 cron jobs: morning-brief (7am), pipeline-check (noon), mls-scan (8am), email-check (every 5 min)
- Validate + restart gateway

**Phase 5 — Verify + Telegram Pairing**
- Health checks (openclaw doctor, agents list, channels, cron)
- Telegram pairing: client DMs bot → gets code → fulfillment agent approves (⚠️ expires in 1hr)

**Phase 6 — Client Activation**
Email client with 4 connection links + instructions:
1. Google Calendar OAuth
2. Gmail OAuth
3. Google Sheets OAuth (+ listing sheet column format)
4. GHL PIT URL (+ step-by-step PIT instructions)

Poll all 4 connections until ACTIVE. When GHL goes ACTIVE: fetch pipeline ID, update clients table.

**Phase 7 — Complete**
Report to CEO Agent.

---

## Agent Config Build Order

**Phase 1 — Supabase Edge Functions** ✅ Complete
score-lead, check-availability, book-showing, gmail-send, crm-write, crm-read, sms-send, get-listings, check-email, trigger-outbound-call, handle-call-ended, handle-inbound-sms

**Phase 2 — Shared OpenClaw Skills** ✅ Complete
calendar-check, calendar-book, crm-write, crm-read, gmail-send, sms-send, email-check, score-lead, get-listings, zillow, listing-writer, cma-research, mls-monitor, onboard-client

**Phase 3 — Retell LLM + Agent Creation** (via onboard-client)
Two LLMs + two agents with 4 tools, post_call_analysis_data, call_analyzed webhook, SIP trunk + Retell import

**Phase 4 — OpenClaw Agent Stack** (via onboard-client)
5 agents, Telegram for admin, 4 cron jobs, agentToAgent enabled, SMS/email session routing

**Phase 5 — Client Connections**
Google Calendar, Gmail, Google Sheets (OAuth), GHL (PIT), Telegram pairing

---

## Environment Variables & Secrets

### Supabase Secrets (set in dashboard)

| Secret | Used by |
|---|---|
| `MATON_API_KEY` | check-availability, book-showing, gmail-send, crm-write, crm-read, get-listings, check-email |
| `RETELL_API_KEY` | trigger-outbound-call |
| `TRIGGER_WEBHOOK_SECRET` | trigger-outbound-call, handle-inbound-sms (webhook auth) |
| `RETELL_WEBHOOK_SECRET` | handle-call-ended (validates Retell's call_analyzed POST) |
| `TWILIO_ACCOUNT_SID` | sms-send, handle-inbound-sms |
| `TWILIO_AUTH_TOKEN` | sms-send |

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are auto-injected into all edge functions.

### Per-Client Data (in clients table)
All Maton connection IDs, GHL location/pipeline IDs, Retell agent IDs, Twilio number, OpenClaw base URL and hooks token, listing sheet ID and connection ID.

### OpenClaw VPS Environment (per client, in openclaw.json env.vars)
`AGENT_ID`, `TZ`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `HOOKS_SECRET_TOKEN`

All sensitive credentials live in Supabase — never stored on the VPS directly.
