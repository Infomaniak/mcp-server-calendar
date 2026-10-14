export type HttpConfig = {
    token: string;
    host: string;
    port: number;
    allowedHosts: string[];
    allowedOrigins: string[];
};

export function defaultLoopbackAllowedHosts(): string[] {
    return ["127.0.0.1", "localhost", "[::1]"];
}

export function defaultLoopbackAllowedOrigins(): string[] {
    return ["http://127.0.0.1:*", "http://localhost:*", "http://[::1]:*"];
}

/**
 * Resolves HTTP configuration from environment variables.
 *
 * Validation order (throws on first failure):
 * 1. CALENDAR_TOKEN — required, non-empty
 * 2. MCP_HTTP_HOST — default "127.0.0.1", must be non-empty when supplied
 * 3. MCP_HTTP_PORT — default "4500", must parse to integer in 1..65535
 * 4. MCP_HTTP_ALLOWED_HOSTS — default loopback hostnames, trimmed/deduped, non-empty
 * 5. MCP_HTTP_ALLOWED_ORIGINS — default loopback origins, trimmed/deduped, non-empty
 */
export function resolveHttpConfig(env?: NodeJS.ProcessEnv): HttpConfig {
    const e = env ?? process.env;

    // 1. CALENDAR_TOKEN
    const token = e.CALENDAR_TOKEN;
    if (!token) {
        throw new Error(
            `CALENDAR_TOKEN is required but was ${token === "" ? "empty" : "missing"}`,
        );
    }

    // 2. MCP_HTTP_HOST
    const rawHost = e.MCP_HTTP_HOST ?? "127.0.0.1";
    if (rawHost.trim() === "") {
        throw new Error(
            `MCP_HTTP_HOST must be non-empty when supplied, got "${rawHost}"`,
        );
    }

    // 3. MCP_HTTP_PORT
    const rawPort = e.MCP_HTTP_PORT ?? "4500";
    if (!/^\d+$/.test(rawPort)) {
        throw new Error(
            `MCP_HTTP_PORT must be an integer between 1 and 65535 (no leading +, no whitespace, no decimal, no exponents), got "${rawPort}"`,
        );
    }
    const port = Number.parseInt(rawPort, 10);
    if (port < 1 || port > 65535) {
        throw new Error(
            `MCP_HTTP_PORT must be between 1 and 65535, got "${rawPort}"`,
        );
    }

    // 4. MCP_HTTP_ALLOWED_HOSTS
    const rawAllowedHosts =
        e.MCP_HTTP_ALLOWED_HOSTS ?? defaultLoopbackAllowedHosts().join(",");
    const allowedHosts = [
        ...new Set(
            rawAllowedHosts
                .split(",")
                .map((s) => s.trim())
                .filter((s) => s.length > 0),
        ),
    ];
    if (allowedHosts.length === 0) {
        throw new Error(
            `MCP_HTTP_ALLOWED_HOSTS must contain at least one hostname, got "${rawAllowedHosts}"`,
        );
    }

    // 5. MCP_HTTP_ALLOWED_ORIGINS
    const rawAllowedOrigins =
        e.MCP_HTTP_ALLOWED_ORIGINS ?? defaultLoopbackAllowedOrigins().join(",");
    const allowedOrigins = [
        ...new Set(
            rawAllowedOrigins
                .split(",")
                .map((s) => s.trim())
                .filter((s) => s.length > 0),
        ),
    ];
    if (allowedOrigins.length === 0) {
        throw new Error(
            `MCP_HTTP_ALLOWED_ORIGINS must contain at least one origin, got "${rawAllowedOrigins}"`,
        );
    }

    return {
        token,
        host: rawHost,
        port,
        allowedHosts,
        allowedOrigins,
    };
}

// ---------------------------------------------------------------------------
// Startup diagnostics for allowlist values
// ---------------------------------------------------------------------------

/**
 * Warns about allowlist values that are syntactically valid but can never do
 * what the operator intends.
 *
 * These are warnings, not errors: the server still starts. A running but
 * misconfigured deployment is easier to diagnose than a dead one, and the fix
 * is a configuration edit rather than a code change. Stopping the process here
 * would turn a cosmetic mistake into an outage.
 *
 * Known footguns:
 * - A `Host` entry carrying a scheme or path (e.g. `https://calendar.example.com`).
 *   A Host header never includes a scheme, and `hostMatches` compares literally,
 *   so the entry can never match and that hostname is answered 403.
 * - An `Origin` entry of exactly `*`. A trailing `*` is a suffix wildcard, so the
 *   bare `*` matches every origin and the cross-origin / DNS-rebinding guard is
 *   disabled.
 *
 * @returns the warning messages, so callers (and tests) can assert on them.
 */
export function warnOnSuspiciousAllowlists(
    cfg: Pick<HttpConfig, "allowedHosts" | "allowedOrigins">,
    log: (message: string) => void = console.error,
): string[] {
    const warnings: string[] = [];

    for (const entry of cfg.allowedHosts) {
        if (entry.includes("://") || entry.includes("/")) {
            const bare = entry
                .replace(/^[A-Za-z][A-Za-z0-9+.-]*:\/\//, "")
                .split("/")[0];
            warnings.push(
                `MCP_HTTP_ALLOWED_HOSTS entry "${entry}" is not a bare hostname. A Host ` +
                    `header never includes a scheme or path, so this entry can never match ` +
                    `and that hostname will be rejected with 403. Use "${bare}" instead.`,
            );
        }
    }

    for (const entry of cfg.allowedOrigins) {
        if (entry === "*") {
            warnings.push(
                `MCP_HTTP_ALLOWED_ORIGINS entry "*" matches every Origin value (a trailing ` +
                    `"*" is a suffix wildcard), so the cross-origin and DNS-rebinding guard ` +
                    `is disabled. Set explicit origins, e.g. "https://calendar.example.com".`,
            );
        }
    }

    for (const w of warnings) {
        log(`warning: ${w}`);
    }
    return warnings;
}
