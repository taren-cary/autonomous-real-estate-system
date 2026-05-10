# How the Fulfillment Agent Creates the Retell LLM

## Overview

The fulfillment agent makes **two POSTs** to Retell's `create-retell-llm` endpoint — one for the outbound agent (calls leads proactively) and one for the inbound agent (answers calls from the number). Both share the same 4 tools and the same voice, but have different `begin_message` and `general_prompt`. Retell's `import-phone-number` endpoint then binds each to the correct call direction on the same Twilio number.

The `general_tools` array below contains the 4 voice-call tools. CRM writes, confirmation emails, and follow-up texts are all handled post-call by the OpenClaw intake agent via the `handle-call-ended` edge function — not by Retell during the call.

---

## The `create-retell-llm` Payload (what the fulfillment agent POSTs)

```json
POST https://api.retellai.com/create-retell-llm
Authorization: Bearer <RETELL_API_KEY>

{
  "model": "gpt-4.1-mini",
  "start_speaker": "agent",
  "begin_message": "Hi {{lead_name}}, this is {{agent_name}} — I'm reaching out because you recently expressed interest in {{property_interest}}. Is now a good time to chat for just a few minutes?",
  "model_temperature": 0,

  "default_dynamic_variables": {
    "agent_id": "client-xyz",
    "agent_name": "Sarah Johnson",
    "company_name": "Johnson Realty Group",
    "lead_name": "",
    "lead_source": "web",
    "property_interest": "real estate"
  },

  "general_prompt": "You are an outbound intake agent calling leads on behalf of {{agent_name}}. The lead expressed interest in {{property_interest}} from {{lead_source}}. Qualify them by asking these 6 questions one at a time — never ask more than one per turn: (1) Are you looking to buy or sell? (2) What is your timeline — how soon are you looking to make a move? (3) What is your budget range? (4) Have you been pre-approved for financing? (5) What areas or neighborhoods are you most interested in? (6) Are you currently working with another agent? After all 6 answers are collected, call score_lead. If routing is book_showing, call check_availability then book_showing. After a confirmed booking, call gmail_send with template showing_confirmation if the lead provided an email. Always pass agent_id as {{agent_id}} in every tool call. Never mention being an AI unless directly asked.",

  "general_tools": [

    {
      "type": "custom",
      "name": "score_lead",
      "description": "Score the lead after collecting all qualifying answers. Call this once all 6 qualifying questions have been answered.",
      "url": "https://ydimcpjsscevgjjyrdjp.supabase.co/functions/v1/score-lead",
      "method": "POST",
      "headers": {
        "Authorization": "Bearer <SUPABASE_ANON_KEY>",
        "Content-Type": "application/json"
      },
      "parameters": {
        "type": "object",
        "properties": {
          "agent_id": {
            "type": "string",
            "description": "The agent's unique identifier. Always use the value: {{agent_id}}"
          },
          "answers": {
            "type": "object",
            "properties": {
              "intent": {
                "type": "string",
                "description": "Whether the lead wants to buy or sell. Use 'buy' or 'sell'."
              },
              "timeline": {
                "type": "string",
                "description": "The lead's stated timeline, e.g. '1-3 months', 'immediately', '6-12 months'"
              },
              "budget": {
                "type": "string",
                "description": "The lead's budget range, e.g. '400000-500000'. Use 'unknown' if not provided."
              },
              "pre_approved": {
                "type": "boolean",
                "description": "Whether the lead has been pre-approved for financing"
              },
              "areas": {
                "type": "array",
                "items": { "type": "string" },
                "description": "List of target neighborhoods or areas the lead mentioned"
              },
              "working_with_agent": {
                "type": "boolean",
                "description": "Whether the lead is currently working with another real estate agent"
              }
            },
            "required": ["intent", "timeline", "budget", "pre_approved", "areas", "working_with_agent"]
          }
        },
        "required": ["agent_id", "answers"]
      },
      "speak_during_execution": true,
      "execution_message_description": "Let me pull up some information based on what you've shared.",
      "execution_message_type": "prompt",
      "timeout_ms": 8000
    },

    {
      "type": "custom",
      "name": "check_availability",
      "description": "Check the agent's Google Calendar for open 1-hour showing slots. Call this after score_lead returns routing: book_showing.",
      "url": "https://ydimcpjsscevgjjyrdjp.supabase.co/functions/v1/check-availability",
      "method": "POST",
      "headers": {
        "Authorization": "Bearer <SUPABASE_ANON_KEY>",
        "Content-Type": "application/json"
      },
      "parameters": {
        "type": "object",
        "properties": {
          "agent_id": {
            "type": "string",
            "description": "The agent's unique identifier. Always use the value: {{agent_id}}"
          },
          "date_range": {
            "type": "object",
            "properties": {
              "start": {
                "type": "string",
                "description": "Start of the availability window in ISO 8601 UTC. Use today's date at 00:00:00Z."
              },
              "end": {
                "type": "string",
                "description": "End of the availability window in ISO 8601 UTC. Use 5 days from today at 23:59:59Z."
              }
            },
            "required": ["start", "end"]
          }
        },
        "required": ["agent_id", "date_range"]
      },
      "speak_during_execution": true,
      "execution_message_description": "Let me check the calendar for available times.",
      "execution_message_type": "prompt",
      "timeout_ms": 10000
    },

    {
      "type": "custom",
      "name": "book_showing",
      "description": "Book a 1-hour property showing on the agent's calendar. Call this only after the lead confirms a specific time from the check_availability results.",
      "url": "https://ydimcpjsscevgjjyrdjp.supabase.co/functions/v1/book-showing",
      "method": "POST",
      "headers": {
        "Authorization": "Bearer <SUPABASE_ANON_KEY>",
        "Content-Type": "application/json"
      },
      "parameters": {
        "type": "object",
        "properties": {
          "agent_id": {
            "type": "string",
            "description": "The agent's unique identifier. Always use the value: {{agent_id}}"
          },
          "datetime": {
            "type": "string",
            "description": "The confirmed showing time in ISO 8601 UTC. Must be one of the exact timestamps from check_availability available_slots."
          },
          "lead_name": {
            "type": "string",
            "description": "Full name of the lead"
          },
          "lead_phone": {
            "type": "string",
            "description": "Lead's phone number in E.164 format, e.g. +12025551234"
          },
          "lead_email": {
            "type": "string",
            "description": "Lead's email address. Omit if not provided."
          },
          "property_address": {
            "type": "string",
            "description": "Full street address of the property to be shown"
          }
        },
        "required": ["agent_id", "datetime", "lead_name", "lead_phone", "property_address"]
      },
      "speak_during_execution": true,
      "execution_message_description": "Let me get that booked for you.",
      "execution_message_type": "prompt",
      "timeout_ms": 10000
    },

    {
      "type": "custom",
      "name": "get_listings",
      "description": "Search current property listings. Call when a lead asks about available properties, specific listings, or properties matching their criteria.",
      "url": "https://ydimcpjsscevgjjyrdjp.supabase.co/functions/v1/get-listings",
      "method": "POST",
      "headers": {
        "Authorization": "Bearer <SUPABASE_ANON_KEY>",
        "Content-Type": "application/json"
      },
      "parameters": {
        "type": "object",
        "properties": {
          "agent_id": {
            "type": "string",
            "description": "The agent's unique identifier. Always use the value: {{agent_id}}"
          },
          "filters": {
            "type": "object",
            "properties": {
              "areas": {
                "type": "array",
                "items": { "type": "string" },
                "description": "Areas or neighborhoods from the lead's stated preferences"
              },
              "min_price": { "type": "number", "description": "Minimum price in dollars" },
              "max_price": { "type": "number", "description": "Maximum price in dollars" },
              "bedrooms": { "type": "number", "description": "Minimum number of bedrooms" },
              "status": { "type": "string", "description": "Listing status filter. Omit to default to Active only." }
            }
          }
        },
        "required": ["agent_id"]
      },
      "speak_during_execution": true,
      "execution_message_description": "Let me check what listings we have available.",
      "execution_message_type": "prompt",
      "timeout_ms": 10000
    }

  ]
}
```

---

---

## Inbound LLM Payload (same 4 tools, different prompt)

```json
POST https://api.retellai.com/create-retell-llm
Authorization: Bearer <RETELL_API_KEY>

{
  "model": "gpt-4.1-mini",
  "start_speaker": "agent",
  "begin_message": "Thank you for calling {{company_name}}, how can I help you today?",
  "model_temperature": 0,

  "default_dynamic_variables": {
    "agent_id": "client-xyz",
    "agent_name": "Sarah Johnson",
    "company_name": "Johnson Realty Group"
  },

  "general_prompt": "You are an inbound receptionist and intake agent for {{company_name}}. Answer calls warmly and help callers with whatever they need. If a caller expresses interest in buying or selling a property, qualify them by asking these 6 questions one at a time — never more than one per turn: (1) Are you looking to buy or sell? (2) What is your timeline — how soon are you looking to make a move? (3) What is your budget range? (4) Have you been pre-approved for financing? (5) What areas or neighborhoods are you most interested in? (6) Are you currently working with another agent? After all 6 answers are collected, call score_lead. If routing is book_showing, call check_availability then book_showing. Confirm the booking verbally before ending the call. If the caller asks general questions, answer what you can. If they ask to speak with {{agent_name}} directly, collect their name and phone number and let them know the message will be passed along. If a caller wants to cancel or reschedule a showing, respond warmly: acknowledge their request, let them know you will get that taken care of right away and they will receive a text confirmation within a few minutes, collect their preferred new time if rescheduling, then end the call — the team will handle the update and send written confirmation. Do not attempt to modify the calendar during the call. Always pass agent_id as {{agent_id}} in every tool call. Never mention being an AI unless directly asked.",

  "general_tools": [ ... same 4 tools as the outbound LLM above (score_lead, check_availability, book_showing, get_listings) ... ]
}
```

Returns `INBOUND_LLM_ID`. Then create a second Retell agent pointing at `INBOUND_LLM_ID`. Both agents use the same voice.

The `import-phone-number` call then wires them to the correct call direction:
```json
"inbound_agents":  [{ "agent_id": "RETELL_INBOUND_AGENT_ID",  "weight": 1 }],
"outbound_agents": [{ "agent_id": "RETELL_OUTBOUND_AGENT_ID", "weight": 1 }]
```

---

## How Each Field Gets Resolved

| What needs to happen | How it's handled |
|---|---|
| `agent_id` is different per client | Fulfillment agent sets `default_dynamic_variables.agent_id` at creation time. Injected into each tool's parameter description so the LLM always passes the correct value. |
| `answers` object for score_lead | LLM fills in each field from the qualifying conversation |
| `date_range.start` and `end` | LLM fills these in using today's date + 5 days. Exact instructions in parameter descriptions. |
| `datetime` for book_showing | LLM uses the exact UTC timestamp returned by check_availability. Must not be invented. |
| Lead contact details | LLM collects from the conversation and passes through |
| Supabase auth | `Authorization: Bearer <SUPABASE_ANON_KEY>` in static `headers`. Same anon key across all deployments — hardcoded by fulfillment agent at LLM creation time. |
| Which Google Calendar to use | The check-availability and book-showing Edge Functions read `maton_connection_id` from the `clients` table using `agent_id`. Retell never touches Maton directly. |
| CRM + emails + texts | Handled post-call by OpenClaw via the `handle-call-ended` edge function — not during the Retell call. |

---

## Fulfillment Agent's Inputs at Onboarding Time

When the fulfillment agent runs the `onboard-client` skill, it needs these values before calling Retell:

```
client.agent_id       → default_dynamic_variables.agent_id
client.agent_name     → default_dynamic_variables.agent_name
client.company_name   → default_dynamic_variables.company_name
RETELL_API_KEY        → Authorization header for the Retell API call
SUPABASE_ANON_KEY     → hardcoded into the headers of all four tool definitions
```

Supabase project URL for this deployment: `https://ydimcpjsscevgjjyrdjp.supabase.co`

The Maton connection IDs and GHL key are **not needed here** — they live in Supabase and are handled transparently by the Edge Functions at call time.

---

## After Creating the LLM

The fulfillment agent receives a `llm_id` in the response, then immediately calls `create-agent`:

```json
POST https://api.retellai.com/create-agent
Authorization: Bearer <RETELL_API_KEY>

{
  "llm_websocket_url": "wss://api.retellai.com/llm-websocket/<llm_id>",
  "agent_name": "{{agent_name}} - Intake",
  "voice_id": "<voice_id>",
  "phone_number": "<twilio_number>"
}
```

---

## Edge Functions Deployed (Supabase Project: Autonomous Agents)

| Function | URL | Purpose |
|---|---|---|
| `score-lead` | `.../functions/v1/score-lead` | Scores qualifying answers, returns tier + routing |
| `check-availability` | `.../functions/v1/check-availability` | Returns open 1-hour slots from Google Calendar |
| `book-showing` | `.../functions/v1/book-showing` | Creates calendar event, returns event_id |
| `gmail-send` | `.../functions/v1/gmail-send` | Sends templated email from agent's Gmail account |

Base URL: `https://ydimcpjsscevgjjyrdjp.supabase.co`

---

## The Full Autonomous Intake Chain

```
Lead calls in
  → Retell LLM asks qualifying questions one at a time
  → score_lead fires → Edge Function scores answers, returns tier + routing
  → If hot: check_availability fires → Edge Function queries Maton freeBusy → returns open slots
  → Retell presents available slots to lead
  → Lead picks a time
  → book_showing fires → Edge Function creates Google Calendar event via Maton
  → Retell confirms booking verbally with lead
  → call_analyzed webhook fires → handle-call-ended edge function → OpenClaw Intake Agent
  → OpenClaw: crm-write, gmail-send confirmation, text confirmation
```

**Inbound (lead calls the number directly):**
```
Lead dials Twilio number
  → SIP trunk → sip:sip.retellai.com → Inbound LLM (RETELL_INBOUND_AGENT_ID)
  → Opens: "Thank you for calling {{agent_name}} Real Estate, how can I help you today?"
  → Handles general questions, qualifies if lead expresses buying/selling intent
  → score_lead → check_availability → book_showing (same 3 tools)
  → call_analyzed webhook fires → handle-call-ended edge function → OpenClaw Intake Agent
  → OpenClaw: crm-write, gmail-send confirmation, text follow-up
```

No manual steps. No credentials exposed to Retell.
