# Sauma AI — OpenClaw Scripted Deployment Reference

> **Purpose:** This document gives the Sauma AI Fulfillment Agent everything it needs to write a fully automated onboarding script that deploys a complete OpenClaw real estate agent stack for a new client on a VPS.
>
> **Built from:** Official OpenClaw CLI docs, configuration reference, skills docs, heartbeat docs, and agent routing docs.

---

## Table of Contents

1. [What the Script Must Do](#what-the-script-must-do)
2. [Prerequisites on the VPS](#prerequisites-on-the-vps)
3. [OpenClaw CLI — Core Command Reference](#openclaw-cli--core-command-reference)
4. [Directory Structure for Each Client](#directory-structure-for-each-client)
5. [openclaw.json — Full Configuration Reference](#openclawjson--full-configuration-reference)
6. [Agent Creation](#agent-creation)
7. [Channel Setup](#channel-setup)
8. [Skills — How They Work and Where They Live](#skills--how-they-work-and-where-they-live)
9. [SKILL.md File Format](#skillmd-file-format)
10. [Heartbeat Agents — Configuration](#heartbeat-agents--configuration)
11. [Cron Jobs](#cron-jobs)
12. [Hooks / Webhooks](#hooks--webhooks)
13. [Environment Variables and Secrets](#environment-variables-and-secrets)
14. [Gateway Management](#gateway-management)
15. [The Full Deployment Script Logic](#the-full-deployment-script-logic)
16. [Post-Deploy Verification Commands](#post-deploy-verification-commands)
17. [Hot-Reload vs Restart Reference](#hot-reload-vs-restart-reference)
18. [Known Gotchas](#known-gotchas)

---

## What the Script Must Do

The fulfillment agent's `onboard-client` script must deploy the following for each new client in a fully automated way:

```
For each new client, the script:

1. Creates 4 OpenClaw agent workspaces:
   - intake-agent          (handles WhatsApp, SMS, email leads)
   - showing-coordinator   (heartbeat — confirms showings)
   - deadline-monitor      (heartbeat — tracks all deadlines)
   - listings-market       (listing writer, CMA, MLS monitor)
   - admin-agent           (real estate agent's only contact point)

2. Writes AGENTS.md, SOUL.md, HEARTBEAT.md into each workspace

3. Copies shared skill files into ~/.openclaw/skills/

4. Copies agent-specific skill files into each agent's workspace/skills/

5. Writes the full openclaw.json config with:
   - All 5 agents registered
   - Correct model assignments per agent
   - Channel bindings (WhatsApp, Twilio SMS, email)
   - Heartbeat config for showing-coordinator and deadline-monitor
   - Cron config for admin-agent morning brief
   - Webhook/hooks config for inbound form/Zillow triggers
   - Environment variables

6. Restarts the gateway to apply all config

7. Verifies all agents and channels are healthy
```

---

## Prerequisites on the VPS

The following must already be installed before the script runs:

```bash
# Node.js 24 (recommended) or 22.14+
node --version

# OpenClaw installed globally
npm install -g openclaw@latest

# OpenClaw onboarded (run once manually on first VPS setup)
openclaw onboard --install-daemon

# Verify gateway is running
openclaw gateway status
```

The gateway daemon must be running as a system service before any client deployments:

```bash
openclaw gateway install    # installs as systemd/launchd service
openclaw gateway start      # starts the service
openclaw gateway status     # verify it's running
```

---

## OpenClaw CLI — Core Command Reference

### Gateway

```bash
openclaw gateway install          # install as system service
openclaw gateway uninstall        # remove system service
openclaw gateway start            # start
openclaw gateway stop             # stop
openclaw gateway restart          # restart (required after config changes that don't hot-reload)
openclaw gateway status           # current status
openclaw gateway health           # quick health check
openclaw gateway probe            # connection probe
openclaw status --deep            # deep probe — checks all channels live
```

### Agents

```bash
# List all configured agents
openclaw agents list
openclaw agents list --bindings
openclaw agents list --format json

# Add a new agent (interactive)
openclaw agents add <agent-id>

# Add a new agent (non-interactive — required for scripting)
# --workspace is required in non-interactive mode
openclaw agents add <agent-id> \
  --workspace ~/.openclaw/<client-id>/workspace-<agent-id> \
  --non-interactive

# Bind a channel to an agent
openclaw agents bind --agent <agent-id> --bind <channel>
openclaw agents bind --agent <agent-id> --bind <channel>:<account-id>

# Unbind
openclaw agents unbind --agent <agent-id> --bind <channel>:<account-id>
openclaw agents unbind --agent <agent-id> --all

# List bindings
openclaw agents bindings
openclaw agents bindings --agent <agent-id>

# Delete agent and prune workspace + state
openclaw agents delete <agent-id>

# IMPORTANT: 'main' is reserved — cannot be used as an agent id
```

### Channels

```bash
# List configured channels
openclaw channels list

# Check channel health (--probe runs live checks)
openclaw channels status
openclaw channels status --probe

# Add a channel (non-interactive mode with flags)
openclaw channels add \
  --channel whatsapp \
  --account <account-id>

openclaw channels add \
  --channel telegram \
  --account <account-id> \
  --name "Bot Name" \
  --token $TELEGRAM_BOT_TOKEN

# Remove a channel
openclaw channels remove --channel <channel> --account <account-id>

# Channel logs
openclaw channels logs
```

### Skills

```bash
# List available skills and their status
openclaw skills list
openclaw skills info <skill-name>
openclaw skills check <skill-name>

# Install a skill from ClawHub into the active workspace
openclaw skills install <clawhub-slug>

# Install via clawhub CLI (installs to ./skills in current dir)
npx clawhub@latest install <skill-slug>

# Install globally (visible to all agents)
npx clawhub@latest install <skill-slug> --global
```

### Cron

```bash
# List all cron jobs
openclaw cron list --all
openclaw cron status

# Add a cron job with cron expression
openclaw cron add \
  --name "morning-brief" \
  --cron "0 7 * * *" \
  --message "Generate morning briefing and deliver to agent"

# Add with interval (milliseconds)
openclaw cron add \
  --name "hourly-check" \
  --every 3600000 \
  --message "Check for priority items"

# Add with one-time datetime
openclaw cron add \
  --name "onboarding-check" \
  --at "2026-01-15T09:00:00Z" \
  --message "Verify client onboarding is complete"

# Run a job immediately
openclaw cron run --id <job-id>

# Enable / disable
openclaw cron enable --id <job-id>
openclaw cron disable --id <job-id>

# Remove
openclaw cron rm --id <job-id>
```

### Config

```bash
# Read a config value
openclaw config get agents.defaults.workspace
openclaw config get agents.defaults.heartbeat.every

# Set a config value
openclaw config set agents.defaults.heartbeat.every "2h"
openclaw config set channels.whatsapp.allowFrom '[]'

# Unset
openclaw config unset <key>

# Validate current config
openclaw config validate

# Run interactive config wizard
openclaw configure
```

### Doctor / Health

```bash
# Run health checks
openclaw doctor

# Auto-fix common issues (creates backup before changes)
openclaw doctor --fix

# Non-interactive fix
openclaw doctor --fix --non-interactive

# Deep system scan
openclaw doctor --deep
```

### Sessions and Messaging

```bash
# List sessions
openclaw sessions

# Send a message to a session
openclaw message agent --session "session-key" --message "Your message"

# Memory
openclaw memory status
openclaw memory index --all
openclaw memory search --query "showing confirmation"
```

---

## Directory Structure for Each Client

Each client gets their own isolated directory tree. Use `<client-id>` as a unique slug per client (e.g., `sarah-johnson-realty`).

```
~/.openclaw/
├── openclaw.json                          ← main config (append per client)
├── skills/                                ← shared skills (all agents)
│   ├── calendar-check/
│   │   └── SKILL.md
│   ├── calendar-book/
│   │   └── SKILL.md
│   ├── crm-write/
│   │   └── SKILL.md
│   ├── gmail-send/
│   │   └── SKILL.md
│   └── score-lead/
│       └── SKILL.md
│
└── <client-id>/
    ├── workspace-intake/
    │   ├── AGENTS.md
    │   ├── SOUL.md
    │   └── skills/                        ← intake-specific skills (none extra needed)
    │
    ├── workspace-showing-coordinator/
    │   ├── AGENTS.md
    │   ├── SOUL.md
    │   ├── HEARTBEAT.md
    │   └── skills/
    │
    ├── workspace-deadline-monitor/
    │   ├── AGENTS.md
    │   ├── SOUL.md
    │   ├── HEARTBEAT.md
    │   └── skills/
    │
    ├── workspace-listings-market/
    │   ├── AGENTS.md
    │   ├── SOUL.md
    │   └── skills/
    │       ├── listing-writer/
    │       │   └── SKILL.md
    │       ├── cma-research/
    │       │   └── SKILL.md
    │       └── mls-monitor/
    │           └── SKILL.md
    │
    └── workspace-admin/
        ├── AGENTS.md
        ├── SOUL.md
        └── skills/
```

---

## openclaw.json — Full Configuration Reference

The config file lives at `~/.openclaw/openclaw.json`. It is JSON5 (comments allowed). The gateway watches this file and hot-applies most changes automatically.

### Full Example Config for One Client Deployment

```json5
{
  // Gateway settings
  gateway: {
    port: 18789,
    bind: "127.0.0.1",      // NEVER change to 0.0.0.0 on a public VPS
    auth: {
      token: "${OPENCLAW_GATEWAY_TOKEN}"
    },
    reload: {
      mode: "hybrid",        // hot-applies safe changes; restarts for critical ones
      debounceMs: 300
    },
    channelHealthCheckMinutes: 5,
    channelStaleEventThresholdMinutes: 30,
    channelMaxRestartsPerHour: 10
  },

  // Cron global settings
  cron: {
    enabled: true,
    maxConcurrentRuns: 2,
    sessionRetention: "24h",
    runLog: {
      maxBytes: "2mb",
      keepLines: 2000
    }
  },

  // Webhook/hooks config (for inbound form/Zillow triggers)
  hooks: {
    enabled: true,
    token: "${HOOKS_SECRET_TOKEN}",
    path: "/hooks",
    defaultSessionKey: "hook:ingress",
    allowRequestSessionKey: false,
    allowedSessionKeyPrefixes: ["hook:"],
    mappings: [
      {
        // Zillow/web form submission → route to intake agent
        match: { path: "lead-intake" },
        action: "agent",
        agentId: "intake-agent-<client-id>",
        deliver: true
      }
    ]
  },

  // Agent defaults + all agents list
  agents: {
    defaults: {
      model: {
        primary: "anthropic/claude-sonnet-4-6",
        fallbacks: ["openai/gpt-4.1"]
      },
      sandbox: {
        mode: "non-main",    // subagents and cron run in isolated containers
        scope: "agent"
      }
    },
    list: [
      // ── INTAKE AGENT ──────────────────────────────────────────────
      {
        id: "intake-agent-<client-id>",
        workspace: "~/.openclaw/<client-id>/workspace-intake",
        model: {
          primary: "anthropic/claude-sonnet-4-6"
        },
        skills: [
          "calendar-check",
          "calendar-book",
          "crm-write",
          "gmail-send",
          "score-lead"
        ]
      },

      // ── SHOWING COORDINATOR ───────────────────────────────────────
      {
        id: "showing-coordinator-<client-id>",
        workspace: "~/.openclaw/<client-id>/workspace-showing-coordinator",
        model: {
          primary: "anthropic/claude-haiku-4-5-20251001"   // cheaper model for heartbeat
        },
        heartbeat: {
          every: "30m",                                     // check every 30 minutes
          target: "whatsapp",                               // report to admin via whatsapp
          to: "${CLIENT_WHATSAPP_NUMBER}",
          accountId: "whatsapp-<client-id>"
        },
        skills: [
          "calendar-check",
          "crm-write",
          "gmail-send"
        ]
      },

      // ── DEADLINE MONITOR ──────────────────────────────────────────
      {
        id: "deadline-monitor-<client-id>",
        workspace: "~/.openclaw/<client-id>/workspace-deadline-monitor",
        model: {
          primary: "anthropic/claude-haiku-4-5-20251001"
        },
        heartbeat: {
          every: "1h",                                      // check every hour
          target: "whatsapp",
          to: "${CLIENT_WHATSAPP_NUMBER}",
          accountId: "whatsapp-<client-id>"
        },
        skills: [
          "crm-write",
          "gmail-send"
        ]
      },

      // ── LISTINGS & MARKET AGENT ───────────────────────────────────
      {
        id: "listings-market-<client-id>",
        workspace: "~/.openclaw/<client-id>/workspace-listings-market",
        model: {
          primary: "anthropic/claude-sonnet-4-6"
        },
        skills: [
          "crm-write",
          "gmail-send",
          "listing-writer",
          "cma-research",
          "mls-monitor"
        ]
      },

      // ── ADMIN AGENT ───────────────────────────────────────────────
      {
        id: "admin-agent-<client-id>",
        workspace: "~/.openclaw/<client-id>/workspace-admin",
        model: {
          primary: "anthropic/claude-opus-4-6"             // highest quality for client-facing
        },
        heartbeat: {
          every: "0"                                        // disabled — admin uses cron instead
        },
        skills: [
          "crm-write",
          "gmail-send"
        ]
      }
    ]
  },

  // Channel configuration
  channels: {
    whatsapp: {
      accounts: {
        "whatsapp-<client-id>": {
          // WhatsApp account config goes here
          // Set up via: openclaw channels add --channel whatsapp --account whatsapp-<client-id>
        }
      },
      allowFrom: ["${CLIENT_WHATSAPP_NUMBER}"]             // only accept from real estate agent's number
    }
  },

  // Model provider auth
  models: {
    providers: {
      anthropic: {
        type: "anthropic",
        auth: "api-key"
      }
    }
  },

  // Environment variables available to all agents
  env: {
    vars: {
      TZ: "${CLIENT_TIMEZONE}",                            // e.g. "America/New_York"
      AGENT_ID: "${CLIENT_ID}",
      SUPABASE_URL: "${SUPABASE_URL}",
      SUPABASE_ANON_KEY: "${SUPABASE_ANON_KEY}"
    },
    shellEnv: true
  }
}
```

---

## Agent Creation

### Non-Interactive Mode (Required for Scripts)

```bash
# Create workspace directory first
mkdir -p ~/.openclaw/<client-id>/workspace-<agent-id>

# Add agent in non-interactive mode
openclaw agents add intake-agent-<client-id> \
  --workspace ~/.openclaw/<client-id>/workspace-intake \
  --non-interactive

openclaw agents add showing-coordinator-<client-id> \
  --workspace ~/.openclaw/<client-id>/workspace-showing-coordinator \
  --non-interactive

openclaw agents add deadline-monitor-<client-id> \
  --workspace ~/.openclaw/<client-id>/workspace-deadline-monitor \
  --non-interactive

openclaw agents add listings-market-<client-id> \
  --workspace ~/.openclaw/<client-id>/workspace-listings-market \
  --non-interactive

openclaw agents add admin-agent-<client-id> \
  --workspace ~/.openclaw/<client-id>/workspace-admin \
  --non-interactive
```

### Binding Channels to Agents

After channels are added, bind them to the correct agents:

```bash
# Bind WhatsApp to intake agent (leads come in here)
openclaw agents bind \
  --agent intake-agent-<client-id> \
  --bind whatsapp:whatsapp-<client-id>

# Admin agent also needs WhatsApp (real estate agent talks to admin)
# Use a different WhatsApp account or Telegram for admin
openclaw agents bind \
  --agent admin-agent-<client-id> \
  --bind telegram:telegram-<client-id>
```

**Important notes on bindings:**
- Binding specs use `channel[:accountId]`. When accountId is omitted, OpenClaw may resolve account scope via channel defaults.
- One channel account can only be bound to one agent at a time
- Plan your channel accounts before scripting — intake agent and admin agent need separate accounts

---

## Skills — How They Work and Where They Live

### The Three Locations (Precedence Order)

```
1. <workspace>/skills/          ← agent-specific, HIGHEST priority
2. ~/.openclaw/skills/          ← shared across all agents on this machine
3. Bundled skills               ← shipped with OpenClaw, LOWEST priority
```

In multi-agent setups, each agent has its own workspace. Per-agent skills live in `<workspace>/skills` for that agent only. Shared skills live in `~/.openclaw/skills` (managed/local) and are visible to all agents on the same machine.

### For This System

**Shared skills** (go in `~/.openclaw/skills/`) — all agents can call these:
- `calendar-check`
- `calendar-book`
- `crm-write`
- `gmail-send`
- `score-lead`

**Agent-specific skills** (go in each agent's `workspace/skills/`):
- `listing-writer` → listings-market agent only
- `cma-research` → listings-market agent only
- `mls-monitor` → listings-market agent only

### Creating a Skill Directory

```bash
# Shared skill
mkdir -p ~/.openclaw/skills/calendar-check
touch ~/.openclaw/skills/calendar-check/SKILL.md

# Agent-specific skill
mkdir -p ~/.openclaw/<client-id>/workspace-listings-market/skills/listing-writer
touch ~/.openclaw/<client-id>/workspace-listings-market/skills/listing-writer/SKILL.md
```

---

## SKILL.md File Format

A skill starts with YAML frontmatter. The description field is injected into the system prompt on every conversation — keep it short and specific. The `metadata.openclaw.requires` object gates the skill so it only loads when its dependencies are met.

### Minimal SKILL.md Template

```markdown
---
name: skill-name
description: One-line trigger phrase. Use nouns the agent will actually encounter. Keep under 20 words.
metadata: {"openclaw": {"requires": {"env": ["REQUIRED_ENV_VAR"]}}}
---

# Skill Name

Brief description of what this skill does.

## When to use
- Condition 1
- Condition 2

## Steps

1. Step one instruction
2. Step two instruction

## Notes
- Important caveat
- Edge case handling
```

### Full SKILL.md Template with All Options

```markdown
---
name: my-skill
description: Short trigger description for the agent. Plain English. Include task nouns.
user-invocable: true
metadata: {
  "openclaw": {
    "emoji": "📅",
    "requires": {
      "bins": ["curl", "jq"],
      "env": ["SUPABASE_URL", "SUPABASE_ANON_KEY", "AGENT_ID"]
    }
  }
}
---

# My Skill

Full description here.

## When to use
- Describe triggers clearly

## Steps

1. Do this
2. Then this
3. Handle this edge case

## Example

Input: [describe what input looks like]
Output: [describe what output looks like]

## Error Handling
- If X fails, do Y
- If response is empty, do Z
```

### Token Cost Awareness

Every active skill adds tokens to your system prompt. Base overhead per skill is approximately 195 characters minimum, roughly 97 characters plus the length of all metadata fields, which is about 24 tokens per skill using standard tokenization.

Keep skill descriptions short. They are injected into the system prompt on every session.

---

## Heartbeat Agents — Configuration

Heartbeats are periodic agent check-ins. The agent wakes up on a schedule, evaluates conditions defined in `HEARTBEAT.md`, and decides whether to act or stay silent.

Use heartbeat for: inbox monitoring, memory maintenance, health checks, task tracking. Use cron for: daily briefings, weekly reports, scheduled publishing, recurring API calls at fixed times.

### Heartbeat Config in openclaw.json

```json5
{
  agents: {
    list: [
      {
        id: "showing-coordinator-<client-id>",
        heartbeat: {
          every: "30m",          // duration string — default unit is minutes
          target: "whatsapp",    // channel to report to
          to: "+12025551234",    // recipient phone/chat id
          accountId: "whatsapp-<client-id>",
          // model: "anthropic/claude-haiku-4-5-20251001"  // optional cheaper model override
        }
      }
    ]
  }
}
```

### HEARTBEAT.md File

The `HEARTBEAT.md` file lives in the agent's workspace root. It defines what to check on each heartbeat run.

If the file does not exist, heartbeats still fire but the agent has nothing to check. If the file exists but is empty, OpenClaw skips the heartbeat entirely to save API calls. The best heartbeat files are specific about what to check, include criteria for when to alert, and tell the agent what "normal" looks like so it can stay quiet.

### HEARTBEAT.md for Showing Coordinator

```markdown
# Showing Coordinator Heartbeat

## What to Check
Query the CRM for all showings scheduled in the next 48 hours.
For each showing, check if all three parties are confirmed:
- Lead (buyer/seller)
- Listing agent
- Property access arranged

## Alert Conditions (notify admin agent immediately)
- Any showing in next 24 hours with ANY unconfirmed party
- Any lead that has gone unresponsive for more than 24 hours before a scheduled showing
- Any showing that was cancelled by a party without a reschedule proposed

## What Normal Looks Like (stay silent — reply HEARTBEAT_OK)
- All showings in next 48 hours have all parties confirmed
- No unresponsive leads within 24 hours of a showing

## On Alert
Use the crm-write skill to log the issue.
Use the gmail-send skill to send a reminder to the unconfirmed party.
Report the issue to the admin agent session with the showing details and action taken.

## Quiet Hours
Between 10:00 PM and 7:00 AM in the client's timezone, only alert for
showings scheduled within the next 8 hours. Everything else waits until morning.
```

### HEARTBEAT.md for Deadline Monitor

```markdown
# Deadline Monitor Heartbeat

## What to Check
Query the CRM for all active transactions.
For each transaction, check every tracked deadline:
- Inspection contingency window
- Financing contingency deadline
- Appraisal deadline
- Repair request response window
- Closing date
- Listing expiration date

## Alert Conditions
- 7 days before any deadline: log informational notice
- 3 days before any deadline: send priority alert to admin agent
- 1 day before any deadline: send urgent alert with recommended action

## What Normal Looks Like (stay silent — reply HEARTBEAT_OK)
- No deadlines within 3 days
- All deadlines previously flagged are already acknowledged in CRM

## On Alert
Use crm-write to log the alert with timestamp.
Include recommended action in every alert message.
Report to admin agent with: deadline type, property address, days remaining, recommended action.

## Quiet Hours
Between 10:00 PM and 7:00 AM, only alert for deadlines within 24 hours.
```

---

## Cron Jobs

Cron runs scheduled tasks at exact times in isolated sessions. Used for the admin agent's morning briefing.

### Add Morning Brief Cron

```bash
# Morning brief — fires at 7:00 AM every day
openclaw cron add \
  --name "morning-brief-<client-id>" \
  --cron "0 7 * * *" \
  --message "Generate the morning briefing for the real estate agent. Include: todays showings and confirmation status, all deadlines this week with urgency level, pipeline summary (hot/warm/cold counts), any active escalations from other agents, top 3 action items for today."

# Verify it was added
openclaw cron list --all
```

### Cron Job Examples

```bash
# Weekly market report — every Monday at 8:00 AM
openclaw cron add \
  --name "weekly-market-report-<client-id>" \
  --cron "0 8 * * 1" \
  --message "Generate weekly market report for the farm area and prepare it for review"

# Pipeline health check — every day at noon
openclaw cron add \
  --name "pipeline-check-<client-id>" \
  --cron "0 12 * * *" \
  --message "Check pipeline for warm leads that have gone cold (no contact in 7+ days) and flag to admin agent"
```

### Cron Configuration in openclaw.json

```json5
{
  cron: {
    enabled: true,
    maxConcurrentRuns: 2,
    sessionRetention: "24h",
    runLog: {
      maxBytes: "2mb",
      keepLines: 2000
    }
  }
}
```

---

## Hooks / Webhooks

Hooks let external systems (Zillow forms, website forms, Retell `call_ended`) POST data directly into an agent session.

### Hook Config in openclaw.json

```json5
{
  hooks: {
    enabled: true,
    token: "${HOOKS_SECRET_TOKEN}",     // use a dedicated token — never reuse gateway token
    path: "/hooks",
    defaultSessionKey: "hook:ingress",
    allowRequestSessionKey: false,
    allowedSessionKeyPrefixes: ["hook:"],
    mappings: [
      {
        // Zillow/web form lead → intake agent
        match: { path: "lead-intake" },
        action: "agent",
        agentId: "intake-agent-<client-id>",
        deliver: true
      },
      {
        // Retell call_ended webhook → intake agent (for post-call CRM write + handoff)
        match: { path: "retell-call-ended" },
        action: "agent",
        agentId: "intake-agent-<client-id>",
        deliver: true
      }
    ]
  }
}
```

### Posting to a Hook (from Supabase Edge Function)

```bash
curl -X POST https://your-vps-ip:18789/hooks/lead-intake \
  -H "Authorization: Bearer $HOOKS_SECRET_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "lead_name": "John Smith",
    "lead_phone": "+12025551234",
    "lead_email": "john@email.com",
    "lead_source": "zillow",
    "property_interest": "123 Main St"
  }'
```

---

## Environment Variables and Secrets

### Setting API Keys for Model Providers

API keys go in `auth-profiles.json` inside each agent's workspace directory — NOT inline in `openclaw.json`.

```bash
# Path for each agent
~/.openclaw/<client-id>/workspace-<agent-id>/auth-profiles.json
```

```json
{
  "anthropic": {
    "apiKey": "sk-ant-..."
  }
}
```

**Critical:** The DeepSeek API key goes in `auth-profiles.json`, NOT in `openclaw.json` — the gateway rejects inline keys in the auth.profiles section. Same principle applies to all provider keys.

### Skills-Level Secrets

Skills can inject secrets via `skills.entries.*.env` in `openclaw.json`:

```json5
{
  skills: {
    entries: {
      "calendar-check": {
        enabled: true,
        env: {
          SUPABASE_URL: "${SUPABASE_URL}",
          SUPABASE_ANON_KEY: "${SUPABASE_ANON_KEY}",
          AGENT_ID: "${CLIENT_ID}"
        }
      }
    }
  }
}
```

### Shell Environment Variables

The `env.vars` block in `openclaw.json` injects variables into all agent turns:

```json5
{
  env: {
    vars: {
      TZ: "America/New_York",
      AGENT_ID: "sarah-johnson-realty",
      SUPABASE_URL: "https://xyz.supabase.co",
      SUPABASE_ANON_KEY: "eyJ..."
    },
    shellEnv: true   // also inherit from shell environment
  }
}
```

---

## Gateway Management

### Security Note for VPS

The gateway blocks binding beyond loopback without auth. If you're exposing it on a LAN or public IP, you need `--auth` with a token or password. For VPS hosting, never change bind to 0.0.0.0 without auth configured.

```json5
{
  gateway: {
    port: 18789,
    bind: "127.0.0.1",    // loopback only — use nginx/reverse proxy for external access
    auth: {
      token: "${OPENCLAW_GATEWAY_TOKEN}"
    }
  }
}
```

### Restart After Config Changes

Most changes hot-apply. Some require a restart:

```bash
openclaw gateway restart
```

After restart, verify everything is healthy:

```bash
openclaw doctor
openclaw channels status --probe
openclaw agents list --bindings
```

---

## The Full Deployment Script Logic

The fulfillment agent should execute steps in this exact order:

```
STEP 1 — Receive client config object
  Required inputs:
  - client_id          (slug, e.g. "sarah-johnson-realty")
  - client_name        (display name)
  - client_timezone    (e.g. "America/New_York")
  - client_whatsapp    (E.164 format phone number)
  - supabase_agent_id  (matches clients table in Supabase)
  - anthropic_api_key  (for this client's agents)

STEP 2 — Create directory structure
  mkdir -p ~/.openclaw/<client-id>/workspace-intake
  mkdir -p ~/.openclaw/<client-id>/workspace-showing-coordinator
  mkdir -p ~/.openclaw/<client-id>/workspace-deadline-monitor
  mkdir -p ~/.openclaw/<client-id>/workspace-listings-market
  mkdir -p ~/.openclaw/<client-id>/workspace-admin
  mkdir -p ~/.openclaw/<client-id>/workspace-listings-market/skills/listing-writer
  mkdir -p ~/.openclaw/<client-id>/workspace-listings-market/skills/cma-research
  mkdir -p ~/.openclaw/<client-id>/workspace-listings-market/skills/mls-monitor

STEP 3 — Copy shared skill templates into ~/.openclaw/skills/
  (Only if they don't already exist — shared skills are deployed once per VPS)
  Copy: calendar-check, calendar-book, crm-write, gmail-send, score-lead

STEP 4 — Write workspace files for each agent
  For each agent workspace, write:
  - AGENTS.md (from template, substituting client variables)
  - SOUL.md (from template)
  - HEARTBEAT.md (for showing-coordinator and deadline-monitor only)
  Agent-specific skill SKILL.md files for listings-market agent

STEP 5 — Write auth-profiles.json for each agent workspace
  Each workspace needs:
  ~/.openclaw/<client-id>/workspace-<agent>/auth-profiles.json
  with the Anthropic API key

STEP 6 — Register agents via CLI (non-interactive)
  openclaw agents add intake-agent-<client-id> --workspace ... --non-interactive
  [repeat for all 5 agents]

STEP 7 — Add channel for this client
  openclaw channels add --channel whatsapp --account whatsapp-<client-id>
  (Follow prompts or use non-interactive flags if available for WhatsApp)

STEP 8 — Bind channels to agents
  openclaw agents bind --agent intake-agent-<client-id> --bind whatsapp:whatsapp-<client-id>
  openclaw agents bind --agent admin-agent-<client-id> --bind telegram:telegram-<client-id>

STEP 9 — Update openclaw.json
  Append the new client's agents, channels, hooks, and env vars to openclaw.json
  Use openclaw config set for individual values OR write the full JSON block
  Run: openclaw config validate before proceeding

STEP 10 — Add cron jobs
  openclaw cron add --name "morning-brief-<client-id>" --cron "0 7 * * *" --message "..."
  openclaw cron add --name "pipeline-check-<client-id>" --cron "0 12 * * *" --message "..."

STEP 11 — Restart gateway
  openclaw gateway restart

STEP 12 — Verify deployment
  openclaw doctor
  openclaw agents list --bindings
  openclaw channels status --probe
  openclaw cron list --all

STEP 13 — Insert client row into Supabase clients table
  (Via Supabase client library or curl)
  INSERT into clients: agent_id, agent_name, timezone, retell_agent_id, twilio_number

STEP 14 — Create Maton connections and send OAuth URLs to client
  POST to https://api.maton.ai/connections { app: "google-calendar" }
  POST to https://api.maton.ai/connections { app: "gmail" }
  Extract connection_ids → update Supabase clients row
  Extract OAuth URLs → send to client via email

STEP 15 — Report completion to CEO agent
  "Client <client_name> onboarding complete. 5 agents deployed. 2 OAuth URLs sent to client."
```

---

## Post-Deploy Verification Commands

Run these after every deployment to confirm everything is healthy:

```bash
# Overall health
openclaw doctor

# All agents registered and bindings correct
openclaw agents list --bindings

# All channels connected and healthy
openclaw channels status --probe

# All cron jobs scheduled
openclaw cron list --all

# Gateway is running
openclaw gateway status

# Deep probe (live-tests every channel)
openclaw status --deep

# Tail logs for first 60 seconds to catch any startup errors
openclaw logs --follow
```

---

## Hot-Reload vs Restart Reference

Most config changes hot-apply without a restart. Some require a full gateway restart.

| Change Type | Hot-Reload | Requires Restart |
|---|---|---|
| Model changes | ✅ | |
| Agent config changes | ✅ | |
| Channel policies (dmPolicy, allowFrom) | ✅ | |
| Cron jobs | ✅ | |
| Heartbeat intervals | ✅ | |
| Tool config | ✅ | |
| Session settings | ✅ | |
| Gateway port/bind | | ✅ |
| Gateway auth | | ✅ |
| Plugin install/enable | | ✅ |
| New channel add | | ✅ |

When in doubt: `openclaw gateway restart` is always safe.

---

## Known Gotchas

**1. `main` is reserved**
The agent id `main` cannot be used as a custom agent id. Always use descriptive ids like `intake-agent-<client-id>`.

**2. API keys do NOT go in openclaw.json**
API keys go in `auth-profiles.json` per agent workspace. The gateway rejects inline keys in the auth.profiles section of `openclaw.json`.

**3. Empty HEARTBEAT.md skips the heartbeat**
If the HEARTBEAT.md file exists but is empty (whitespace or headers only), OpenClaw skips the heartbeat entirely to save API calls. Always include at least one instruction.

**4. Heartbeat token costs accumulate**
Every heartbeat runs a full agent turn — model inference, context loading, and potentially tool calls. The difference between full context and the optimized configuration is roughly 40x in token consumption. Use Haiku for heartbeat agents, not Opus.

**5. Config validation before every restart**
Always run `openclaw config validate` before `openclaw gateway restart`. Invalid config causes the gateway to fail to start.

**6. Skill description is a trigger phrase, not marketing copy**
The frontmatter description is closer to a trigger phrase. OpenClaw starts with name plus description to decide what's relevant, and only after that does it pull the full instructions. If your description doesn't match how people ask for the task, your skill sits there quietly.

**7. One channel account per agent binding**
One WhatsApp/Telegram account can only be bound to one agent. Plan separate accounts for intake agent vs admin agent before scripting.

**8. Gateway hard minimum context window**
The gateway has a hard 16,000 minimum contextWindow check. Models with less than 16K context are blocked.

**9. Skills are not plugins — they don't execute themselves**
A skill tells the agent how to use tools. If the underlying tool (exec, file write, network call) is blocked by sandbox policy, the skill loads but fails at runtime. Verify tool permissions match skill requirements.

**10. Workspace path must be unique per agent**
If two agents share the same workspace path, identity commands will fail and ask you to pass `--agent` explicitly. Each of the 5 agents must have its own unique workspace directory.

---

*Reference document for Sauma AI Fulfillment Agent — built from official OpenClaw documentation*
*Sources: docs.openclaw.ai, openclaw.cc/en/cli/, github.com/openclaw/openclaw*