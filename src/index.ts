#!/usr/bin/env node

import {McpServer} from "@modelcontextprotocol/sdk/server/mcp.js";
import {z} from "zod";
import {StdioServerTransport} from "@modelcontextprotocol/sdk/server/stdio.js";

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
        version: "0.0.5",
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

const parseDate = function (date: Date) {
    return date.toISOString()
        .replace("T", " ")
        .replace("Z", "")
        .slice(0, -4);
}

class CalendarClient {
    private readonly headers: { Authorization: string; "Content-Type": string };

    constructor() {
        this.headers = {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
        };
    }

    async listEvents(from: string, to: string): Promise<any> {
        const calendar = await this.getDefaultCalendar();

        const params = new URLSearchParams({
            calendar_id: calendar.id,
            from: parseDate(new Date(from)),
            to: parseDate(new Date(to)),
        });

        const response = await fetch(
            `https://api.infomaniak.com/1/calendar/pim/event?${params}`,
            {headers: this.headers},
        );

        if (!response.ok) {
            throw new Error('Something went wrong during event listing');
        }

        return response.json();
    }

    async getCalendars(): Promise<any> {
        const response = await fetch(
            `https://api.infomaniak.com/1/calendar/pim/calendar`,
            {
                headers: this.headers,
            }
        );

        return response.json();
    }

    async getDefaultCalendar(): Promise<any> {
        const calendars = await this.getCalendars();

        return calendars.data.calendars[0];
    }

    async getUserProfile(): Promise<any> {
        const response = await fetch(
            `https://api.infomaniak.com/2/profile`,
            {
                headers: this.headers,
            }
        );

        return response.json();
    }

    async createEvent(title: string, start: string, end: string, description: string | undefined, attendees: string | undefined): Promise<any> {
        const calendar = await this.getDefaultCalendar();
        const profile = await this.getUserProfile();
        let calendarAttendees: {
            address: any;
            className: string;
            name: any;
            organizer: boolean;
            state: string;
        }[] = [];

        if (attendees) {
            try {
                calendarAttendees = JSON.parse(attendees).map((attendee: any) => ({
                    address: attendee,
                    className: "Attendee",
                    name: attendee,
                    organizer: false,
                    state: "NEEDS-ACTION",
                }));

                calendarAttendees.push({
                    address: profile.data.email,
                    className: "Attendee",
                    name: profile.data.display_name,
                    organizer: true,
                    state: "ACCEPTED",
                })
            } catch (error) {
                throw new Error('Invalid attendees, JSON array of email address is expected');
            }
        }

        const response = await fetch(
            `https://api.infomaniak.com/1/calendar/pim/event`,
            {
                headers: this.headers,
                method: "POST",
                body: JSON.stringify({
                    title,
                    start: parseDate(new Date(start)),
                    end: parseDate(new Date(end)),
                    description,
                    freebusy: "busy",
                    type: "event",
                    calendar_id: calendar.id,
                    fullday: false,
                    timezone_start: profile.data.preferences.timezone.name,
                    timezone_end: profile.data.preferences.timezone.name,
                    attendees: calendarAttendees
                })
            },
        );

        if (!response.ok) {
            throw new Error(`Something went wrong during event creation ${await response.text()}`);
        }

        return response.json();
    }
}

const calendarClient = new CalendarClient();

server.tool(
    "calendar_list_events",
    "List Infomaniak calendar events within a specified time range",
    {
        from: z.string().describe("Start time (Date time string)"),
        to: z.string().describe("End time (Date time string)")
    },
    async ({from, to}) => {
        const response = await calendarClient.listEvents(from, to);

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
    },
    async ({title, start, end, description, attendees}) => {
        const response = await calendarClient.createEvent(title, start, end, description, attendees);

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
