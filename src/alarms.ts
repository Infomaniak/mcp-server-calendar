/**
 * Build the `alarms` array for the Infomaniak PIM event API.
 *
 * IMPORTANT — alarm SHAPE (live-verified against the real API):
 *
 *   POST /1/calendar/pim/event and PUT /1/calendar/pim/event/<id>
 *   accept alarms as
 *
 *     [{ "number": <int>, "unit": "minute"|"hour"|"day", "type": "DISPLAY"|"EMAIL"|"SMS"|"WEBHOOK" }]
 *
 * Constraints:
 *   - `unit` MUST be lowercase (uppercase → HTTP 422).
 *   - `type` MUST be uppercase.
 *   - The server converts `unit` to the stored `minutesBefore`
 *     (1 hour → 60, 1 day → 1440).
 *
 * The shape `{ minutesBefore, action }` seen in GET responses is the
 * STORED representation, not the write representation. Sending it on
 * POST/PUT is rejected with `unexpected_error`. That is the bug this
 * helper fixes.
 *
 * Pure / no I/O so it can be unit-tested without network.
 */
export function buildAlarms(
    fullday: boolean | undefined,
    reminderMinutesBefore: number | undefined,
): Array<{ number: number; unit: "minute" | "hour" | "day"; type: "DISPLAY" }> {
    // Explicit "no reminder" → empty array.
    if (reminderMinutesBefore === 0) {
        return [];
    }

    // Caller asked for a specific value → honour it in minutes.
    if (reminderMinutesBefore !== undefined) {
        return [{ number: reminderMinutesBefore, unit: "minute", type: "DISPLAY" }];
    }

    // No explicit value: default to 10 minutes for timed events,
    // 24 hours (1440 minutes) for all-day events.
    if (fullday) {
        return [{ number: 1440, unit: "minute", type: "DISPLAY" }];
    }

    return [{ number: 10, unit: "minute", type: "DISPLAY" }];
}
