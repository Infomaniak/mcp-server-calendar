import { describe, it } from "node:test";
import assert from "node:assert";
import {
    resolveHttpConfig,
    warnOnSuspiciousAllowlists,
} from "../dist/http-config.js";

const baseEnv = { CALENDAR_TOKEN: "test-token" };

function collect(cfg) {
    const logged = [];
    const warnings = warnOnSuspiciousAllowlists(cfg, (m) => logged.push(m));
    return { warnings, logged };
}

describe("warnOnSuspiciousAllowlists", () => {
    it("stays silent for the loopback defaults", () => {
        const { warnings, logged } = collect(resolveHttpConfig(baseEnv));
        assert.deepStrictEqual(warnings, []);
        assert.deepStrictEqual(logged, []);
    });

    it("stays silent for correct allowlists", () => {
        const cfg = resolveHttpConfig({
            ...baseEnv,
            MCP_HTTP_ALLOWED_HOSTS: "calendar.example.com,localhost",
            MCP_HTTP_ALLOWED_ORIGINS:
                "https://calendar.example.com,http://127.0.0.1:*",
        });
        const { warnings, logged } = collect(cfg);
        assert.deepStrictEqual(warnings, []);
        assert.deepStrictEqual(logged, []);
    });

    it("does not warn about a bare hostname that carries a port", () => {
        // hostMatches() strips the port, so this entry is legitimate.
        const cfg = resolveHttpConfig({
            ...baseEnv,
            MCP_HTTP_ALLOWED_HOSTS: "calendar.example.com:8443",
        });
        assert.deepStrictEqual(collect(cfg).warnings, []);
    });

    it("warns when a Host entry carries a scheme, and names the bare hostname to use", () => {
        const cfg = resolveHttpConfig({
            ...baseEnv,
            MCP_HTTP_ALLOWED_HOSTS: "https://calendar.gathmann.co,localhost",
        });
        const { warnings, logged } = collect(cfg);

        assert.strictEqual(warnings.length, 1);
        assert.match(warnings[0], /not a bare hostname/);
        assert.match(warnings[0], /calendar\.gathmann\.co/);
        assert.match(warnings[0], /Use "calendar\.gathmann\.co" instead/);
        assert.match(logged[0], /^warning: /);
    });

    it("warns when a Host entry carries a path", () => {
        const cfg = resolveHttpConfig({
            ...baseEnv,
            MCP_HTTP_ALLOWED_HOSTS: "calendar.example.com/mcp",
        });
        const { warnings } = collect(cfg);
        assert.strictEqual(warnings.length, 1);
        assert.match(warnings[0], /not a bare hostname/);
    });

    it("warns that a universal Origin wildcard disables the guard", () => {
        const cfg = resolveHttpConfig({
            ...baseEnv,
            MCP_HTTP_ALLOWED_ORIGINS: "*",
        });
        const { warnings, logged } = collect(cfg);

        assert.strictEqual(warnings.length, 1);
        assert.match(warnings[0], /matches every Origin value/);
        assert.match(warnings[0], /guard/);
        assert.match(logged[0], /^warning: /);
    });

    it("reproduces the live misconfiguration: one warning per defect", () => {
        // Exactly the values observed on the running container.
        const cfg = resolveHttpConfig({
            ...baseEnv,
            MCP_HTTP_ALLOWED_HOSTS:
                "https://calendar.gathmann.co,127.0.0.1,localhost,0.0.0.0",
            MCP_HTTP_ALLOWED_ORIGINS: "*",
        });
        const { warnings, logged } = collect(cfg);

        assert.strictEqual(warnings.length, 2);
        assert.strictEqual(logged.length, 2);
        assert.ok(warnings.some((w) => w.includes("calendar.gathmann.co")));
        assert.ok(warnings.some((w) => w.includes("matches every Origin value")));
        for (const line of logged) assert.match(line, /^warning: /);
    });
});
