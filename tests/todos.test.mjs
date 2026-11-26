import { test, describe } from "node:test";
import assert from "node:assert";
import { CalendarClient } from "../dist/calendar-client.js";

const jsonResponse = (body, ok = true) => ({
    ok,
    text: async () => JSON.stringify(body),
    json: async () => body,
});

function stubFetch(handler) {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = handler;
    return () => {
        globalThis.fetch = originalFetch;
    };
}

describe("listTodos (issue #73)", () => {
    test("lists tasks of the given calendar via the task endpoint", async () => {
        const urls = [];
        const restore = stubFetch(async (url) => {
            urls.push(String(url));
            if (String(url).includes("/calendar/pim/task")) {
                return jsonResponse({result: "success", data: [{id: 7, type: "todo", title: "Tâche", done: false}]});
            }
            return jsonResponse({data: {calendars: [{id: 42, default: true}]}});
        });

        try {
            const client = new CalendarClient("mock-token");
            const res = await client.listTodos("99");

            assert.ok(urls.some(u => u.includes("/calendar/pim/task?calendar_id=99")));
            assert.strictEqual(res.data[0].type, "todo");
            assert.ok(!urls.some(u => u.includes("/calendar/pim/calendar")), "given calendar_id must not trigger a default lookup");
        } finally {
            restore();
        }
    });

    test("falls back to the default calendar when no calendar_id is given", async () => {
        const urls = [];
        const restore = stubFetch(async (url) => {
            urls.push(String(url));
            if (String(url).includes("/calendar/pim/task")) {
                return jsonResponse({result: "success", data: []});
            }
            return jsonResponse({data: {calendars: [{id: 42, default: true}]}});
        });

        try {
            const client = new CalendarClient("mock-token");
            await client.listTodos();

            assert.ok(urls.some(u => u.includes("/calendar/pim/task?calendar_id=42")));
        } finally {
            restore();
        }
    });
});

describe("createEvent tasks (issue #73)", () => {
    const todoPostHandler = (postBodies, urls) => async (url, options) => {
        urls.push(String(url));
        if (options?.method === "POST" && String(url).includes("/calendar/pim/event")) {
            postBodies.push(JSON.parse(options.body));
            return jsonResponse({result: "success", data: {id: 1, type: "todo"}});
        }
        return jsonResponse({data: {calendars: [{id: 1, default: true}]}});
    };

    test("type=todo posts a task body without start/end and without profile lookup", async () => {
        const postBodies = [];
        const urls = [];
        const restore = stubFetch(todoPostHandler(postBodies, urls));

        try {
            const client = new CalendarClient("mock-token");
            await client.createEvent("Envoyer l'assurance", undefined, undefined, "le document", undefined, undefined, undefined, "todo", "2026-12-01");

            const body = postBodies[0];
            assert.strictEqual(body.type, "todo");
            assert.strictEqual(body.title, "Envoyer l'assurance");
            assert.strictEqual(body.description, "le document");
            assert.strictEqual(body.due_date, "2026-12-01");
            assert.strictEqual(body.progress, 0);
            assert.strictEqual(body.priority, 0);
            assert.strictEqual(body.calendar_id, 1);
            assert.ok(!("start" in body));
            assert.ok(!("end" in body));
            assert.ok(!("fullday" in body));
            assert.ok(!("freebusy" in body));
            assert.ok(!("attendees" in body));
            assert.ok(!urls.some(u => u.includes("/profile")), "tasks need no timezone profile lookup");
        } finally {
            restore();
        }
    });

    test("type=todo keeps explicit progress and priority", async () => {
        const postBodies = [];
        const restore = stubFetch(todoPostHandler(postBodies, []));

        try {
            const client = new CalendarClient("mock-token");
            await client.createEvent("Tâche", undefined, undefined, undefined, undefined, undefined, undefined, "todo", undefined, 5, 80);

            assert.strictEqual(postBodies[0].progress, 80);
            assert.strictEqual(postBodies[0].priority, 5);
            assert.ok(!("due_date" in postBodies[0]));
        } finally {
            restore();
        }
    });

    test("an event without start and end fails with a clear error", async () => {
        const restore = stubFetch(todoPostHandler([], []));

        try {
            const client = new CalendarClient("mock-token");
            await assert.rejects(
                () => client.createEvent("Réunion", undefined, undefined),
                /start and end are required/,
            );
        } finally {
            restore();
        }
    });

    test("creating an event without type keeps the event behavior", async () => {
        const postBodies = [];
        const restore = stubFetch(todoPostHandler(postBodies, []));

        try {
            const client = new CalendarClient("mock-token");
            await client.createEvent("Réunion", "2026-11-17 10:00:00", "2026-11-17 10:30:00");

            assert.strictEqual(postBodies[0].type, "event");
            assert.strictEqual(postBodies[0].start, "2026-11-17 10:00:00");
            assert.strictEqual(postBodies[0].end, "2026-11-17 10:30:00");
        } finally {
            restore();
        }
    });
});

describe("updateEvent tasks (issue #73)", () => {
    const existingTodo = {id: 7, calendar_id: 1, type: "todo", title: "Tâche", description: "", location: null, due_date: "2026-12-01 00:00:00", progress: 40, priority: 5, done: false};

    const todoPutHandler = (progressionBodies, putBodies) => async (url, options) => {
        const u = String(url);
        if (options?.method === "PUT" && /\/calendar\/pim\/event\/\d+\/todo-progression$/.test(u)) {
            progressionBodies.push(JSON.parse(options.body));
            return jsonResponse({result: "success", data: {...existingTodo, done: true}});
        }
        if (options?.method === "PUT" && /\/calendar\/pim\/event\/\d+$/.test(u)) {
            putBodies.push(JSON.parse(options.body));
            return jsonResponse({result: "success", data: existingTodo});
        }
        if (/\/calendar\/pim\/event\/\d+$/.test(u)) {
            return jsonResponse({result: "success", data: existingTodo});
        }
        return jsonResponse({data: {calendars: [{id: 1, default: true}]}});
    };

    test("only done uses the todo-progression endpoint", async () => {
        const progressionBodies = [];
        const putBodies = [];
        const restore = stubFetch(todoPutHandler(progressionBodies, putBodies));

        try {
            const client = new CalendarClient("mock-token");
            await client.updateEvent("7", undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, true);

            assert.strictEqual(progressionBodies.length, 1);
            assert.deepStrictEqual(progressionBodies[0], {progression: 40, completed: true});
            assert.strictEqual(putBodies.length, 0, "no full event PUT");
        } finally {
            restore();
        }
    });

    test("only progress sends no completed key", async () => {
        const progressionBodies = [];
        const restore = stubFetch(todoPutHandler(progressionBodies, []));

        try {
            const client = new CalendarClient("mock-token");
            await client.updateEvent("7", undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, 80);

            assert.deepStrictEqual(progressionBodies[0], {progression: 80});
        } finally {
            restore();
        }
    });

    test("a task with no stored progress defaults progression to 0", async () => {
        const progressionBodies = [];
        const restore = stubFetch(async (url, options) => {
            const u = String(url);
            if (options?.method === "PUT" && u.includes("/todo-progression")) {
                progressionBodies.push(JSON.parse(options.body));
                return jsonResponse({result: "success", data: {}});
            }
            if (/\/calendar\/pim\/event\/\d+$/.test(u)) {
                return jsonResponse({result: "success", data: {...existingTodo, progress: undefined}});
            }
            return jsonResponse({data: {calendars: [{id: 1, default: true}]}});
        });

        try {
            const client = new CalendarClient("mock-token");
            await client.updateEvent("7", undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, true);

            assert.strictEqual(progressionBodies[0].progression, 0);
        } finally {
            restore();
        }
    });

    test("a title change uses the full task PUT and preserves task fields", async () => {
        const progressionBodies = [];
        const putBodies = [];
        const restore = stubFetch(todoPutHandler(progressionBodies, putBodies));

        try {
            const client = new CalendarClient("mock-token");
            await client.updateEvent("7", "Nouveau titre");

            assert.strictEqual(putBodies.length, 1);
            assert.strictEqual(progressionBodies.length, 0);
            const body = putBodies[0];
            assert.strictEqual(body.type, "todo");
            assert.strictEqual(body.title, "Nouveau titre");
            assert.strictEqual(body.progress, 40);
            assert.strictEqual(body.priority, 5);
            assert.strictEqual(body.due_date, "2026-12-01 00:00:00");
            assert.strictEqual(body.calendar_id, 1);
            assert.ok(!("done" in body), "done omitted means status unchanged");
        } finally {
            restore();
        }
    });

    test("calendar_id on a task update moves it via the full task PUT", async () => {
        const progressionBodies = [];
        const putBodies = [];
        const restore = stubFetch(todoPutHandler(progressionBodies, putBodies));

        try {
            const client = new CalendarClient("mock-token");
            await client.updateEvent("7", undefined, undefined, undefined, undefined, undefined, undefined, "42", undefined, true);

            assert.strictEqual(progressionBodies.length, 0, "a move needs the full task PUT, not todo-progression");
            assert.strictEqual(putBodies.length, 1);
            assert.strictEqual(putBodies[0].calendar_id, "42");
            assert.strictEqual(putBodies[0].done, true);
        } finally {
            restore();
        }
    });

    test("due_date on a task update uses the full task PUT with the new date", async () => {
        const progressionBodies = [];
        const putBodies = [];
        const restore = stubFetch(todoPutHandler(progressionBodies, putBodies));

        try {
            const client = new CalendarClient("mock-token");
            await client.updateEvent("7", undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, "2027-01-15");

            assert.strictEqual(putBodies.length, 1, "changing the due date needs the full task PUT");
            assert.strictEqual(progressionBodies.length, 0);
            assert.strictEqual(putBodies[0].due_date, "2027-01-15");
        } finally {
            restore();
        }
    });

    test("priority on a task update uses the full task PUT with the new priority", async () => {
        const progressionBodies = [];
        const putBodies = [];
        const restore = stubFetch(todoPutHandler(progressionBodies, putBodies));

        try {
            const client = new CalendarClient("mock-token");
            await client.updateEvent("7", undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, 8);

            assert.strictEqual(putBodies.length, 1);
            assert.strictEqual(progressionBodies.length, 0);
            assert.strictEqual(putBodies[0].priority, 8);
        } finally {
            restore();
        }
    });

    test("updating a task with type=event fails with a clear error", async () => {
        const restore = stubFetch(todoPutHandler([], []));

        try {
            const client = new CalendarClient("mock-token");
            await assert.rejects(
                () => client.updateEvent("7", "Nouveau titre", undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, "event"),
                /of type todo/,
                "cannot update a task as an event",
            );
        } finally {
            restore();
        }
    });

    test("updating an event with type=todo fails with a clear error", async () => {
        const restore = stubFetch(async (url, options) => {
            const u = String(url);
            if (options?.method === "PUT" && /\/calendar\/pim\/event\/\d+$/.test(u)) {
                return jsonResponse({result: "success", data: {}});
            }
            if (/\/calendar\/pim\/event\/\d+$/.test(u)) {
                return jsonResponse({result: "success", data: {id: 1, calendar_id: 1, type: "event", title: "Réunion", start: "2026-11-17T09:00:00+01:00", end: "2026-11-17T09:30:00+01:00", timezone_start: "Europe/Paris", timezone_end: "Europe/Paris"}});
            }
            if (u.includes("/profile")) {
                return jsonResponse({result: "success", data: {email: "me@example.com", display_name: "Moi", preferences: {timezone: {name: "Europe/Paris"}}}});
            }
            return jsonResponse({data: {calendars: [{id: 1, default: true}]}});
        });

        try {
            const client = new CalendarClient("mock-token");
            await assert.rejects(
                () => client.updateEvent("1", undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, "todo"),
                /of type event/,
                "cannot update an event as a task",
            );
        } finally {
            restore();
        }
    });

    test("the full task PUT omits absent location/due_date and preserves private", async () => {
        const putBodies = [];
        const restore = stubFetch(async (url, options) => {
            const u = String(url);
            if (options?.method === "PUT" && /\/calendar\/pim\/event\/\d+$/.test(u)) {
                putBodies.push(JSON.parse(options.body));
                return jsonResponse({result: "success", data: {}});
            }
            if (/\/calendar\/pim\/event\/\d+$/.test(u)) {
                return jsonResponse({result: "success", data: {...existingTodo, location: null, due_date: null, private: true}});
            }
            return jsonResponse({data: {calendars: [{id: 1, default: true}]}});
        });

        try {
            const client = new CalendarClient("mock-token");
            await client.updateEvent("7", "Nouveau titre");

            assert.ok(!("location" in putBodies[0]), "absent location must be omitted, not sent as null");
            assert.ok(!("due_date" in putBodies[0]), "absent due_date must be omitted, not sent as empty string");
            assert.strictEqual(putBodies[0].private, true, "a private task must stay private after a rename");
        } finally {
            restore();
        }
    });

    test("done can be combined with a title change", async () => {
        const putBodies = [];
        const restore = stubFetch(todoPutHandler([], putBodies));

        try {
            const client = new CalendarClient("mock-token");
            await client.updateEvent("7", "Nouveau titre", undefined, undefined, undefined, undefined, undefined, undefined, undefined, true);

            assert.strictEqual(putBodies[0].done, true);
        } finally {
            restore();
        }
    });

    test("an event ignores done and keeps the normal update path", async () => {
        const putBodies = [];
        const restore = stubFetch(async (url, options) => {
            const u = String(url);
            if (options?.method === "PUT" && /\/calendar\/pim\/event\/\d+$/.test(u)) {
                putBodies.push(JSON.parse(options.body));
                return jsonResponse({result: "success", data: {}});
            }
            if (/\/calendar\/pim\/event\/\d+$/.test(u)) {
                return jsonResponse({result: "success", data: {id: 1, calendar_id: 1, type: "event", title: "Réunion", start: "2026-11-17T09:00:00+01:00", end: "2026-11-17T09:30:00+01:00", timezone_start: "Europe/Paris", timezone_end: "Europe/Paris"}});
            }
            if (u.includes("/profile")) {
                return jsonResponse({result: "success", data: {email: "me@example.com", display_name: "Moi", preferences: {timezone: {name: "Europe/Paris"}}}});
            }
            return jsonResponse({data: {calendars: [{id: 1, default: true}]}});
        });

        try {
            const client = new CalendarClient("mock-token");
            await client.updateEvent("1", undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, true);

            assert.strictEqual(putBodies.length, 1);
            assert.strictEqual(putBodies[0].type, "event");
        } finally {
            restore();
        }
    });
});
