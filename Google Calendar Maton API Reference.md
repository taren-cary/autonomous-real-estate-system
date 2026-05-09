Google Calendar

Access the Google Calendar API with managed OAuth authentication. Create and manage events, list calendars, and check availability.
Quick Start

# List upcoming events
python <<'EOF'
import urllib.request, os, json
req = urllib.request.Request('https://api.maton.ai/google-calendar/calendar/v3/calendars/primary/events?maxResults=10&orderBy=startTime&singleEvents=true')
req.add_header('Authorization', f'Bearer {os.environ["MATON_API_KEY"]}')
print(json.dumps(json.load(urllib.request.urlopen(req)), indent=2))
EOF

Base URL

https://api.maton.ai/google-calendar/{native-api-path}

Maton proxies requests to www.googleapis.com and automatically injects your OAuth token.
Authentication

All requests require the Maton API key in the Authorization header:

Authorization: Bearer $MATON_API_KEY

Environment Variable: Set your API key as MATON_API_KEY:

export MATON_API_KEY="YOUR_API_KEY"

Getting Your API Key

    Sign in or create an account at maton.ai
    Go to maton.ai/settings
    Copy your API key

Connection Management

Manage your Google OAuth connections at https://api.maton.ai.
List Connections

python <<'EOF'
import urllib.request, os, json
req = urllib.request.Request('https://api.maton.ai/connections?app=google-calendar&status=ACTIVE')
req.add_header('Authorization', f'Bearer {os.environ["MATON_API_KEY"]}')
print(json.dumps(json.load(urllib.request.urlopen(req)), indent=2))
EOF

Create Connection

python <<'EOF'
import urllib.request, os, json
data = json.dumps({'app': 'google-calendar'}).encode()
req = urllib.request.Request('https://api.maton.ai/connections', data=data, method='POST')
req.add_header('Authorization', f'Bearer {os.environ["MATON_API_KEY"]}')
req.add_header('Content-Type', 'application/json')
print(json.dumps(json.load(urllib.request.urlopen(req)), indent=2))
EOF

Get Connection

python <<'EOF'
import urllib.request, os, json
req = urllib.request.Request('https://api.maton.ai/connections/{connection_id}')
req.add_header('Authorization', f'Bearer {os.environ["MATON_API_KEY"]}')
print(json.dumps(json.load(urllib.request.urlopen(req)), indent=2))
EOF

Response:

{
  "connection": {
    "connection_id": "{connection_id}",
    "status": "ACTIVE",
    "creation_time": "2025-12-08T07:20:53.488460Z",
    "last_updated_time": "2026-01-31T20:03:32.593153Z",
    "url": "https://connect.maton.ai/?session_token=...",
    "app": "google-calendar",
    "metadata": {}
  }
}

Open the returned url in a browser to complete OAuth authorization.
Delete Connection

python <<'EOF'
import urllib.request, os, json
req = urllib.request.Request('https://api.maton.ai/connections/{connection_id}', method='DELETE')
req.add_header('Authorization', f'Bearer {os.environ["MATON_API_KEY"]}')
print(json.dumps(json.load(urllib.request.urlopen(req)), indent=2))
EOF

Specifying Connection

If you have multiple Google Calendar connections, specify which one to use with the Maton-Connection header:

python <<'EOF'
import urllib.request, os, json
req = urllib.request.Request('https://api.maton.ai/google-calendar/calendar/v3/calendars/primary/events')
req.add_header('Authorization', f'Bearer {os.environ["MATON_API_KEY"]}')
req.add_header('Maton-Connection', '{connection_id}')
print(json.dumps(json.load(urllib.request.urlopen(req)), indent=2))
EOF

If you have multiple connections, always include this header to ensure requests go to the intended account.
Security & Permissions

    Access is scoped to calendars, events, and availability within the connected Google Calendar account.
    All write operations require explicit user approval. Before executing any create, update, or delete call, confirm the target resource and intended effect with the user.

API Reference
List Calendars

GET /google-calendar/calendar/v3/users/me/calendarList

Get Calendar

GET /google-calendar/calendar/v3/calendars/{calendarId}

Use primary for the user's primary calendar.
List Events

GET /google-calendar/calendar/v3/calendars/primary/events?maxResults=10&orderBy=startTime&singleEvents=true

With time bounds:

GET /google-calendar/calendar/v3/calendars/primary/events?timeMin=2024-01-01T00:00:00Z&timeMax=2024-12-31T23:59:59Z&singleEvents=true&orderBy=startTime

Get Event

GET /google-calendar/calendar/v3/calendars/primary/events/{eventId}

Create Event

POST /google-calendar/calendar/v3/calendars/primary/events
Content-Type: application/json

{
  "summary": "Team Meeting",
  "description": "Weekly sync",
  "start": {
    "dateTime": "2024-01-15T10:00:00",
    "timeZone": "America/Los_Angeles"
  },
  "end": {
    "dateTime": "2024-01-15T11:00:00",
    "timeZone": "America/Los_Angeles"
  },
  "attendees": [
    {"email": "attendee@example.com"}
  ]
}

Create All-Day Event

POST /google-calendar/calendar/v3/calendars/primary/events
Content-Type: application/json

{
  "summary": "All Day Event",
  "start": {"date": "2024-01-15"},
  "end": {"date": "2024-01-16"}
}

Update Event

PUT /google-calendar/calendar/v3/calendars/primary/events/{eventId}
Content-Type: application/json

{
  "summary": "Updated Meeting Title",
  "start": {"dateTime": "2024-01-15T10:00:00Z"},
  "end": {"dateTime": "2024-01-15T11:00:00Z"}
}

Patch Event (partial update)

PATCH /google-calendar/calendar/v3/calendars/primary/events/{eventId}
Content-Type: application/json

{
  "summary": "New Title Only"
}

Delete Event

DELETE /google-calendar/calendar/v3/calendars/primary/events/{eventId}

Quick Add Event (natural language)

POST /google-calendar/calendar/v3/calendars/primary/events/quickAdd?text=Meeting+with+John+tomorrow+at+3pm

Free/Busy Query

POST /google-calendar/calendar/v3/freeBusy
Content-Type: application/json

{
  "timeMin": "2024-01-15T00:00:00Z",
  "timeMax": "2024-01-16T00:00:00Z",
  "items": [{"id": "primary"}]
}

Code Examples
JavaScript

// List events
const response = await fetch(
  'https://api.maton.ai/google-calendar/calendar/v3/calendars/primary/events?maxResults=10&singleEvents=true',
  {
    headers: {
      'Authorization': `Bearer ${process.env.MATON_API_KEY}`
    }
  }
);

// Create event
await fetch(
  'https://api.maton.ai/google-calendar/calendar/v3/calendars/primary/events',
  {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.MATON_API_KEY}`
    },
    body: JSON.stringify({
      summary: 'Meeting',
      start: { dateTime: '2024-01-15T10:00:00Z' },
      end: { dateTime: '2024-01-15T11:00:00Z' }
    })
  }
);

Python

import os
import requests

headers = {'Authorization': f'Bearer {os.environ["MATON_API_KEY"]}'}

# List events
events = requests.get(
    'https://api.maton.ai/google-calendar/calendar/v3/calendars/primary/events',
    headers=headers,
    params={'maxResults': 10, 'singleEvents': 'true'}
).json()

# Create event
response = requests.post(
    'https://api.maton.ai/google-calendar/calendar/v3/calendars/primary/events',
    headers=headers,
    json={
        'summary': 'Meeting',
        'start': {'dateTime': '2024-01-15T10:00:00Z'},
        'end': {'dateTime': '2024-01-15T11:00:00Z'}
    }
)

Notes

    Use primary as calendarId for the user's main calendar
    Times must be in RFC3339 format (e.g., 2024-01-15T10:00:00Z)
    For recurring events, use singleEvents=true to expand instances
    orderBy=startTime requires singleEvents=true
    IMPORTANT: When using curl commands, use curl -g when URLs contain brackets (fields[], sort[], records[]) to disable glob parsing
    IMPORTANT: When piping curl output to jq or other commands, environment variables like $MATON_API_KEY may not expand correctly in some shell environments. You may get "Invalid API key" errors when piping.

Error Handling
Status	Meaning
400	Missing Google Calendar connection
401	Invalid or missing Maton API key
429	Rate limited (10 req/sec per account)
4xx/5xx	Passthrough error from Google Calendar API
Troubleshooting: API Key Issues

    Check that the MATON_API_KEY environment variable is set:

echo $MATON_API_KEY

    Verify the API key is valid by listing connections:

python <<'EOF'
import urllib.request, os, json
req = urllib.request.Request('https://api.maton.ai/connections')
req.add_header('Authorization', f'Bearer {os.environ["MATON_API_KEY"]}')
print(json.dumps(json.load(urllib.request.urlopen(req)), indent=2))
EOF

Troubleshooting: Invalid App Name

    Ensure your URL path starts with google-calendar. For example:

    Correct: https://api.maton.ai/google-calendar/calendar/v3/calendars/primary/events
    Incorrect: https://api.maton.ai/calendar/v3/calendars/primary/events
