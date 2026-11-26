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

3. `calendar_list_todos`
   - List the tasks (to-dos) of a calendar, with their `done` state, `progress` (percent) and `priority`
   - Optional inputs:
      - `calendar_id` (string): Calendar identifier (defaults to primary calendar if omitted)
   - Returns: List of tasks. Tasks have no start/end; they carry `due_date`, `done`, `progress` and `priority` instead.

4. `calendar_get_event`
   - Get a single event by ID
   - Required inputs:
      - `event_id` (string): The ID of the event to retrieve
   - Returns: The event. Includes `bookable_resource_name` when the event books a room.

5. `calendar_create_event`
   - Create a event in your calendar
   - Required inputs:
      - `title` (string): The event title
      - `start` (string, events only): The event starting date (eg. 2025-05-28 12:00:00)
      - `end` (string, events only): The event ending date (eg. 2025-05-28 13:00:00)
   - Optional inputs:
      - `type` (string): `"event"` (default) or `"todo"` to create a task. Tasks have no start/end; set `due_date` instead
      - `due_date` (string, tasks only): Due date `YYYY-MM-DD` or `YYYY-MM-DD HH:mm:ss`
      - `priority` (number, tasks only): Task priority 0-10, 0 = none (default 0)
      - `progress` (number, tasks only): Task progression in percent (default 0)
      - `description` (string): Event description
      - `attendees` (string): JSON array of attendee emails. The organizer is added as accepted alongside them; an empty list creates the event without attendees
      - `rrule` (string): Recurrence rule in RFC 5545 format (e.g. `FREQ=WEEKLY;INTERVAL=1;BYDAY=MO`, `FREQ=DAILY`, `FREQ=MONTHLY;BYMONTHDAY=15`)
      - `calendar_id` (string): Calendar identifier (defaults to primary calendar if omitted)
   - Returns: The created event or task
   - Notes: Attendees listed in `attendees` receive an actionable invitation email (accept/decline in one click). Attendees and recurrence are ignored for tasks.

6. `calendar_update_event`
   - Update an existing event or task in your calendar. The object's own type decides the behavior and cannot be changed; pass `type` to fail fast if the object is not the expected kind
   - Required inputs:
      - `event_id` (string): The ID of the event or task to update
   - Optional inputs (events and tasks):
      - `title` (string): The title
      - `description` (string): The description
      - `calendar_id` (string): Move the event or task to this calendar (defaults to the object's calendar if omitted)
      - `type` (string): `"event"` or `"todo"` — fails with a clear error if it does not match the object to update
   - Optional inputs (events only, ignored for tasks):
      - `start` (string): The event starting date (eg. 2025-05-28 12:00:00)
      - `end` (string): The event ending date (eg. 2025-05-28 13:00:00)
      - `attendees` (string): JSON array of attendee emails. Replaces the event attendees, with the organizer included as accepted; an empty list removes them all
      - `rrule` (string): Recurrence rule in RFC 5545 format (e.g. `FREQ=WEEKLY;INTERVAL=1;BYDAY=MO`, `FREQ=DAILY`, `FREQ=MONTHLY;BYMONTHDAY=15`). Use empty string to remove recurrence.
      - `notify_attendees` (boolean): Send the updated invitation to attendees via email (defaults to false)
   - Optional inputs (tasks only, ignored for events):
      - `done` (boolean): true marks the task done, false reopens it
      - `progress` (number): Task progression in percent
      - `due_date` (string): Due date `YYYY-MM-DD` or `YYYY-MM-DD HH:mm:ss`
      - `priority` (number): Task priority 0-10, 0 = none
   - Returns: The updated event or task
   - Notes: Updating a task's title/description/due date/priority/calendar rewrites the task (its reminders are reset — the API does not expose them). Marking a task done/not done with `done` (optionally with `progress`) touches nothing else.

7. `calendar_delete_event`
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
