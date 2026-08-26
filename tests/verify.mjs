import { test, describe } from "node:test";
import assert from "node:assert";
import { CalendarClient } from "../dist/calendar-client.js";

describe("CalendarClient instantiation", () => {
    test("creates a client with token", () => {
        const client = new CalendarClient("test-token");
        assert.ok(client);
    });

    test("exposes all expected methods", () => {
        const client = new CalendarClient("test-token");
        const methods = [
            "getCalendars", "getDefaultCalendar", "getUserProfile",
            "listEvents", "getEvent", "createEvent", "updateEvent", "deleteEvent"
        ];
        for (const m of methods) {
            assert.strictEqual(
                typeof client[m],
                "function",
                `method ${m} should be a function`
            );
        }
    });
});

describe("CalendarClient.getCalendars", () => {
    test("calls fetch with correct URL", async () => {
        let capturedUrl = null;
        const originalFetch = globalThis.fetch;
        globalThis.fetch = async (url) => {
            capturedUrl = url;
            return { json: async () => ({ result: "success", data: { calendars: [] } }) };
        };

        const client = new CalendarClient("mock-token");
        await client.getCalendars();

        assert.ok(capturedUrl, "fetch was called");
        assert.ok(capturedUrl.includes("/calendar/pim/calendar"), "URL contains calendar endpoint");

        globalThis.fetch = originalFetch;
    });
});

describe("CalendarClient.getDefaultCalendar", () => {
    test("returns first calendar from list", async () => {
        const originalFetch = globalThis.fetch;
        globalThis.fetch = async () => ({
            json: async () => ({
                result: "success",
                data: { calendars: [{ id: 1, name: "Test Calendar" }] }
            })
        });

        const client = new CalendarClient("mock-token");
        const result = await client.getDefaultCalendar();

        assert.strictEqual(result.id, 1);
        assert.strictEqual(result.name, "Test Calendar");

        globalThis.fetch = originalFetch;
    });

    test("returns calendar with default:true even when not first", async () => {
        const originalFetch = globalThis.fetch;
        globalThis.fetch = async () => ({
            json: async () => ({
                result: "success",
                data: {
                    calendars: [
                        { id: 10, name: "Not Default", default: false },
                        { id: 20, name: "Other Calendar", default: false },
                        { id: 30, name: "Real Default", default: true },
                    ]
                }
            })
        });

        const client = new CalendarClient("mock-token");
        const result = await client.getDefaultCalendar();

        assert.strictEqual(result.id, 30);
        assert.strictEqual(result.name, "Real Default");

        globalThis.fetch = originalFetch;
    });

    test("falls back to first calendar when none has default:true", async () => {
        const originalFetch = globalThis.fetch;
        globalThis.fetch = async () => ({
            json: async () => ({
                result: "success",
                data: {
                    calendars: [
                        { id: 10, name: "First", default: false },
                        { id: 20, name: "Second", default: false },
                    ]
                }
            })
        });

        const client = new CalendarClient("mock-token");
        const result = await client.getDefaultCalendar();

        assert.strictEqual(result.id, 10);

        globalThis.fetch = originalFetch;
    });
});

describe("CalendarClient.getUserProfile", () => {
    test("calls correct endpoint", async () => {
        let capturedUrl = null;
        const originalFetch = globalThis.fetch;
        globalThis.fetch = async (url) => {
            capturedUrl = url;
            return { json: async () => ({ result: "success", data: {} }) };
        };

        const client = new CalendarClient("mock-token");
        await client.getUserProfile();

        assert.ok(capturedUrl, "fetch was called");
        assert.ok(capturedUrl.includes("/profile"), "URL contains profile endpoint");

        globalThis.fetch = originalFetch;
    });
});

describe("CalendarClient.listEvents", () => {
    test("calls fetch with correct URL and parameters", async () => {
        let capturedUrl = null;
        const originalFetch = globalThis.fetch;
        globalThis.fetch = async (url) => {
            capturedUrl = url;
            return {
                ok: true,
                json: async () => ({ result: "success", data: [] })
            };
        };

        const client = new CalendarClient("mock-token");
        await client.listEvents("2025-01-01 00:00:00", "2025-01-02 00:00:00", "123");

        assert.ok(capturedUrl, "fetch was called");
        assert.ok(capturedUrl.includes("/calendar/pim/event"), "URL contains event endpoint");
        assert.ok(capturedUrl.includes("calendar_id=123"), "URL contains calendar_id");

        globalThis.fetch = originalFetch;
    });

    test("throws on non-ok response", async () => {
        const originalFetch = globalThis.fetch;
        globalThis.fetch = async () => ({
            ok: false,
            json: async () => ({ result: "error" })
        });

        const client = new CalendarClient("mock-token");
        client.getDefaultCalendar = async () => ({ id: "1" });

        await assert.rejects(
            async () => client.listEvents("2025-01-01 00:00:00", "2025-01-02 00:00:00"),
            /Something went wrong during event listing/
        );

        globalThis.fetch = originalFetch;
    });
});

describe("CalendarClient.createEvent", () => {
    test("calls correct endpoint with body", async () => {
        let capturedUrl = null;
        let capturedBody = null;
        let capturedMethod = null;
        const originalFetch = globalThis.fetch;
        globalThis.fetch = async (url, options) => {
            capturedUrl = url;
            capturedBody = options?.body;
            capturedMethod = options?.method;
            return {
                ok: true,
                text: async () => "",
                json: async () => ({ result: "success", data: { id: 42 } })
            };
        };

        // Mock getDefaultCalendar and getUserProfile
        const client = new CalendarClient("mock-token");
        client.getDefaultCalendar = async () => ({ id: "1" });
        client.getUserProfile = async () => ({
            data: {
                email: "test@example.com",
                display_name: "Test User",
                preferences: { timezone: { name: "Europe/Zurich" } }
            }
        });

        const result = await client.createEvent(
            "Test Event",
            "2025-01-01 10:00:00",
            "2025-01-01 11:00:00",
            "Test description",
            undefined,
            "1"
        );

        assert.strictEqual(result.data.id, 42);
        assert.ok(capturedUrl.includes("/calendar/pim/event"), "URL contains event endpoint");
        assert.strictEqual(capturedMethod, "POST", "Method is POST");
        const body = JSON.parse(capturedBody);
        assert.strictEqual(body.title, "Test Event");
        assert.strictEqual(body.description, "Test description");
        assert.strictEqual(body.freebusy, "busy");
        assert.strictEqual(body.type, "event");

        globalThis.fetch = originalFetch;
    });

    test("throws with invalid attendees", async () => {
        const client = new CalendarClient("mock-token");
        client.getDefaultCalendar = async () => ({ id: "1" });
        client.getUserProfile = async () => ({
            data: {
                email: "test@example.com",
                display_name: "Test User",
                preferences: { timezone: { name: "Europe/Zurich" } }
            }
        });

        await assert.rejects(
            async () => client.createEvent(
                "Test",
                "2025-01-01 10:00:00",
                "2025-01-01 11:00:00",
                undefined,
                "not-valid-json"
            ),
            /Invalid attendees/
        );
    });
});
