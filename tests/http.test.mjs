import { describe, it, before, after } from "node:test";
import assert from "node:assert";
import { resolveHttpConfig } from "../dist/http-config.js";
import { startHttpService } from "../dist/http-server.js";
import { createCalendarMcpServer } from "../dist/mcp-server.js";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/**
 * The test file mocks `globalThis.fetch` to intercept the calendar API
 * calls the tool handlers make. But the tests themselves need to drive
 * real HTTP requests against the local server, so they use a captured
 * `httpFetch` reference to the real implementation.
 */
let httpFetch = globalThis.fetch;

/**
 * Drive a request via the (real) httpFetch. Returns the response status,
 * headers, and parsed body. Body is JSON if the response's content type
 * starts with "application/json"; otherwise the raw text.
 */
/**
 * Parse a Server-Sent Events payload into a list of JSON-decoded `data:` lines.
 */
function parseSseEvents(raw) {
    const events = [];
    let current = null;
    for (const line of raw.split(/\r?\n/)) {
        if (line.startsWith("event: ")) {
            current = {event: line.slice(7).trim(), data: null};
        } else if (line.startsWith("data: ")) {
            const dataStr = line.slice(6);
            let data;
            try {
                data = JSON.parse(dataStr);
            } catch {
                data = dataStr;
            }
            if (current) {
                current.data = data;
            } else {
                current = {data};
            }
            events.push(current);
            current = null;
        } else if (line === "" && current) {
            events.push(current);
            current = null;
        }
    }
    if (current) events.push(current);
    return events;
}

async function call(url, { method, headers, body } = {}) {
    const opts = {
        method: method ?? "POST",
        headers: { ...(headers ?? {}) },
    };
    if (body !== undefined) {
        if (typeof body === "string") {
            opts.body = body;
        } else {
            opts.body = JSON.stringify(body);
        }
        if (opts.headers["Content-Type"] === undefined) {
            opts.headers["Content-Type"] = "application/json";
        }
    }
    const res = await httpFetch(url, opts);
    const raw = await res.text();
    const ct = (res.headers.get("content-type") ?? "").toLowerCase();
    let body_ = raw;
    if (ct.startsWith("application/json") && raw.length > 0) {
        try {
            body_ = JSON.parse(raw);
        } catch {
            /* keep raw */
        }
    } else if (ct.startsWith("text/event-stream") && raw.length > 0) {
        const events = parseSseEvents(raw);
        // If exactly one data line, return the decoded object directly.
        if (events.length === 1 && events[0].data !== null) {
            body_ = events[0].data;
        } else {
            body_ = events;
        }
    }
    return { status: res.status, headers: res.headers, body: body_ };
}

/**
 * Like `call` but uses Node's low-level `http.request` so the caller can
 * override the `Host` header (Node's global fetch strips it).
 */
function callRawFn({ host, port, method, path, headers, body }) {
    return new Promise((resolve, reject) => {
        const reqHeaders = { ...(headers ?? {}) };
        if (host !== undefined) {
            reqHeaders.Host = port !== undefined ? `${host}:${port}` : host;
        }
        if (body !== undefined && reqHeaders["Content-Type"] === undefined) {
            reqHeaders["Content-Type"] = "application/json";
        }
        const req = http.request(
            {
                host: "127.0.0.1",
                port,
                method: method ?? "POST",
                path: path ?? "/mcp",
                headers: reqHeaders,
            },
            (res) => {
                const chunks = [];
                res.on("data", (c) => chunks.push(c));
                res.on("end", () => {
                    const raw = Buffer.concat(chunks).toString("utf-8");
                    const ct = (res.headers["content-type"] ?? "").toLowerCase();
                    let parsed = raw;
                    if (ct.startsWith("application/json") && raw.length > 0) {
                        try {
                            parsed = JSON.parse(raw);
                        } catch {
                            /* keep raw */
                        }
                    }
                    resolve({status: res.statusCode, headers: res.headers, body: parsed});
                });
                res.on("error", reject);
            },
        );
        req.on("error", reject);
        if (body !== undefined) {
            req.write(typeof body === "string" ? body : JSON.stringify(body));
        }
        req.end();
    });
}

import http from "node:http";

// Convenience: start the service on a random port, return the handle plus a
// `call` helper pre-bound to that port. Accepts either a single `opts`
// object (with optional `path`) or `(path, opts)`.
async function startOnRandomPort(extra = {}) {
    const handle = await startHttpService({
        token: "test-token",
        host: "127.0.0.1",
        port: 0,
        allowedHosts: ["127.0.0.1", "localhost"],
        allowedOrigins: ["http://127.0.0.1:*", "http://localhost:*"],
        serverFactory: createCalendarMcpServer,
        ...extra,
    });
    const addr = handle.address();
    const port = addr.port;
    return {
        handle,
        call: (a, b) => {
            if (typeof a === "string") {
                return call(`http://127.0.0.1:${port}${a}`, b ?? {});
            }
            return call(`http://127.0.0.1:${port}${a.path ?? "/mcp"}`, a);
        },
        callRaw: (opts) => callRawFn({...opts, port}),
    };
}

// ---------------------------------------------------------------------------
// http-config tests
// ---------------------------------------------------------------------------

describe("resolveHttpConfig", () => {
    const baseEnv = {
        CALENDAR_TOKEN: "tkn",
    };

    it("throws when CALENDAR_TOKEN is missing", () => {
        assert.throws(
            () => resolveHttpConfig({}),
            /CALENDAR_TOKEN is required/,
        );
    });

    it("throws when CALENDAR_TOKEN is empty string", () => {
        assert.throws(
            () => resolveHttpConfig({ CALENDAR_TOKEN: "" }),
            /CALENDAR_TOKEN is required/,
        );
    });

    it("defaults host to 127.0.0.1, port to 4500, loopback allowlists", () => {
        const cfg = resolveHttpConfig(baseEnv);
        assert.strictEqual(cfg.host, "127.0.0.1");
        assert.strictEqual(cfg.port, 4500);
        assert.deepStrictEqual(cfg.allowedHosts, ["127.0.0.1", "localhost", "[::1]"]);
        assert.deepStrictEqual(cfg.allowedOrigins, [
            "http://127.0.0.1:*",
            "http://localhost:*",
            "http://[::1]:*",
        ]);
    });

    it("honors a custom MCP_HTTP_HOST", () => {
        const cfg = resolveHttpConfig({ ...baseEnv, MCP_HTTP_HOST: "0.0.0.0" });
        assert.strictEqual(cfg.host, "0.0.0.0");
    });

    it("rejects empty MCP_HTTP_HOST", () => {
        assert.throws(
            () => resolveHttpConfig({ ...baseEnv, MCP_HTTP_HOST: "   " }),
            /MCP_HTTP_HOST must be non-empty/,
        );
    });

    describe("MCP_HTTP_PORT validation", () => {
        it("accepts the default when unset", () => {
            const cfg = resolveHttpConfig(baseEnv);
            assert.strictEqual(cfg.port, 4500);
        });

        it("accepts 1 and 65535 as boundary values", () => {
            assert.strictEqual(
                resolveHttpConfig({ ...baseEnv, MCP_HTTP_PORT: "1" }).port,
                1,
            );
            assert.strictEqual(
                resolveHttpConfig({ ...baseEnv, MCP_HTTP_PORT: "65535" }).port,
                65535,
            );
        });

        it("rejects 0", () => {
            assert.throws(
                () => resolveHttpConfig({ ...baseEnv, MCP_HTTP_PORT: "0" }),
                /MCP_HTTP_PORT must be between 1 and 65535/,
            );
        });

        it("rejects 65536", () => {
            assert.throws(
                () => resolveHttpConfig({ ...baseEnv, MCP_HTTP_PORT: "65536" }),
                /MCP_HTTP_PORT must be between 1 and 65535/,
            );
        });

        it("rejects non-numeric input", () => {
            assert.throws(
                () => resolveHttpConfig({ ...baseEnv, MCP_HTTP_PORT: "abc" }),
                /MCP_HTTP_PORT must be an integer/,
            );
        });

        it("rejects negative numbers", () => {
            assert.throws(
                () => resolveHttpConfig({ ...baseEnv, MCP_HTTP_PORT: "-1" }),
                /MCP_HTTP_PORT must be an integer/,
            );
        });

        it("rejects decimal numbers", () => {
            assert.throws(
                () => resolveHttpConfig({ ...baseEnv, MCP_HTTP_PORT: "4500.5" }),
                /MCP_HTTP_PORT must be an integer/,
            );
        });

        it("rejects numbers with leading whitespace / plus sign", () => {
            assert.throws(
                () => resolveHttpConfig({ ...baseEnv, MCP_HTTP_PORT: " 4500" }),
                /MCP_HTTP_PORT must be an integer/,
            );
            assert.throws(
                () => resolveHttpConfig({ ...baseEnv, MCP_HTTP_PORT: "+4500" }),
                /MCP_HTTP_PORT must be an integer/,
            );
        });
    });

    it("parses and trims MCP_HTTP_ALLOWED_HOSTS and rejects empty list", () => {
        const cfg = resolveHttpConfig({
            ...baseEnv,
            MCP_HTTP_ALLOWED_HOSTS: " foo.com , bar.com ,, foo.com ",
        });
        assert.deepStrictEqual(cfg.allowedHosts, ["foo.com", "bar.com"]);

        assert.throws(
            () => resolveHttpConfig({ ...baseEnv, MCP_HTTP_ALLOWED_HOSTS: "  , , " }),
            /MCP_HTTP_ALLOWED_HOSTS must contain at least one hostname/,
        );
    });

    it("parses and trims MCP_HTTP_ALLOWED_ORIGINS and rejects empty list", () => {
        const cfg = resolveHttpConfig({
            ...baseEnv,
            MCP_HTTP_ALLOWED_ORIGINS: " https://a.example , https://b.example ",
        });
        assert.deepStrictEqual(cfg.allowedOrigins, [
            "https://a.example",
            "https://b.example",
        ]);

        assert.throws(
            () => resolveHttpConfig({ ...baseEnv, MCP_HTTP_ALLOWED_ORIGINS: "" }),
            /MCP_HTTP_ALLOWED_ORIGINS must contain at least one origin/,
        );
    });
});

// ---------------------------------------------------------------------------
// http-server tests
// ---------------------------------------------------------------------------

describe("startHttpService (HTTP transport)", () => {
    let handle;
    let call;
    let originalFetch;
    let fetchCalls;

    before(async () => {
        // Capture the real fetch for our test-side HTTP requests, then
        // mock `globalThis.fetch` so the tool handlers can't hit the live
        // calendar API.
        originalFetch = globalThis.fetch;
        httpFetch = originalFetch;
        globalThis.fetch = async (url, options) => {
            fetchCalls.push({ url: String(url), options });
            return {
                ok: true,
                text: async () => "",
                json: async () => ({ result: "success", data: { calendars: [] } }),
            };
        };
    });

    after(async () => {
        globalThis.fetch = originalFetch;
    });

    describe("routing", () => {
        before(async () => {
            fetchCalls = [];
            ({ handle, call } = await startOnRandomPort());
        });
        after(async () => {
            await handle.shutdown("SIGTERM");
        });

        it("returns 404 for any path other than /mcp", async () => {
            const r = await call({ path: "/", method: "GET" });
            assert.strictEqual(r.status, 404);
            assert.deepStrictEqual(r.body, { error: "not found" });
        });

        it("returns 404 for /mcp/extra (prefix match is not allowed)", async () => {
            const r = await call({ path: "/mcp/extra", method: "GET" });
            assert.strictEqual(r.status, 404);
        });

        it("returns 405 for non-POST/GET/DELETE methods on /mcp", async () => {
            const r = await call({ method: "PUT" });
            assert.strictEqual(r.status, 405);
        });
    });

    describe("host / origin validation", () => {
        let rawCall;
        before(async () => {
            fetchCalls = [];
            ({ handle, call, callRaw: rawCall } = await startOnRandomPort({
                allowedHosts: ["allowed.example", "127.0.0.1"],
                allowedOrigins: ["https://allowed.example", "http://127.0.0.1:*"],
            }));
        });
        after(async () => {
            await handle.shutdown("SIGTERM");
        });

        it("rejects a Host header that is not in the allowlist", async () => {
            const r = await rawCall({
                host: "evil.example",
                method: "POST",
                path: "/mcp",
                body: {},
            });
            assert.strictEqual(r.status, 403);
        });

        it("accepts a Host header that is in the allowlist", async () => {
            const r = await rawCall({
                host: "allowed.example",
                method: "POST",
                path: "/mcp",
                headers: {
                    "Content-Type": "application/json",
                    "Accept": "application/json, text/event-stream",
                },
                body: {
                    jsonrpc: "2.0",
                    id: 1,
                    method: "initialize",
                    params: {
                        protocolVersion: "2024-11-05",
                        capabilities: {},
                        clientInfo: { name: "test", version: "0.0.0" },
                    },
                },
            });
            assert.ok(
                r.status === 200,
                `expected 200, got ${r.status}: ${JSON.stringify(r.body)}`,
            );
        });

        it("rejects an Origin header that does not match the allowlist", async () => {
            const r = await rawCall({
                host: "127.0.0.1",
                method: "POST",
                path: "/mcp",
                headers: { Origin: "https://evil.example" },
                body: {},
            });
            assert.strictEqual(r.status, 403);
        });

        it("accepts a wildcard-matching Origin", async () => {
            // http://127.0.0.1:* matches any port.
            const r = await rawCall({
                host: "127.0.0.1",
                method: "POST",
                path: "/mcp",
                headers: {
                    "Content-Type": "application/json",
                    "Accept": "application/json, text/event-stream",
                    "Origin": "http://127.0.0.1:12345",
                },
                body: {
                    jsonrpc: "2.0",
                    id: 99,
                    method: "initialize",
                    params: {
                        protocolVersion: "2024-11-05",
                        capabilities: {},
                        clientInfo: { name: "test", version: "0.0.0" },
                    },
                },
            });
            assert.ok(
                r.status === 200,
                `expected 200, got ${r.status}: ${JSON.stringify(r.body)}`,
            );
        });
    });

    describe("MCP protocol over HTTP", () => {
        before(async () => {
            fetchCalls = [];
            ({ handle, call } = await startOnRandomPort());
        });
        after(async () => {
            await handle.shutdown("SIGTERM");
        });

        const initialize = {
            jsonrpc: "2.0",
            id: 1,
            method: "initialize",
            params: {
                protocolVersion: "2024-11-05",
                capabilities: {},
                clientInfo: { name: "http-test", version: "1.0.0" },
            },
        };

        const initializedNotification = {
            jsonrpc: "2.0",
            method: "notifications/initialized",
        };

        it("responds to an initialize handshake with serverInfo and capabilities", async () => {
            const r = await call({
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Accept": "application/json, text/event-stream",
                },
                body: initialize,
            });
            assert.strictEqual(r.status, 200);
            assert.strictEqual(r.body.id, 1);
            assert.ok(r.body.result, "initialize result should be present");
            assert.ok(
                r.body.result.serverInfo,
                "serverInfo should be present in initialize result",
            );
            assert.strictEqual(
                r.body.result.serverInfo.name,
                "Infomaniak calendar MCP Server",
            );
            assert.ok(r.body.result.capabilities, "capabilities should be present");
        });

        it("returns exactly six tools in a stable order from tools/list", async () => {
            // In stateless mode, the McpServer is created fresh per request
            // with all six tools already registered, so `tools/list` works
            // without an explicit `initialize` handshake.
            const r = await call({
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Accept": "application/json, text/event-stream",
                },
                body: {
                    jsonrpc: "2.0",
                    id: 2,
                    method: "tools/list",
                    params: {},
                },
            });
            assert.strictEqual(r.status, 200);
            assert.strictEqual(r.body.id, 2);
            assert.ok(r.body.result, "tools/list should return a result");
            const tools = r.body.result.tools;
            assert.ok(Array.isArray(tools), "tools/list should return an array");
            const names = tools.map((t) => t.name);
            assert.deepStrictEqual(names, [
                "calendar_list_calendars",
                "calendar_list_events",
                "calendar_get_event",
                "calendar_create_event",
                "calendar_update_event",
                "calendar_delete_event",
            ]);
            assert.strictEqual(tools.length, 6);
        });

        it("invokes a tool over HTTP without ever hitting the live API", async () => {
            // Reset fetchCalls (we don't care about prior calls).
            fetchCalls.length = 0;

            const r = await call({
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Accept": "application/json, text/event-stream",
                },
                body: {
                    jsonrpc: "2.0",
                    id: 3,
                    method: "tools/call",
                    params: {
                        name: "calendar_list_calendars",
                        arguments: {},
                    },
                },
            });
            assert.strictEqual(r.status, 200);
            assert.strictEqual(r.body.id, 3);
            assert.ok(
                r.body.result,
                `tools/call should return a result, got: ${JSON.stringify(r.body)}`,
            );
            // The mocked fetch returns data.calendars = [] which the tool
            // serializes as '[]' in the text content.
            assert.ok(
                Array.isArray(r.body.result.content),
                "result.content should be an array",
            );
            assert.strictEqual(r.body.result.content[0].type, "text");
            assert.strictEqual(r.body.result.content[0].text, "[]");

            // The mock fetch was called exactly once (only the tool's own
            // request, never any tool-discovery calls).
            assert.ok(fetchCalls.length >= 1, "fetch should have been called");
            assert.ok(
                fetchCalls[0].url.includes("/calendar/pim/calendar"),
                `unexpected fetch URL: ${fetchCalls[0].url}`,
            );
        });
    });
});
