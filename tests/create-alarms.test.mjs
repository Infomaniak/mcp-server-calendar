/**
 * Regression guard for the createEvent alarm payload.
 *
 * Why this file exists: tests/alarms.test.mjs unit-tests `buildAlarms()` in
 * isolation and stayed green while a bad merge (eb19f71) left a SECOND
 * `body.alarms = [...]` assignment inside `createEvent` that overwrote the
 * fixed shape with the API-rejected stored shape
 * `[{minutesBefore, action}]`. Unit-testing the helper cannot see a later
 * assignment clobbering it — so this test asserts on the payload actually
 * handed to fetch().
 *
 * The write shape the API accepts is [{number, unit, type}] (unit lowercase,
 * type uppercase). The stored shape [{minutesBefore, action}] gets rejected
 * with `unexpected_error`.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';

import {CalendarClient} from '../dist/calendar-client.js';

const PROFILE = {data: {preferences: {timezone: {name: 'Europe/Paris'}}}};

/** Capture the POST /1/calendar/pim/event body for a given argument set. */
async function createPayload({fullday, reminderMinutesBefore} = {}) {
    const originalFetch = globalThis.fetch;
    let payload = null;
    globalThis.fetch = async (url, options = {}) => {
        const u = String(url);
        if (u === 'https://api.infomaniak.com/2/profile') {
            return {ok: true, json: async () => PROFILE, text: async () => ''};
        }
        if (u === 'https://api.infomaniak.com/1/calendar/pim/event' && options.method === 'POST') {
            payload = JSON.parse(options.body);
            return {ok: true, json: async () => ({result: 'success', data: payload}), text: async () => ''};
        }
        throw new Error(`unexpected fetch: ${options.method || 'GET'} ${u}`);
    };
    try {
        const client = new CalendarClient('test-token');
        await client.createEvent(
            'Test', '2026-11-10 10:00:00', '2026-11-10 11:00:00',
            undefined, undefined, undefined, '2107270',
            fullday, reminderMinutesBefore,
        );
    } finally {
        globalThis.fetch = originalFetch;
    }
    assert.ok(payload, 'createEvent never issued the POST');
    return payload;
}

const WRITE_SHAPE = (n) => [{number: n, unit: 'minute', type: 'DISPLAY'}];

test('timed event with no explicit reminder sends a 10-minute alarm', async () => {
    const body = await createPayload();
    assert.deepEqual(body.alarms, WRITE_SHAPE(10));
});

test('all-day event defaults to a 1440-minute (24h) alarm', async () => {
    const body = await createPayload({fullday: true});
    assert.deepEqual(body.alarms, WRITE_SHAPE(1440));
});

test('explicit reminder_minutes_before is honoured', async () => {
    const body = await createPayload({reminderMinutesBefore: 30});
    assert.deepEqual(body.alarms, WRITE_SHAPE(30));
});

test('reminder_minutes_before=0 sends an empty alarm array', async () => {
    const body = await createPayload({reminderMinutesBefore: 0});
    assert.deepEqual(body.alarms, []);
});

test('the alarm payload never uses the stored shape ({minutesBefore, action})', async () => {
    for (const args of [{}, {fullday: true}, {reminderMinutesBefore: 60}]) {
        const body = await createPayload(args);
        for (const alarm of body.alarms) {
            assert.ok(!('minutesBefore' in alarm),
                `stored shape leaked into the POST body: ${JSON.stringify(body.alarms)}`);
            assert.ok(!('action' in alarm),
                `stored shape leaked into the POST body: ${JSON.stringify(body.alarms)}`);
        }
    }
});
