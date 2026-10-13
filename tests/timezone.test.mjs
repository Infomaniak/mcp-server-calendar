import { test, describe } from "node:test";
import assert from "node:assert";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const probe = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "timezone-probe.mjs");

function runProbe(extraEnv = {}) {
    const res = spawnSync(process.execPath, [probe], {
        encoding: "utf8",
        env: { ...process.env, TZ: "Europe/Paris", ...extraEnv },
    });
    assert.strictEqual(res.status, 0, `probe crashed:\n${res.stderr}`);
    const line = res.stdout.split("\n").find(l => l.startsWith("PROBE_RESULT "));
    assert.ok(line, "probe output missing");
    return JSON.parse(line.slice("PROBE_RESULT ".length));
}

describe("date handling with TZ=Europe/Paris (issue #64)", () => {
    test("createEvent preserves wall clock for naive dates", () => {
        const { createBodies } = runProbe();
        assert.strictEqual(createBodies[0].start, "2026-10-20 09:00:00");
        assert.strictEqual(createBodies[0].end, "2026-10-20 10:00:00");
        assert.strictEqual(createBodies[0].timezone_start, "Europe/Zurich");
        assert.strictEqual(createBodies[1].start, "2026-01-20 09:00:00");
        assert.strictEqual(createBodies[1].end, "2026-01-20 10:00:00");
        assert.strictEqual(createBodies[1].timezone_end, "Europe/Zurich");
    });

    test("listEvents preserves wall clock for naive range", () => {
        const { listUrls } = runProbe();
        const params = new URL(listUrls[0]).searchParams;
        assert.strictEqual(params.get("from"), "2026-10-20 09:00:00");
        assert.strictEqual(params.get("to"), "2026-10-20 10:00:00");
    });

    test("createEvent converts offset-carrying dates to profile timezone wall clock", () => {
        const { createBodies } = runProbe();
        assert.strictEqual(createBodies[2].start, "2026-10-20 11:00:00", "UTC input converted to Zurich CEST");
        assert.strictEqual(createBodies[3].start, "2026-01-20 09:00:00", "explicit +01:00 matches Zurich CET wall clock");
    });

    test("createEvent expands date-only input to midnight", () => {
        const { createBodies } = runProbe();
        assert.strictEqual(createBodies[4].start, "2026-10-20 00:00:00");
        assert.strictEqual(createBodies[4].end, "2026-10-21 00:00:00");
    });

    test("updateEvent converts offset-carrying dates to the event timezone wall clock", () => {
        const { updateBodies } = runProbe();
        assert.strictEqual(updateBodies[0].start, "2026-02-01 10:00:00", "UTC input converted to Zurich CET");
        assert.strictEqual(updateBodies[0].timezone_start, "Europe/Zurich");
    });

    test("falls back to UTC when the profile has no timezone", () => {
        const { createBodies } = runProbe({ PROBE_NO_PROFILE_TZ: "1" });
        assert.strictEqual(createBodies[0].start, "2026-10-20 09:00:00", "naive wall clock still preserved");
        assert.strictEqual(createBodies[0].timezone_start, "UTC");
    });
});
