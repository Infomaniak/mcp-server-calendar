#!/usr/bin/env node

import {McpServer} from "@modelcontextprotocol/sdk/server/mcp.js";
import {z} from "zod";
import {StdioServerTransport} from "@modelcontextprotocol/sdk/server/stdio.js";
import {CalendarClient} from "./calendar-client.js";
import {createRequire} from "node:module";

const require = createRequire(import.meta.url);
const {version} = require("../package.json") as {version: string};

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
        version,
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
    "calendar_list_todos",
    "List Infomaniak calendar tasks (to-dos) of a calendar, including their done state",
    {
        calendar_id: z.string().describe("Calendar ID (optional, uses default if not provided)").optional(),
    },
    async ({calendar_id}) => {
        const response = await calendarClient.listTodos(calendar_id);

        return {
            content: [{type: "text", text: JSON.stringify(response.data)}],
        };
    }
);

server.tool(
    "calendar_get_event",
    "Get a single Infomaniak calendar event by ID",
    {
        event_id: z.string().describe("The ID of the event to retrieve"),
    },
    async ({event_id}) => {
        const response = await calendarClient.getEvent(event_id);

        return {
            content: [{type: "text", text: JSON.stringify(response.data)}],
        };
    }
);

server.tool(
    "calendar_create_event",
    "Create a new Infomaniak calendar event or task (to-do). Events require start/end; tasks (type=todo) use due_date instead",
    {
        title: z.string().describe("Event or task title"),
        start: z.string().describe("Event start time (Date time string). Required for events, ignored for tasks").optional(),
        end: z.string().describe("Event end time (Date time string). Required for events, ignored for tasks").optional(),
        type: z.enum(["event", "todo"]).describe('Object type. "event" (default) or "todo" to create a task. The type cannot be changed afterwards.').optional(),
        due_date: z.string().describe('Task due date "YYYY-MM-DD" or "YYYY-MM-DD HH:mm:ss" (tasks only)').optional(),
        priority: z.number().int().min(0).max(10).describe("Task priority 0-10, 0 = none (tasks only)").optional(),
        progress: z.number().int().min(0).max(100).describe("Task progression in percent (tasks only)").optional(),
        description: z.string().describe("Description (events and tasks)").optional(),
        attendees: z.string().describe("List of attendee email addresses as a JSON array (events only, ignored for tasks). The organizer is added as accepted alongside them").optional(),
        rrule: z.string().describe("Recurrence rule in RFC 5545 format, e.g. FREQ=WEEKLY;INTERVAL=1;BYDAY=MO or FREQ=DAILY or FREQ=MONTHLY;BYMONTHDAY=15. Use empty string to remove recurrence. (events only, ignored for tasks)").optional(),
        calendar_id: z.string().describe("Calendar ID (events and tasks; optional, uses default if not provided)").optional(),
    },
    async ({title, start, end, description, attendees, rrule, calendar_id, type, due_date, priority, progress}) => {
        const response = await calendarClient.createEvent(title, start, end, description, attendees, rrule, calendar_id, type, due_date, priority, progress);

        return {
            content: [{type: "text", text: JSON.stringify(response.data)}],
        };
    }
);

server.tool(
    "calendar_update_event",
    "Update an existing Infomaniak calendar event or task (to-do). The object's own type decides the behavior and cannot be changed: tasks accept title/description/due_date/priority/progress/done, events accept title/start/end/description/attendees/rrule. Use type to fail fast if the object is not the expected kind",
    {
        event_id: z.string().describe("The ID of the event or task to update"),
        title: z.string().describe("New title (events and tasks)").optional(),
        start: z.string().describe("New start time (Date time string) (events only, ignored for tasks)").optional(),
        end: z.string().describe("New end time (Date time string) (events only, ignored for tasks)").optional(),
        type: z.enum(["event", "todo"]).describe('Optional safety guard: fails with a clear error if the object to update is not of this type ("event" or "todo")').optional(),
        due_date: z.string().describe('Task due date "YYYY-MM-DD" or "YYYY-MM-DD HH:mm:ss" (tasks only)').optional(),
        priority: z.number().int().min(0).max(10).describe("Task priority 0-10, 0 = none (tasks only)").optional(),
        description: z.string().describe("New description (events and tasks)").optional(),
        done: z.boolean().describe("Mark the task done (true) or reopen it (false) (tasks only, ignored for events)").optional(),
        progress: z.number().int().min(0).max(100).describe("Task progression in percent (tasks only)").optional(),
        attendees: z.string().describe("List of attendee email addresses as a JSON array, replaces the event attendees (events only, ignored for tasks)").optional(),
        rrule: z.string().describe("Recurrence rule in RFC 5545 format, e.g. FREQ=WEEKLY;INTERVAL=1;BYDAY=MO or FREQ=DAILY or FREQ=MONTHLY;BYMONTHDAY=15. Use empty string to remove recurrence. (events only, ignored for tasks)").optional(),
        calendar_id: z.string().describe("Move the event or task to this calendar (events and tasks; defaults to the object's calendar if not provided)").optional(),
        notify_attendees: z.boolean().describe("Send the updated invitation to attendees via email (imip) (events only). Defaults to false.").optional(),
    },
    async ({event_id, title, start, end, description, attendees, rrule, calendar_id, notify_attendees, done, progress, type, due_date, priority}) => {
        const response = await calendarClient.updateEvent(event_id, title, start, end, description, attendees, rrule, calendar_id, notify_attendees, done, progress, type, due_date, priority);

        return {
            content: [{type: "text", text: JSON.stringify(response.data)}],
        };
    }
);

server.tool(
    "calendar_delete_event",
    "Delete an Infomaniak calendar event",
    {
        event_id: z.string().describe("The ID of the event to delete"),
        calendar_id: z.string().describe("Calendar ID (optional, uses default if not provided)").optional(),
        notify_attendees: z.boolean().describe("Send a cancellation to attendees via email (imip). Defaults to false.").optional(),
    },
    async ({event_id, calendar_id, notify_attendees}) => {
        const response = await calendarClient.deleteEvent(event_id, calendar_id, notify_attendees);

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
