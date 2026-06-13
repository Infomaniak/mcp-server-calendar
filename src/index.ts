#!/usr/bin/env node

import {McpServer} from "@modelcontextprotocol/sdk/server/mcp.js";
import {z} from "zod";
import {StdioServerTransport} from "@modelcontextprotocol/sdk/server/stdio.js";
import {CalendarClient} from "./calendar-client.js";

const token = process.env.CALENDAR_TOKEN;

if (!token) {
    console.error(
        "Please set CALENDAR_TOKEN environment variable",
    );
    process.exit(1);
}

const server = new McpServer(
    {
        name: "Infomaniak calendar MCP Server",
        version: "1.0.1",
    },
    {
        capabilities: {
            completions: {},
            prompts: {},
            resources: {},
            tools: {},
        },
    },
);

const calendarClient = new CalendarClient(token);

server.tool(
    "calendar_list_calendars",
    "List all available Infomaniak calendars",
    {},
    async () => {
        const response = await calendarClient.getCalendars();

        return {
            content: [{type: "text", text: JSON.stringify(response.data.calendars)}],
        };
    }
);

server.tool(
    "calendar_list_events",
    "List Infomaniak calendar events within a specified time range",
    {
        from: z.string().describe("Start time (Date time string)"),
        to: z.string().describe("End time (Date time string)"),
        calendar_id: z.string().describe("Calendar ID (optional, uses default if not provided)").optional(),
    },
    async ({from, to, calendar_id}) => {
        const response = await calendarClient.listEvents(from, to, calendar_id);

        return {
            content: [{type: "text", text: JSON.stringify(response.data)}],
        };
    }
);

server.tool(
    "calendar_create_event",
    "Create a new Infomaniak calendar event",
    {
        title: z.string().describe("Event title"),
        start: z.string().describe("Event start time (Date time string)"),
        end: z.string().describe("Event end time (Date time string)"),
        description: z.string().describe("Event description").optional(),
        attendees: z.string().describe("List of attendee email addresses as a JSON array").optional(),
        calendar_id: z.string().describe("Calendar ID (optional, uses default if not provided)").optional(),
    },
    async ({title, start, end, description, attendees, calendar_id}) => {
        const response = await calendarClient.createEvent(title, start, end, description, attendees, calendar_id);

        return {
            content: [{type: "text", text: JSON.stringify(response.data)}],
        };
    }
);

async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
}

main().catch((error) => {
    console.error("Fatal error in main():", error);
    process.exit(1);
});
