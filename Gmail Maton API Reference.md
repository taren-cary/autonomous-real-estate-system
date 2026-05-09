Gmail

Access the Gmail API with managed OAuth authentication. Read, send, and manage emails, threads, labels, and drafts.
Quick Start

# List messages
python <<'EOF'
import urllib.request, os, json
req = urllib.request.Request('https://api.maton.ai/google-mail/gmail/v1/users/me/messages?maxResults=10')
req.add_header('Authorization', f'Bearer {os.environ["MATON_API_KEY"]}')
print(json.dumps(json.load(urllib.request.urlopen(req)), indent=2))
EOF

Base URL

https://api.maton.ai/google-mail/{native-api-path}

Only the endpoints listed in the API Reference section below are supported. Maton proxies requests to gmail.googleapis.com and automatically injects your OAuth token.
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
req = urllib.request.Request('https://api.maton.ai/connections?app=google-mail&status=ACTIVE')
req.add_header('Authorization', f'Bearer {os.environ["MATON_API_KEY"]}')
print(json.dumps(json.load(urllib.request.urlopen(req)), indent=2))
EOF

Create Connection

python <<'EOF'
import urllib.request, os, json
data = json.dumps({'app': 'google-mail'}).encode()
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
    "app": "google-mail",
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

If you have multiple Gmail connections, specify which one to use with the Maton-Connection header:

python <<'EOF'
import urllib.request, os, json
req = urllib.request.Request('https://api.maton.ai/google-mail/gmail/v1/users/me/messages')
req.add_header('Authorization', f'Bearer {os.environ["MATON_API_KEY"]}')
req.add_header('Maton-Connection', '{connection_id}')
print(json.dumps(json.load(urllib.request.urlopen(req)), indent=2))
EOF

If you have multiple connections, always include this header to ensure requests go to the intended account.
Security & Permissions

    Access is scoped to messages, threads, labels, drafts, and email sending within the connected Gmail account.
    All write operations require explicit user approval. Before executing any create, update, or delete call, confirm the target resource and intended effect with the user.

API Reference
List Messages

GET /google-mail/gmail/v1/users/me/messages?maxResults=10

With query filter:

GET /google-mail/gmail/v1/users/me/messages?q=is:unread&maxResults=10

Get Message

GET /google-mail/gmail/v1/users/me/messages/{messageId}

With metadata only:

GET /google-mail/gmail/v1/users/me/messages/{messageId}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date

Send Message

POST /google-mail/gmail/v1/users/me/messages/send
Content-Type: application/json

{
  "raw": "BASE64_ENCODED_EMAIL"
}

List Labels

GET /google-mail/gmail/v1/users/me/labels

List Threads

GET /google-mail/gmail/v1/users/me/threads?maxResults=10

Get Thread

GET /google-mail/gmail/v1/users/me/threads/{threadId}

Modify Message Labels

POST /google-mail/gmail/v1/users/me/messages/{messageId}/modify
Content-Type: application/json

{
  "addLabelIds": ["STARRED"],
  "removeLabelIds": ["UNREAD"]
}

Trash Message

POST /google-mail/gmail/v1/users/me/messages/{messageId}/trash

Create Draft

POST /google-mail/gmail/v1/users/me/drafts
Content-Type: application/json

{
  "message": {
    "raw": "BASE64URL_ENCODED_EMAIL"
  }
}

Send Draft

POST /google-mail/gmail/v1/users/me/drafts/send
Content-Type: application/json

{
  "id": "{draftId}"
}

Get Profile

GET /google-mail/gmail/v1/users/me/profile

Query Operators

Use in the q parameter:

    is:unread - Unread messages
    is:starred - Starred messages
    from:email@example.com - From specific sender
    to:email@example.com - To specific recipient
    subject:keyword - Subject contains keyword
    after:2024/01/01 - After date
    before:2024/12/31 - Before date
    has:attachment - Has attachments

Code Examples
JavaScript

const response = await fetch(
  'https://api.maton.ai/google-mail/gmail/v1/users/me/messages?maxResults=10',
  {
    headers: {
      'Authorization': `Bearer ${process.env.MATON_API_KEY}`
    }
  }
);

Python

import os
import requests

response = requests.get(
    'https://api.maton.ai/google-mail/gmail/v1/users/me/messages',
    headers={'Authorization': f'Bearer {os.environ["MATON_API_KEY"]}'},
    params={'maxResults': 10, 'q': 'is:unread'}
)

Notes

    Use me as userId for the authenticated user
    Message body is base64url encoded in the raw field
    Common labels: INBOX, SENT, DRAFT, STARRED, UNREAD, TRASH
    IMPORTANT: When using curl commands, use curl -g when URLs contain brackets (fields[], sort[], records[]) to disable glob parsing
    IMPORTANT: When piping curl output to jq or other commands, environment variables like $MATON_API_KEY may not expand correctly in some shell environments. You may get "Invalid API key" errors when piping.

Error Handling
Status	Meaning
400	Missing Gmail connection
401	Invalid or missing Maton API key
429	Rate limited (10 req/sec per account)
4xx/5xx	Passthrough error from Gmail API
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

    Ensure your URL path starts with google-mail. For example:

    Correct: https://api.maton.ai/google-mail/gmail/v1/users/me/messages
    Incorrect: https://api.maton.ai/gmail/v1/users/me/messages
