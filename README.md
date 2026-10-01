# Calendar MCP Server

MCP Server for the Calendar API.

## Tools

1. `calendar_list_calendars`
   - List all your available calendars
   - Returns: List of calendars (with `id` and `name`)

2. `calendar_list_events`
   - Search events in your calendar
   - Required inputs:
      - `from` (string): Start time (eg. 2025-05-28 12:00:00)
      - `to` (string): End time (eg. 2025-05-28 13:00:00)
   - Optional inputs:
      - `calendar_id` (string): Calendar identifier (defaults to primary calendar if omitted)
   - Returns: List of events. Events booking a room include `bookable_resource_name`.

3. `calendar_get_event`
   - Get a single event by ID
   - Required inputs:
      - `event_id` (string): The ID of the event to retrieve
   - Returns: The event. Includes `bookable_resource_name` when the event books a room.

4. `calendar_create_event`
   - Create a event in your calendar
   - Required inputs:
      - `title` (string): The event title
      - `start` (string): The event starting date (eg. 2025-05-28 12:00:00)
      - `end` (string): The event ending date (eg. 2025-05-28 13:00:00)
   - Optional inputs:
      - `description` (string): Event description
      - `attendees` (string): JSON array of attendee emails
      - `rrule` (string): Recurrence rule in RFC 5545 format (e.g. `FREQ=WEEKLY;INTERVAL=1;BYDAY=MO`, `FREQ=DAILY`, `FREQ=MONTHLY;BYMONTHDAY=15`)
      - `calendar_id` (string): Calendar identifier (defaults to primary calendar if omitted)
   - Returns: The created event
   - Notes: Attendees listed in `attendees` receive an actionable invitation email (accept/decline in one click).

5. `calendar_update_event`
   - Update an existing event in your calendar
   - Required inputs:
      - `event_id` (string): The ID of the event to update
   - Optional inputs:
      - `title` (string): The event title
      - `start` (string): The event starting date (eg. 2025-05-28 12:00:00)
      - `end` (string): The event ending date (eg. 2025-05-28 13:00:00)
      - `description` (string): Event description
      - `attendees` (string): JSON array of attendee emails
      - `rrule` (string): Recurrence rule in RFC 5545 format (e.g. `FREQ=WEEKLY;INTERVAL=1;BYDAY=MO`, `FREQ=DAILY`, `FREQ=MONTHLY;BYMONTHDAY=15`). Use empty string to remove recurrence.
      - `calendar_id` (string): Calendar identifier (defaults to event's calendar if omitted)
      - `notify_attendees` (boolean): Send the updated invitation to attendees via email (defaults to false)
   - Returns: The updated event

6. `calendar_delete_event`
   - Delete an event from your calendar
   - Required inputs:
      - `event_id` (string): The ID of the event to delete
   - Optional inputs:
      - `calendar_id` (string): Calendar identifier (defaults to primary calendar if omitted)
      - `notify_attendees` (boolean): Send a cancellation to attendees via email (defaults to false)
   - Returns: The deleted event

## Date & time

All date inputs are interpreted in your profile timezone (the one set in your Infomaniak account), and event times always match the wall clock you provide regardless of the machine running the server:

- `2025-05-28 12:00:00` (or `2025-05-28T12:00:00`) means 12:00 in your profile timezone
- `2025-05-28` means midnight (00:00:00) in your profile timezone
- `2025-05-28T10:00:00Z` or `2025-05-28T12:00:00+02:00` (ISO with offset) are converted to your profile timezone

No `TZ` environment variable is required.

## Setup

1. Create a calendar token linked to your user:
    - Visit the [API Token page](https://manager.infomaniak.com/v3/ng/accounts/token/list)
    - Choose "workspace:calendar user_info" scopes

### HTTP transport (default)

The server exposes the MCP Streamable HTTP transport on
`http://$MCP_HTTP_HOST:$MCP_HTTP_PORT/mcp` (default `http://127.0.0.1:4500/mcp`).
The published Docker image starts the HTTP server out of the box:

```bash
docker run --rm -p 4500:4500 \
  -e CALENDAR_TOKEN \
  infomaniak/mcp-server-calendar
```

The `MCP_HTTP_*` variables described below can be used to customise the bind
address, port, and accepted `Host`/`Origin` headers.

For stdio clients, the upstream `node dist/index.js` entry is still available
as an optional escape hatch:

```bash
docker run --rm -i \
  --entrypoint node \
  infomaniak/mcp-server-calendar \
  dist/index.js
```

### Usage with Claude Desktop

Add the following to your `claude_desktop_config.json`:

#### NPX

```json
{
  "mcpServers": {
    "calendar": {
      "command": "npx",
      "args": [
        "-y",
        "@infomaniak/mcp-server-calendar"
      ],
      "env": {
        "CALENDAR_TOKEN": "your-token"
      }
    }
  }
}
```

#### docker

```json
{
  "mcpServers": {
    "calendar": {
      "command": "docker",
      "args": [
        "run",
        "-i",
        "--rm",
        "-e",
        "CALENDAR_TOKEN",
        "infomaniak/mcp-server-calendar"
      ],
      "env": {
        "CALENDAR_TOKEN": "your-token"
      }
    }
  }
}
```

### Environment Variables

1. `CALENDAR_TOKEN`: Required. Your calendar token.
2. `MCP_HTTP_HOST`: HTTP bind address. Defaults to `127.0.0.1`. The published Docker image overrides this to `0.0.0.0` so the port is reachable from the host.
3. `MCP_HTTP_PORT`: HTTP listen port. Integer in 1..65535, default `4500`. The published Docker image exposes this port.
4. `MCP_HTTP_ALLOWED_HOSTS`: Optional comma-separated list of accepted `Host` header values. Defaults to loopback hostnames.
5. `MCP_HTTP_ALLOWED_ORIGINS`: Optional comma-separated list of accepted `Origin` header values (a trailing `*` is a suffix wildcard). Defaults to loopback origins.

### Troubleshooting

If you encounter permission errors, verify that:
1. All required scopes are added to your calendar token
2. The token is correctly copied to your configuration

## Build

Docker build:

```bash
docker build -t infomaniak/mcp-server-calendar -f Dockerfile .
```

## License

This MCP server is licensed under the MIT License.
