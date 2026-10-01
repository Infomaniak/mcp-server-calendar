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
