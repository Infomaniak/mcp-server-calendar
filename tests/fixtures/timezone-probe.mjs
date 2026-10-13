// Runs a probe against the built client under a fixed TZ (set by the parent test process).
// Prints one line: PROBE_RESULT <json> so the parent can assert on captured API payloads.
import { CalendarClient } from "../../dist/calendar-client.js";

const calls = { createBodies: [], listUrls: [], updateBodies: [] };
const originalFetch = globalThis.fetch;
globalThis.fetch = async (url, options) => {
    const u = String(url);
    if (options?.method === "POST" && u.includes("/calendar/pim/event")) {
        calls.createBodies.push(JSON.parse(options.body));
        return { ok: true, text: async () => "", json: async () => ({ result: "success", data: { id: 1 } }) };
    }
    if (options?.method === "PUT" && u.includes("/calendar/pim/event/")) {
        calls.updateBodies.push(JSON.parse(options.body));
        return { ok: true, text: async () => "", json: async () => ({ result: "success", data: {} }) };
    }
    if (/\/calendar\/pim\/event\/\d+$/.test(u)) {
        return {
            ok: true,
            json: async () => ({
                result: "success",
                data: { id: 1, calendar_id: 1, title: "Existing", start: "2026-02-01T09:00:00+01:00", end: "2026-02-01T09:30:00+01:00", timezone_start: "Europe/Zurich", timezone_end: "Europe/Zurich", attendees: [] },
            }),
        };
    }
    if (u.includes("/calendar/pim/event?")) {
        calls.listUrls.push(u);
        return { ok: true, json: async () => ({ result: "success", data: [] }) };
    }
    if (u.includes("/profile")) {
        const preferences = process.env.PROBE_NO_PROFILE_TZ
            ? {}
            : { timezone: { name: "Europe/Zurich" } };
        return {
            json: async () => ({
                result: "success",
                data: {
                    email: "a@b.c",
                    display_name: "A",
                    preferences,
                },
            }),
        };
    }
    return { json: async () => ({ result: "success", data: { calendars: [{ id: 1, default: true }] } }) };
};

const client = new CalendarClient("mock-token");

await client.createEvent("Summer", "2026-10-20 09:00:00", "2026-10-20 10:00:00");
await client.createEvent("Winter", "2026-01-20 09:00:00", "2026-01-20 10:00:00");
await client.createEvent("OffsetZ", "2026-10-20T09:00:00Z", "2026-10-20T10:00:00Z");
await client.createEvent("OffsetExplicit", "2026-01-20T09:00:00+01:00", "2026-01-20T10:00:00+01:00");
await client.createEvent("DateOnly", "2026-10-20", "2026-10-21");
await client.listEvents("2026-10-20 09:00:00", "2026-10-20 10:00:00");
await client.updateEvent("1", undefined, "2026-02-01T09:00:00Z", undefined);

globalThis.fetch = originalFetch;
console.log("PROBE_RESULT " + JSON.stringify(calls));
