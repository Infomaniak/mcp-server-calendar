import { test, describe } from "node:test";
import assert from "node:assert";
import { CalendarClient } from "../dist/calendar-client.js";

const jsonResponse = (body, ok = true) => ({
    ok,
    text: async () => JSON.stringify(body),
    json: async () => body,
});

const validProfile = {
    result: "success",
    data: {email: "me@example.com", display_name: "Moi", preferences: {timezone: {name: "Europe/Paris"}}},
};

function stubFetch(handler) {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = handler;
    return () => {
        globalThis.fetch = originalFetch;
    };
}

describe("attendees with organizer profile (issue #82)", () => {
    test("createEvent adds the organizer as accepted alongside the guests", async () => {
        const postBodies = [];
        const restore = stubFetch(async (url, options) => {
            const u = String(url);
            if (options?.method === "POST" && u.includes("/calendar/pim/event")) {
                postBodies.push(JSON.parse(options.body));
                return jsonResponse({result: "success", data: {id: 1}});
            }
            if (u.includes("/profile")) {
                return jsonResponse(validProfile);
            }
            if (u.includes("/calendar/pim/contact/all")) {
                return jsonResponse({data: [{id: 7, name: "Guest", emails: ["guest@example.com"]}]});
            }
            return jsonResponse({data: {calendars: [{id: 1, default: true}]}});
        });

        try {
            const client = new CalendarClient("mock-token");
            await client.createEvent("Réunion", "2026-11-17 10:00:00", "2026-11-17 10:30:00", undefined, '["guest@example.com"]');

            const attendees = postBodies[0].attendees;
            assert.strictEqual(attendees.length, 2, "organizer is auto-added, like the web app");
            assert.deepStrictEqual(attendees.find(a => a.address === "guest@example.com"), {
                className: "Attendee",
                contactId: 7,
                address: "guest@example.com",
                state: "NEEDS-ACTION",
                name: "Guest",
                organizer: false,
            });
            const organizer = attendees.find(a => a.organizer);
            assert.strictEqual(organizer.address, "me@example.com");
            assert.strictEqual(organizer.name, "Moi");
            assert.strictEqual(organizer.state, "ACCEPTED");
            assert.strictEqual(postBodies[0].notifyAttendees, true);
        } finally {
            restore();
        }
    });

    test("createEvent does not duplicate the organizer when they are listed among the attendees", async () => {
        const postBodies = [];
        const restore = stubFetch(async (url, options) => {
            const u = String(url);
            if (options?.method === "POST" && u.includes("/calendar/pim/event")) {
                postBodies.push(JSON.parse(options.body));
                return jsonResponse({result: "success", data: {id: 1}});
            }
            if (u.includes("/profile")) {
                return jsonResponse(validProfile);
            }
            if (u.includes("/calendar/pim/contact/all")) {
                return jsonResponse({data: [{id: 7, name: "Guest", emails: ["guest@example.com"]}]});
            }
            return jsonResponse({data: {calendars: [{id: 1, default: true}]}});
        });

        try {
            const client = new CalendarClient("mock-token");
            await client.createEvent("Réunion", "2026-11-17 10:00:00", "2026-11-17 10:30:00", undefined, '["guest@example.com", "me@example.com"]');

            const attendees = postBodies[0].attendees;
            assert.strictEqual(attendees.length, 2, "no duplicate organizer entry");
            const organizer = attendees.find(a => a.address === "me@example.com");
            assert.strictEqual(organizer.organizer, true);
            assert.strictEqual(organizer.state, "ACCEPTED");
            assert.strictEqual(organizer.name, "Moi");
            const guest = attendees.find(a => a.address === "guest@example.com");
            assert.strictEqual(guest.organizer, false);
            assert.strictEqual(guest.state, "NEEDS-ACTION");
        } finally {
            restore();
        }
    });

    test("updateEvent with an empty list clears attendees without requiring a usable profile", async () => {
        const putBodies = [];
        const restore = stubFetch(async (url, options) => {
            const u = String(url);
            if (options?.method === "PUT" && u.includes("/calendar/pim/event/")) {
                putBodies.push(JSON.parse(options.body));
                return jsonResponse({result: "success", data: {}});
            }
            if (/\/calendar\/pim\/event\/\d+$/.test(u)) {
                return jsonResponse({result: "success", data: {id: 1, calendar_id: 1, title: "Existing", start: "2026-11-17T09:00:00+01:00", end: "2026-11-17T09:30:00+01:00", timezone_start: "Europe/Paris", timezone_end: "Europe/Paris", attendees: [{address: "guest@example.com", organizer: false, state: "NEEDS-ACTION"}]}});
            }
            if (u.includes("/profile")) {
                return jsonResponse({result: "error", error: {code: "403", description: "Not authorized"}});
            }
            return jsonResponse({data: {calendars: [{id: 1, default: true}]}});
        });

        try {
            const client = new CalendarClient("mock-token");
            await client.updateEvent("1", undefined, undefined, undefined, undefined, "[]");

            assert.deepStrictEqual(putBodies[0].attendees, [], "empty list clears attendees, like the web app");
        } finally {
            restore();
        }
    });

    test("createEvent with attendees fails with a clear profile error when the profile response has no data", async () => {
        const restore = stubFetch(async (url) => {
            const u = String(url);
            if (u.includes("/profile")) {
                return jsonResponse({result: "error", error: {code: "403", description: "Not authorized"}});
            }
            if (u.includes("/calendar/pim/contact/all")) {
                return jsonResponse({data: []});
            }
            return jsonResponse({data: {calendars: [{id: 1, default: true}]}});
        });

        try {
            const client = new CalendarClient("mock-token");
            await assert.rejects(
                () => client.createEvent("Réunion", "2026-11-17 10:00:00", "2026-11-17 10:30:00", undefined, '["guest@example.com"]'),
                /profile/i,
                "expected a profile-related error, not a TypeError",
            );
        } finally {
            restore();
        }
    });

    test("updateEvent with attendees fails with a clear profile error when the profile response has no data", async () => {
        const restore = stubFetch(async (url) => {
            const u = String(url);
            if (u.includes("/profile")) {
                return jsonResponse({result: "error", error: {code: "403", description: "Not authorized"}});
            }
            if (/\/calendar\/pim\/event\/\d+$/.test(u)) {
                return jsonResponse({result: "success", data: {id: 1, calendar_id: 1, title: "Existing", start: "2026-11-17T09:00:00+01:00", end: "2026-11-17T09:30:00+01:00", timezone_start: "Europe/Paris", timezone_end: "Europe/Paris", attendees: []}});
            }
            if (u.includes("/calendar/pim/contact/all")) {
                return jsonResponse({data: []});
            }
            return jsonResponse({data: {calendars: [{id: 1, default: true}]}});
        });

        try {
            const client = new CalendarClient("mock-token");
            await assert.rejects(
                () => client.updateEvent("1", undefined, undefined, undefined, undefined, '["guest@example.com"]'),
                /profile/i,
                "expected a profile-related error, not a TypeError",
            );
        } finally {
            restore();
        }
    });

    test("createEvent surfaces the API error when the profile request fails over HTTP", async () => {
        const restore = stubFetch(async (url) => {
            const u = String(url);
            if (u.includes("/profile")) {
                return jsonResponse({error: {code: "403", description: "Not authorized"}}, false);
            }
            if (u.includes("/calendar/pim/contact/all")) {
                return jsonResponse({data: []});
            }
            return jsonResponse({data: {calendars: [{id: 1, default: true}]}});
        });

        try {
            const client = new CalendarClient("mock-token");
            await assert.rejects(
                () => client.createEvent("Réunion", "2026-11-17 10:00:00", "2026-11-17 10:30:00"),
                /profile/i,
            );
        } finally {
            restore();
        }
    });

    test("attendees elements must be email strings", async () => {
        const restore = stubFetch(async (url) => {
            const u = String(url);
            if (u.includes("/profile")) {
                return jsonResponse(validProfile);
            }
            if (u.includes("/calendar/pim/contact/all")) {
                return jsonResponse({data: []});
            }
            return jsonResponse({data: {calendars: [{id: 1, default: true}]}});
        });

        try {
            const client = new CalendarClient("mock-token");
            await assert.rejects(
                () => client.createEvent("Réunion", "2026-11-17 10:00:00", "2026-11-17 10:30:00", undefined, '[{"email": "guest@example.com"}]'),
                /Invalid attendees/,
                "objects in the attendees array must be rejected, not sent as addresses",
            );
        } finally {
            restore();
        }
    });

    test("createEvent sends no attendees and no notification for an empty list, without needing a usable profile", async () => {
        const postBodies = [];
        const restore = stubFetch(async (url, options) => {
            const u = String(url);
            if (options?.method === "POST" && u.includes("/calendar/pim/event")) {
                postBodies.push(JSON.parse(options.body));
                return jsonResponse({result: "success", data: {id: 1}});
            }
            if (u.includes("/profile")) {
                return jsonResponse({result: "error", error: {code: "403", description: "Not authorized"}});
            }
            return jsonResponse({data: {calendars: [{id: 1, default: true}]}});
        });

        try {
            const client = new CalendarClient("mock-token");
            await client.createEvent("Réunion", "2026-11-17 10:00:00", "2026-11-17 10:30:00", undefined, "[]");

            assert.deepStrictEqual(postBodies[0].attendees, []);
            assert.strictEqual(postBodies[0].notifyAttendees, false);
        } finally {
            restore();
        }
    });
});
