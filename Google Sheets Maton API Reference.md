# Google Sheets

Access the Google Sheets API with managed OAuth authentication. Read and write spreadsheet data.

## Base URL

```
https://api.maton.ai/google-sheets/{native-api-path}
```

Maton proxies requests to `sheets.googleapis.com` and automatically injects your OAuth token.

## Authentication

All requests require the Maton API key in the Authorization header:

```
Authorization: Bearer $MATON_API_KEY
```

## Connection Management

### Create Connection

```bash
curl -s -X POST "https://api.maton.ai/connections" \
  -H "Authorization: Bearer $MATON_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"app": "google-sheets"}'
```

Open the returned `url` in a browser to complete OAuth authorization.

### List Active Connections

```bash
curl -s "https://api.maton.ai/connections?app=google-sheets&status=ACTIVE" \
  -H "Authorization: Bearer $MATON_API_KEY"
```

### Specifying Connection

If you have multiple Google Sheets connections, specify which one to use with the Maton-Connection header:

```bash
curl -s "https://api.maton.ai/google-sheets/v4/spreadsheets/{spreadsheetId}/values/Sheet1!A:I" \
  -H "Authorization: Bearer $MATON_API_KEY" \
  -H "Maton-Connection: {connection_id}"
```

## API Reference

### Read Values

```
GET /google-sheets/v4/spreadsheets/{spreadsheetId}/values/{range}
```

**Range format examples:**
- `Sheet1!A1:D10` — specific cells
- `Sheet1!A:I` — full columns A through I
- `Sheet1!1:10` — rows 1 through 10

**URL encoding required:** `!` → `%21`, `:` → `%3A`

**Response:**
```json
{
  "range": "Sheet1!A1:I100",
  "majorDimension": "ROWS",
  "values": [
    ["Address", "Price", "Status", "Bedrooms", "Bathrooms", "Sqft", "HOA Fee", "Top 3 Features", "School District"],
    ["123 Main St, Bethesda MD", "450000", "Active", "3", "2", "1800", "0", "Renovated kitchen, large yard, 2-car garage", "Bethesda-Chevy Chase"],
    ...
  ]
}
```

First row is headers, subsequent rows are data. Parse `values[0]` for headers, `values.slice(1)` for data rows.

### Write Values

```
PUT /google-sheets/v4/spreadsheets/{spreadsheetId}/values/{range}?valueInputOption=USER_ENTERED
Content-Type: application/json

{"values": [["A1 value", "B1 value"], ["A2 value", "B2 value"]]}
```

### Append Values

```
POST /google-sheets/v4/spreadsheets/{spreadsheetId}/values/{range}:append?valueInputOption=USER_ENTERED
Content-Type: application/json

{"values": [["new row col A", "new row col B"]]}
```

### Get Spreadsheet Metadata

```
GET /google-sheets/v4/spreadsheets/{spreadsheetId}
```

Returns sheet names, properties, and structure.

## Notes

- Use `USER_ENTERED` as `valueInputOption` to parse formulas and dates. Use `RAW` to store values exactly as provided.
- Rate limit: 10 requests/second per account
- All write operations require explicit user approval before execution
- The `get-listings` edge function reads `Sheet1!A:I` (all rows, columns A through I) — first row must be headers

## Error Handling

| Status | Meaning |
|---|---|
| 400 | Missing Google Sheets connection |
| 401 | Invalid or missing Maton API key |
| 429 | Rate limited (10 req/sec) |
| 4xx/5xx | Passthrough error from Google Sheets API |
