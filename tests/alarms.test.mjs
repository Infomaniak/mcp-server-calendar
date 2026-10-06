import { describe, it } from "node:test";
import assert from "node:assert";
import { buildAlarms } from "../dist/alarms.js";

describe("buildAlarms", () => {
    it("timed event, no reminder override → 10 minutes before", () => {
        assert.deepStrictEqual(buildAlarms(false, undefined), [
            { number: 10, unit: "minute", type: "DISPLAY" },
        ]);
    });

    it("all-day event, no reminder override → 24h (1440 minutes) before", () => {
        assert.deepStrictEqual(buildAlarms(true, undefined), [
            { number: 1440, unit: "minute", type: "DISPLAY" },
        ]);
    });

    it("explicit reminder_minutes_before wins over fullday default", () => {
        // 60 minutes, timed event
        assert.deepStrictEqual(buildAlarms(false, 60), [
            { number: 60, unit: "minute", type: "DISPLAY" },
        ]);
        // 60 minutes, all-day — still uses the explicit value (60), not 1440
        assert.deepStrictEqual(buildAlarms(true, 60), [
            { number: 60, unit: "minute", type: "DISPLAY" },
        ]);
        // arbitrary value
        assert.deepStrictEqual(buildAlarms(false, 5), [
            { number: 5, unit: "minute", type: "DISPLAY" },
        ]);
    });

    it("reminder_minutes_before: 0 → empty array (no reminder)", () => {
        assert.deepStrictEqual(buildAlarms(false, 0), []);
        assert.deepStrictEqual(buildAlarms(true, 0), []);
    });

    it("unit is lowercase 'minute' (uppercase would 422 the live API)", () => {
        const alarms = buildAlarms(false, undefined);
        assert.strictEqual(alarms[0].unit, "minute");
        assert.strictEqual(alarms[0].unit, alarms[0].unit.toLowerCase());
    });

    it("type is uppercase 'DISPLAY'", () => {
        const alarms = buildAlarms(false, undefined);
        assert.strictEqual(alarms[0].type, "DISPLAY");
        assert.strictEqual(alarms[0].type, alarms[0].type.toUpperCase());
    });

    it("shape is { number, unit, type } — not the GET/stored { minutesBefore, action } that the API rejects with unexpected_error", () => {
        const alarms = buildAlarms(false, undefined);
        const keys = Object.keys(alarms[0]).sort();
        assert.deepStrictEqual(keys, ["number", "type", "unit"]);
        assert.strictEqual("minutesBefore" in alarms[0], false);
        assert.strictEqual("action" in alarms[0], false);
    });
});
