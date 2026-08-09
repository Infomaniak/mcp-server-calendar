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
   - Returns: List of events

3. `calendar_create_event`
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

4. `calendar_update_event`
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
   - Returns: The updated event

5. `calendar_delete_event`
   - Delete an event from your calendar
   - Required inputs:
      - `event_id` (string): The ID of the event to delete
   - Optional inputs:
      - `calendar_id` (string): Calendar identifier (defaults to primary calendar if omitted)
   - Returns: The deleted event

## Setup

1. Create a calendar token linked to your user:
    - Visit the [API Token page](https://manager.infomaniak.com/v3/ng/accounts/token/list)
    - Choose "workspace:calendar user_info" scopes

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
