# Calendar MCP Server

MCP Server for the Calendar API.

## Tools

1. `calendar_list_events`
    - Search events in your calendar
   - Required inputs:
      - `from` (string): Start time (eg. 2025-05-28 12:00:00)
      - `to` (string): End time (eg. 2025-05-28 13:00:00)
    - Returns: List of events

2. `calendar_create_event`
   - Create a event in your calendar
   - Required inputs:
      - `title` (string): The event title
      - `start` (string): The event starting date (eg. 2025-05-28 12:00:00)
      - `end` (string): The event ending date (eg. 2025-05-28 13:00:00)
   - Returns: The created event

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
