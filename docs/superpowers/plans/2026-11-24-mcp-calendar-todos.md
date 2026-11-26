# MCP Calendar Todos (issue #73) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Exposer les tâches Infomaniak Calendar (to-dos) dans le MCP : listing, création et cochage.

**Architecture:** L'API traite les tâches comme des événements `type: "todo"` sur les mêmes endpoints `pim/event`, avec un endpoint de listing dédié `pim/task` et un endpoint de progression `PUT pim/event/{id}/todo-progression`. Le client (`calendar-client.ts`) gagne 3 méthodes/branches ; `index.ts` reste un passe-plat qui ajoute les params zod ; le routage todo vs event reste dans le client.

**Tech Stack:** TypeScript (build `tsc`), tests node:test avec stub de `globalThis.fetch` contre `dist/calendar-client.js`.

**Spec:** `docs/superpowers/specs/2026-11-24-mcp-calendar-todos-design.md`

## Global Constraints

- **NE RIEN COMMITER** : aucun `git add` / `git commit` dans tout le plan (consigne explicite de l'utilisateur).
- Aucune nouvelle dépendance (zod 4.6.7, @modelcontextprotocol/sdk 1.32.2 inchangés).
- Les tests importent `../dist/calendar-client.js` : toujours `npm run build` avant d'exécuter un fichier de test ; `npm test` = build + tous les tests.
- Style existant : indentation 4 espaces, doubles quotes, params positionnels, messages d'erreur `Something went wrong during …`.
- Vocabulaire API : `type: "todo"` (jamais « task » comme valeur).

## Review Focus

1. `done`/`progress` passés sur un **event** (pas un todo) → doit rester sur le chemin PUT normal, sans appel à `todo-progression`. Test : « updateEvent on an event ignores done » (Task 3).
2. Todo sans `progress` stocké + `done` seul → `progression` vaut 0, pas de crash. Test : « updateEvent on a task with only done uses the todo-progression endpoint » (Task 3).
3. `type=event` sans `start`/`end` → erreur claire levée côté client, pas un 422 API. Test : « createEvent for an event requires start and end » (Task 2).
4. PUT complet d'une tâche doit reprendre `due_date`/`progress`/`priority` de l'existant, sinon éditer un titre efface ces champs. Test : « updateEvent on a task with a title change uses the full task PUT » (Task 3).
5. Le PUT complet réinitialise les alarmes d'une tâche (l'API ne les renvoie pas) — limitation documentée dans le README (Task 4), pas de test possible.

---

### Task 1: `listTodos` client + outil `calendar_list_todos`

**Files:**
- Modify: `src/calendar-client.ts` (ajout méthode après `listEvents`, ~ligne 154)
- Modify: `src/index.ts` (nouvel outil après `calendar_list_events`, ~ligne 66)
- Test: `tests/todos.test.mjs` (créer)

**Interfaces:**
- Consumes: `getDefaultCalendar()` (existant, privé).
- Produces: `listTodos(calendarId?: string): Promise<any>` — GET `https://api.infomaniak.com/1/calendar/pim/task?calendar_id=<id>` ; lève `Error("Something went wrong during task listing")` si !ok.

- [ ] **Step 1: Write the failing test**

Créer `tests/todos.test.mjs` (mêmes helpers que `tests/attendees.test.mjs` : `jsonResponse`, `stubFetch` ; pas besoin de `validProfile` ici) :

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run build && node --test tests/todos.test.mjs`
Expected: FAIL — `client.listTodos is not a function`

- [ ] **Step 3: Implement `listTodos` in `src/calendar-client.ts`**

Après `listEvents` :

```ts
async listTodos(calendarId?: string): Promise<any> {
    let id = calendarId;
    if (!id) {
        const calendar = await this.getDefaultCalendar();
        id = String(calendar.id);
    }

    const params = new URLSearchParams({calendar_id: id});

    const response = await fetch(
        `https://api.infomaniak.com/1/calendar/pim/task?${params}`,
        {headers: this.headers},
    );

    if (!response.ok) {
        throw new Error("Something went wrong during task listing");
    }

    return response.json();
}
```

- [ ] **Step 4: Register the `calendar_list_todos` tool in `src/index.ts`**

Après le tool `calendar_list_events` :

```ts
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
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run build && node --test tests/todos.test.mjs`
Expected: PASS (2 tests)

---

### Task 2: création de tâches (`type`, `due_date`, `priority`, `progress` sur `calendar_create_event`)

**Files:**
- Modify: `src/calendar-client.ts` (signature `createEvent` + branche todo + méthode privée `createTodo`)
- Modify: `src/index.ts` (schéma zod de `calendar_create_event`)
- Test: `tests/todos.test.mjs`

**Interfaces:**
- Consumes: `getDefaultCalendar()` (existant).
- Produces: `createEvent(title: string, start: string | undefined, end: string | undefined, description: string | undefined, attendees: string | undefined, rrule: string | undefined, calendarId?: string, type?: string, dueDate?: string, priority?: number, progress?: number): Promise<any>` — `type === "todo"` court-circuite vers la branche tâche ; comportement event inchangé sinon. `start`/`end` deviennent `string | undefined` dans la signature.

- [ ] **Step 1: Write the failing tests**

Ajouter à `tests/todos.test.mjs` :

```js
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run build && node --test tests/todos.test.mjs`
Expected: FAIL sur les 4 nouveaux tests (le 4e peut passer trivialement si le body event est déjà bon — acceptable, il sert de garde-fou) ; « event without start/end » échoue car aucune erreur n'est levée aujourd'hui.

- [ ] **Step 3: Implement in `src/calendar-client.ts`**

`createEvent` — nouvelle signature et court-circuit, garde start/end, reste inchangé ensuite :

```ts
async createEvent(title: string, start: string | undefined, end: string | undefined, description: string | undefined, attendees: string | undefined, rrule: string | undefined, calendarId?: string, type: string = "event", dueDate?: string, priority?: number, progress?: number): Promise<any> {
    if (type === "todo") {
        return this.createTodo(title, description, dueDate, priority, progress, calendarId);
    }

    if (!start || !end) {
        throw new Error("start and end are required for events");
    }
    // ... corps existant inchangé ...
}
```

Méthode privée `createTodo` (après `createEvent`) :

```ts
private async createTodo(title: string, description: string | undefined, dueDate: string | undefined, priority: number | undefined, progress: number | undefined, calendarId?: string): Promise<any> {
    let calendar;
    if (calendarId) {
        calendar = {id: calendarId};
    } else {
        calendar = await this.getDefaultCalendar();
    }

    const body: Record<string, any> = {
        type: "todo",
        calendar_id: calendar.id,
        title,
        description,
        progress: progress ?? 0,
        priority: priority ?? 0,
        alarms: [],
        attachments: [],
    };

    if (dueDate !== undefined) {
        body.due_date = dueDate;
    }

    const response = await fetch(
        `https://api.infomaniak.com/1/calendar/pim/event`,
        {
            headers: this.headers,
            method: "POST",
            body: JSON.stringify(body)
        },
    );

    if (!response.ok) {
        throw new Error(`Something went wrong during task creation ${await response.text()}`);
    }

    return response.json();
}
```

- [ ] **Step 4: Update the `calendar_create_event` tool in `src/index.ts`**

`start` et `end` passent en `.optional()` (descriptions : « Required for events, ignored for tasks (type=todo) »), et ajout des params optionnels :

```ts
type: z.enum(["event", "todo"]).describe('Object type. "event" (default) or "todo" to create a task. Tasks have no start/end; set due_date instead.').optional(),
due_date: z.string().describe('Task due date "YYYY-MM-DD" or "YYYY-MM-DD HH:mm:ss" (type=todo only)').optional(),
priority: z.number().int().min(0).max(10).describe("Task priority 0-10, 0 = none (type=todo only)").optional(),
progress: z.number().int().min(0).max(100).describe("Task progression in percent (type=todo only)").optional(),
```

Handler : déstructurer `type, due_date, priority, progress` et appeler
`calendarClient.createEvent(title, start, end, description, attendees, rrule, calendar_id, type, due_date, priority, progress)`.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm run build && node --test tests/todos.test.mjs tests/attendees.test.mjs`
Expected: PASS (tous, y compris les tests attendees existants — ils passent toujours start/end)

---

### Task 3: cochage et mise à jour des tâches (`done`, `progress` sur `calendar_update_event`)

**Files:**
- Modify: `src/calendar-client.ts` (signature `updateEvent` + routage todo + méthode privée `updateTodo`)
- Modify: `src/index.ts` (schéma zod de `calendar_update_event`)
- Test: `tests/todos.test.mjs`

**Interfaces:**
- Consumes: `getEvent(eventId)` (existant — marche pour les todos).
- Produces: `updateEvent(eventId: string, title: string | undefined, start: string | undefined, end: string | undefined, description: string | undefined, attendees: string | undefined, rrule: string | undefined, calendarId?: string, notifyAttendees?: boolean, done?: boolean, progress?: number): Promise<any>` — si l'événement existant est un todo : `PUT …/todo-progression` quand seuls done/progress sont fournis, PUT complet sinon ; chemin event inchangé.

- [ ] **Step 1: Write the failing tests**

Ajouter à `tests/todos.test.mjs` :

```js
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run build && node --test tests/todos.test.mjs`
Expected: FAIL — aujourd'hui `updateEvent` envoie toujours le PUT event complet (done est ignoré, aucun appel todo-progression).

- [ ] **Step 3: Implement in `src/calendar-client.ts`**

`updateEvent` — signature étendue et routage juste après `const event = existing.data;` :

```ts
async updateEvent(eventId: string, title: string | undefined, start: string | undefined, end: string | undefined, description: string | undefined, attendees: string | undefined, rrule: string | undefined, calendarId?: string, notifyAttendees: boolean = false, done?: boolean, progress?: number): Promise<any> {
    const existing = await this.getEvent(eventId);
    const event = existing.data;

    if (event.type === "todo") {
        return this.updateTodo(event, eventId, title, description, done, progress);
    }

    // ... corps existant inchangé ...
}
```

Méthode privée `updateTodo` (après `updateEvent`) :

```ts
private async updateTodo(event: any, eventId: string, title: string | undefined, description: string | undefined, done: boolean | undefined, progress: number | undefined): Promise<any> {
    if (title === undefined && description === undefined) {
        const body: Record<string, any> = {
            progression: progress ?? event.progress ?? 0,
            ...(done !== undefined ? {completed: done} : {}),
        };

        const response = await fetch(
            `https://api.infomaniak.com/1/calendar/pim/event/${eventId}/todo-progression`,
            {
                headers: this.headers,
                method: "PUT",
                body: JSON.stringify(body)
            },
        );

        if (!response.ok) {
            throw new Error(`Something went wrong during task update ${await response.text()}`);
        }

        return response.json();
    }

    const body: Record<string, any> = {
        id: parseInt(eventId),
        calendar_id: event.calendar_id,
        type: "todo",
        title: title ?? event.title,
        description: description ?? event.description ?? "",
        location: event.location ?? null,
        due_date: event.due_date ?? "",
        progress: progress ?? event.progress ?? 0,
        priority: event.priority ?? 0,
        alarms: [],
        attachments: [],
        ...(done !== undefined ? {done} : {}),
    };

    const response = await fetch(
        `https://api.infomaniak.com/1/calendar/pim/event/${eventId}`,
        {
            headers: this.headers,
            method: "PUT",
            body: JSON.stringify(body)
        },
    );

    if (!response.ok) {
        throw new Error(`Something went wrong during task update ${await response.text()}`);
    }

    return response.json();
}
```

- [ ] **Step 4: Update the `calendar_update_event` tool in `src/index.ts`**

Ajouter aux inputs optionnels :

```ts
done: z.boolean().describe("For a task (type=todo): true to mark done, false to reopen. Ignored for events.").optional(),
progress: z.number().int().min(0).max(100).describe("Task progression in percent (type=todo only)").optional(),
```

Handler : déstructurer `done, progress` et les passer en fin d'appel :
`calendarClient.updateEvent(event_id, title, start, end, description, attendees, rrule, calendar_id, notify_attendees, done, progress)`.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm run build && node --test tests/todos.test.mjs tests/attendees.test.mjs tests/timezone.test.mjs`
Expected: PASS (tous)

---

### Task 4: README + suite complète

**Files:**
- Modify: `README.md` (sections Tools)

**Interfaces:**
- Consumes: tout ce qui précède.
- Produces: documentation à jour.

- [ ] **Step 1: Update README**

1. Insérer après la section `calendar_list_events` (et renuméroter les suivantes) :

```markdown
3. `calendar_list_todos`
   - List the tasks (to-dos) of a calendar, with their `done` state, `progress` (percent) and `priority`
   - Optional inputs:
      - `calendar_id` (string): Calendar identifier (defaults to primary calendar if omitted)
   - Returns: List of tasks. Tasks have no start/end; they carry `due_date`, `done`, `progress` and `priority` instead.
```

2. Dans `calendar_create_event` : `start`/`end` deviennent « (events only) » avec la note :
   « Set `type` to `"todo"` to create a task: `start`/`end` are then ignored, use `due_date` (`YYYY-MM-DD` or `YYYY-MM-DD HH:mm:ss`), and optionally `priority` (0-10, default 0) and `progress` (percent, default 0). »
3. Dans `calendar_update_event` : ajouter aux Optional inputs :
   « `done` (boolean): for a task, true marks it done, false reopens it (ignored for events) » et
   « `progress` (number): task progression in percent ». Note : « Updating a task's title or description rewrites the task (its reminders are reset — the API does not expose them). »

- [ ] **Step 2: Run the full suite**

Run: `npm test`
Expected: PASS (build + tous les fichiers de test, y compris `server-startup.test.mjs` et `verify.mjs` s'il en fait partie)

- [ ] **Step 3: Stop — do NOT commit**

Aucun `git add` / `git commit` : l'utilisateur a demandé explicitement de ne rien commiter.
