# Autonomous Real Estate AI System
**Built by Sauma AI**

A fully autonomous real estate AI employee system that handles every stage of an agent's workflow — from the moment a lead enters the system to closing day — without manual management of follow-ups, scheduling, deadlines, or listing content.

---

## What This Is

This repository contains everything needed to deploy a complete autonomous real estate AI system for a client. It is operated by the **Sauma AI Fulfillment Agent**, which uses the `onboard-client` skill to deploy a new client system end-to-end.

---

## System Architecture

**Platform:** OpenClaw + Retell AI + Supabase + Maton + GoHighLevel + Twilio + Telegram

**Entry Points:**
- Inbound/outbound phone calls → Retell AI voice agents
- SMS → Twilio → OpenClaw intake agent (per-lead session)
- Email → Gmail polling → OpenClaw intake agent (per-sender session)
- Web forms / Zillow → instant outbound call trigger

**The real estate agent interacts with one agent only: the Admin Agent via Telegram.**

See [`autonomous-realestate-ai.md`](./autonomous-realestate-ai.md) for the full architecture reference.

---

## Repository Structure

```
skills/
  onboard-client/       ← Master fulfillment agent skill (runs entire client deployment)
  calendar-check/       ← Shared OpenClaw skills (deployed to client VPS)
  calendar-book/
  score-lead/
  crm-write/
  crm-read/
  gmail-send/
  sms-send/
  email-check/
  get-listings/
  zillow/               ← Zillow knowledge skill + investing.md + pricing.md
  listing-writer/       ← Listings & Market workspace skills
  cma-research/
  mls-monitor/

workspace-templates/
  intake/SOUL.md        ← Agent personality files (written to client VPS during onboarding)
  showing-coordinator/SOUL.md
  deadline-monitor/SOUL.md
  listings-market/SOUL.md
  admin/SOUL.md

autonomous-realestate-ai.md   ← Full architecture reference (v3.0)
Retell LLM Creation - Fulfillment Agent Guide.md
Openclaw Docs Reference.md
Google Calendar Maton API Reference.md
Gmail Maton API Reference.md
GoHighLevel Maton API Reference.md
```

---

## Supabase Edge Functions

Deployed to project **"Autonomous Agents"** (`ydimcpjsscevgjjyrdjp`):

| Function | Purpose |
|---|---|
| `score-lead` | Scores qualifying answers → hot/warm/cold + routing |
| `check-availability` | Queries Google Calendar → open showing slots |
| `book-showing` | Creates calendar event via Maton |
| `gmail-send` | Sends templated email from agent's Gmail |
| `crm-write` | Creates/updates GHL contacts, pipeline stages, notes |
| `crm-read` | Reads GHL contacts, opportunities, pipeline summary |
| `sms-send` | Sends SMS from client's Twilio number |
| `get-listings` | Reads client's Google Sheet listing inventory |
| `check-email` | Polls Gmail inbox → routes new emails to OpenClaw |
| `trigger-outbound-call` | Fires Retell outbound call from web/Zillow webhook |
| `handle-call-ended` | Bridges Retell call_analyzed → OpenClaw |
| `handle-inbound-sms` | Routes Twilio SMS → OpenClaw with per-lead session |

---

## Required Supabase Secrets

Set these in the Supabase dashboard before any edge function works:

- `MATON_API_KEY`
- `RETELL_API_KEY`
- `TRIGGER_WEBHOOK_SECRET`
- `RETELL_WEBHOOK_SECRET`
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`

---

## Client Onboarding

The `skills/onboard-client/SKILL.md` is the master deployment script. It is run by the Sauma AI Fulfillment Agent when a new client is onboarded. It covers:

1. Creating Maton connections (Google Calendar, Gmail, Google Sheets, GHL)
2. Setting up Retell LLMs and agents (outbound + inbound, with post-call analysis)
3. Provisioning Twilio phone number + SIP trunk for Retell
4. Inserting the client record into Supabase
5. Deploying the full OpenClaw agent stack to the client's Hostinger VPS
6. Sending the client activation links and Telegram bot setup instructions
7. Monitoring all connections until ACTIVE

---

## OpenClaw Agents Per Client

| Agent | Type | Purpose |
|---|---|---|
| Intake Agent | Always-on | Handles SMS, email, and post-call follow-up |
| Showing Coordinator | Heartbeat 30m | Confirms showings, sends reminders |
| Deadline Monitor | Heartbeat 1h | Tracks transaction deadlines |
| Listings & Market | Cron daily | Listing copy, CMAs, MLS monitoring |
| Admin Agent | Cron + on-demand | Morning briefings, escalations (via Telegram) |

---

*Built by Sauma AI — [saumaai.com](https://saumaai.com)*
