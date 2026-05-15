# HubSpot

Access the HubSpot CRM API with managed OAuth authentication. Create and manage contacts, notes, and deal pipelines.

## Base URL

```
https://api.maton.ai/hubspot/{native-api-path}
```

Maton proxies requests to `api.hubapi.com` and automatically injects your OAuth token.

## Authentication

```
Authorization: Bearer $MATON_API_KEY
Maton-Connection: {connection_id}
```

## Connection Management

### Create Connection
```bash
curl -s -X POST "https://api.maton.ai/connections" \
  -H "Authorization: Bearer $MATON_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"app": "hubspot"}'
```
Returns `connection_id` and `url` (OAuth authorization link). Client opens the URL and signs into HubSpot.

## Key Difference from GHL

No `locationId` or `portalId` needed in requests — the OAuth token scopes all operations to the connected HubSpot portal automatically.

## API Reference

### Contacts

**Create Contact**
```
POST /hubspot/crm/v3/objects/contacts
{
  "properties": {
    "firstname": "John",
    "lastname": "Doe",
    "email": "john@example.com",
    "phone": "+12025551234"
  }
}
```
Response includes `id` (the HubSpot contact ID).

**Update Contact**
```
PATCH /hubspot/crm/v3/objects/contacts/{contactId}
{
  "properties": { "phone": "+10987654321" }
}
```

**Search Contacts**
```
POST /hubspot/crm/v3/objects/contacts/search
{
  "filterGroups": [{
    "filters": [{
      "propertyName": "phone",
      "operator": "EQ",
      "value": "+12025551234"
    }]
  }],
  "properties": ["firstname", "lastname", "email", "phone", "real_estate_stage"],
  "limit": 1
}
```
Search operators: `EQ`, `NEQ`, `CONTAINS_TOKEN`, `GTE`, `LTE`, `HAS_PROPERTY`

**Get Contact by ID**
```
GET /hubspot/crm/v3/objects/contacts/{contactId}?properties=firstname,lastname,email,phone,real_estate_stage
```

### Custom Properties

**Create Custom Contact Property**
```
POST /hubspot/crm/v3/properties/contacts
{
  "name": "real_estate_stage",
  "label": "Real Estate Stage",
  "type": "enumeration",
  "fieldType": "select",
  "groupName": "contactinformation",
  "options": [
    { "label": "New Lead", "value": "new_lead", "displayOrder": 0 },
    { "label": "Qualified", "value": "qualified", "displayOrder": 1 },
    { "label": "Showing Scheduled", "value": "showing_scheduled", "displayOrder": 2 },
    { "label": "Showing Complete", "value": "showing_complete", "displayOrder": 3 },
    { "label": "Active Buyer/Seller", "value": "active_buyer", "displayOrder": 4 },
    { "label": "Under Contract", "value": "under_contract", "displayOrder": 5 },
    { "label": "Closed", "value": "closed", "displayOrder": 6 },
    { "label": "Drip", "value": "drip", "displayOrder": 7 }
  ]
}
```
Run once per HubSpot portal during onboarding. The `real_estate_stage` property is how the system tracks pipeline stage without needing a deal pipeline.

### Notes

**Create Note**
```
POST /hubspot/crm/v3/objects/notes
{
  "properties": {
    "hs_note_body": "Note content here",
    "hs_timestamp": "1715000000000"   ← Unix milliseconds as string
  }
}
```
Response includes `id` (note ID). Must be associated with a contact separately.

**Associate Note with Contact**
```
PUT /hubspot/crm/v3/objects/notes/{noteId}/associations/contacts/{contactId}/note_to_contact
```
No body required.

**Get Notes for a Contact**
```
GET /hubspot/crm/v3/objects/notes?associations=contacts&contactId={contactId}&properties=hs_note_body,hs_timestamp&limit=10
```

## Error Handling

| Status | Meaning |
|---|---|
| 400 | Missing HubSpot connection or bad request |
| 401 | Invalid or missing Maton API key |
| 404 | Object not found |
| 429 | Rate limited |
| 4xx/5xx | Passthrough from HubSpot API |

## Notes

- HubSpot Free CRM supports unlimited contacts and custom properties
- All contacts belong to the connected portal — no location scoping needed
- Notes must be created and then associated in a second API call
- The `real_estate_stage` custom property replaces GHL's deal pipeline stages
