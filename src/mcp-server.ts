import {McpServer} from "@modelcontextprotocol/sdk/server/mcp.js";
import {z} from "zod";
import {CalendarClient} from "./calendar-client.js";
import {createRequire} from "node:module";

const require = createRequire(import.meta.url);
const {version} = require("../package.json") as {version: string};

/**
 * Builds a fully-configured {@link McpServer} for the Infomaniak calendar
 * service. The returned server exposes the same six tools (with the same
 * names, schemas, and descriptions) that upstream's stdio entry used to
 * register at module top-level.
 *
 * Extracted from upstream `src/index.ts` verbatim — only the construction
 * and `tool(...)` registrations live here, so the same factory can be
 * reused by both the stdio entry (`src/index.ts`) and the HTTP entry
 * (`src/http.ts`).
 */
export function createCalendarMcpServer(token: string): McpServer {
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
        "Create a new Infomaniak calendar event",
        {
            title: z.string().describe("Event title"),
            start: z.string().describe("Event start time (Date time string)"),
            end: z.string().describe("Event end time (Date time string)"),
            description: z.string().describe("Event description").optional(),
            attendees: z.string().describe("List of attendee email addresses as a JSON array").optional(),
            rrule: z.string().describe("Recurrence rule in RFC 5545 format, e.g. FREQ=WEEKLY;INTERVAL=1;BYDAY=MO or FREQ=DAILY or FREQ=MONTHLY;BYMONTHDAY=15. Use empty string to remove recurrence.").optional(),
            calendar_id: z.string().describe("Calendar ID (optional, uses default if not provided)").optional(),
            fullday: z.boolean().describe("All-day event. When true and no reminder_minutes_before is set, defaults to a 24h (1440 minute) reminder.").optional(),
            reminder_minutes_before: z.number().int().nonnegative().describe("Minutes before start to fire the reminder. 0 = no reminder. Omit to use the default (10 for timed events, 1440 for all-day).").optional(),
        },
        async ({title, start, end, description, attendees, rrule, calendar_id, fullday, reminder_minutes_before}) => {
            const response = await calendarClient.createEvent(title, start, end, description, attendees, rrule, calendar_id, fullday, reminder_minutes_before);

            return {
                content: [{type: "text", text: JSON.stringify(response.data)}],
            };
        }
    );

    server.tool(
        "calendar_update_event",
        "Update an existing Infomaniak calendar event",
        {
            event_id: z.string().describe("The ID of the event to update"),
            title: z.string().describe("Event title").optional(),
            start: z.string().describe("Event start time (Date time string)").optional(),
            end: z.string().describe("Event end time (Date time string)").optional(),
            description: z.string().describe("Event description").optional(),
            attendees: z.string().describe("List of attendee email addresses as a JSON array").optional(),
            rrule: z.string().describe("Recurrence rule in RFC 5545 format, e.g. FREQ=WEEKLY;INTERVAL=1;BYDAY=MO or FREQ=DAILY or FREQ=MONTHLY;BYMONTHDAY=15. Use empty string to remove recurrence.").optional(),
            calendar_id: z.string().describe("Calendar ID (optional, uses event's calendar if not provided)").optional(),
            notify_attendees: z.boolean().describe("Send the updated invitation to attendees via email (imip). Defaults to false.").optional(),
        },
        async ({event_id, title, start, end, description, attendees, rrule, calendar_id, notify_attendees}) => {
            const response = await calendarClient.updateEvent(event_id, title, start, end, description, attendees, rrule, calendar_id, notify_attendees);

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

    return server;
}
