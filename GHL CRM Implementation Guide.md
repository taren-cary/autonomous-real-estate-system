# GoHighLevel (GHL) CRM — Implementation Guide

**Use this guide when:** A client already pays for GoHighLevel ($97/month) and wants to use it as their CRM instead of the default HubSpot Free integration.

The default system uses HubSpot. This guide documents every change needed to switch a specific client deployment to GoHighLevel.

---

## What's Different from HubSpot

| | HubSpot (default) | GoHighLevel |
|---|---|---|
| Cost | Free | $97/month |
| Auth | OAuth (click + sign in) | Private Integration Token (manual) |
| Maton app name | `hubspot` | `highlevel-pit` |
| Connection | `hubspot_connection_id` | `ghl_connection_id` |
| Location required | No | Yes — `ghl_location_id` |
| Pipeline required | No (uses contact property) | Yes — `ghl_pipeline_id` |
| Notes | Notes associated to contact | Notes endpoint on contact |

---

## clients table columns needed

```sql
-- GHL clients need these columns (run in Supabase dashboard)
ALTER TABLE clients ADD COLUMN IF NOT EXISTS ghl_connection_id TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS ghl_location_id TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS ghl_pipeline_id TEXT;
```

---

## Phase 1 Changes — Create GHL Maton Connection

Replace the HubSpot connection block with this:

```bash
GHL_RESP=$(curl -s -X POST "https://api.maton.ai/connections" \
  -H "Authorization: Bearer $MATON_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"app": "highlevel-pit"}')

GHL_CONNECTION_ID=$(echo $GHL_RESP | jq -r '.connection.connection_id')
GHL_CONNECTION_URL=$(echo $GHL_RESP | jq -r '.connection.url')
```

Note: `CLIENT_GHL_LOCATION_ID` must be in the client intake form (the GHL sub-account location ID, found in the GHL URL: `app.gohighlevel.com/v2/location/{ID}/...`).

---

## Phase 3 Changes — Supabase Insert

Add these fields instead of `hubspot_connection_id`:

```bash
"ghl_connection_id": "$GHL_CONNECTION_ID",
"ghl_location_id": "$CLIENT_GHL_LOCATION_ID"
```

The `ghl_pipeline_id` is fetched AFTER the GHL connection goes ACTIVE (see Phase 6 below).

---

## Phase 6 Email Changes — GHL PIT Instructions

Replace the HubSpot OAuth step with this section:

```
━━ STEP X: GoHighLevel CRM Connection ━━━━━━━━━━━━━━━━━━

This connects your AI system to your GoHighLevel account so it can
manage leads, update your pipeline, and log every interaction automatically.

Find your Private Integration Token in GoHighLevel:
   a) Log into your GoHighLevel account
   b) Click Settings (gear icon, bottom left)
   c) Click "Integrations"
   d) Under "Private Integrations", click "Private Integration Tokens"
   e) Click "Add New" if you don't have one — name it "Sauma AI"
   f) Copy the token

Then open this link and paste your token when prompted:
   $GHL_CONNECTION_URL
```

---

## After GHL Connection Goes ACTIVE — Fetch Pipeline ID

```bash
# Fetch the GHL pipeline and store its ID
GHL_PIPELINE_RESP=$(curl -s \
  "https://api.maton.ai/highlevel-pit/opportunities/pipelines?locationId=$CLIENT_GHL_LOCATION_ID" \
  -H "Authorization: Bearer $MATON_API_KEY" \
  -H "Maton-Connection: $GHL_CONNECTION_ID")

GHL_PIPELINE_ID=$(echo $GHL_PIPELINE_RESP | jq -r '.pipelines[0].id')

# Update Supabase clients row with pipeline ID
curl -s -X PATCH "$CLIENT_SUPABASE_URL/rest/v1/clients?agent_id=eq.$CLIENT_ID" \
  -H "Authorization: Bearer $CLIENT_SUPABASE_SERVICE_KEY" \
  -H "apikey: $CLIENT_SUPABASE_SERVICE_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"ghl_pipeline_id\": \"$GHL_PIPELINE_ID\"}"
```

If there are multiple pipelines, report the list to the CEO agent and confirm which one to use before writing to Supabase.

---

## GHL API Operations Reference

All GHL calls go through Maton with these headers:
```
Authorization: Bearer $MATON_API_KEY
Maton-Connection: {ghl_connection_id}
Content-Type: application/json
```

### Create Contact
```
POST https://api.maton.ai/highlevel-pit/contacts/
{
  "locationId": "{locationId}",
  "firstName": "John",
  "lastName": "Doe",
  "email": "john@email.com",
  "phone": "+12025551234",
  "tags": ["lead-source", "score-87"]
}
```

### Search Contact by Phone
```
GET https://api.maton.ai/highlevel-pit/contacts/?locationId={locationId}&query={phone}&limit=1
```

### Create Opportunity in Pipeline
```
POST https://api.maton.ai/highlevel-pit/opportunities/
{
  "locationId": "{locationId}",
  "pipelineId": "{pipelineId}",
  "pipelineStageId": "{stageId}",
  "name": "Lead Name — lead_source",
  "status": "open",
  "contactId": "{contactId}"
}
```

### Update Opportunity Stage
```
PUT https://api.maton.ai/highlevel-pit/opportunities/{opportunityId}
{
  "pipelineId": "{pipelineId}",
  "pipelineStageId": "{stageId}",
  "status": "open"
}
```
Note: pipelineId is required even when not changing it (per GHL API docs).

### Create Note on Contact
```
POST https://api.maton.ai/highlevel-pit/contacts/{contactId}/notes
{ "body": "Note content here" }
```

### List Contacts by Pipeline Stage
```
GET https://api.maton.ai/highlevel-pit/opportunities/search
  ?location_id={locationId}
  &pipeline_id={pipelineId}
  &pipeline_stage_id={stageId}
  &status=open
  &limit=50
```

### Pipeline Summary (count by stage)
```
GET https://api.maton.ai/highlevel-pit/opportunities/search
  ?location_id={locationId}
  &pipeline_id={pipelineId}
  &status=open
  &limit=100
```
→ aggregate results by `pipelineStageId`, map to stage names using the pipeline object.

---

## Pipeline Stage Mapping

Our stage keys map to GHL stage names (look up IDs from the pipeline object):

| Our key | GHL stage name |
|---|---|
| `new_lead` | New Lead |
| `qualified` | Qualified |
| `showing_scheduled` | Showing Scheduled |
| `showing_complete` | Showing Complete |
| `active_buyer` | Active Buyer/Seller |
| `under_contract` | Under Contract |
| `closed` | Closed |
| `crm_followup` | Qualified |
| `drip` | New Lead |

The GHL pipeline must have stages with these exact names, or the `findStageId` function in crm-write will not find a match.

---

## Required Maton API Reference

See `GoHighLevel Maton API Reference.md` in this repo for complete endpoint documentation.
