#!/usr/bin/env node

import {createCalendarMcpServer} from "./mcp-server.js";
import {resolveHttpConfig} from "./http-config.js";
import {startHttpService} from "./http-server.js";

let handle: Awaited<ReturnType<typeof startHttpService>> | undefined;

async function main() {
    const cfg = resolveHttpConfig();
    handle = await startHttpService({
        ...cfg,
        serverFactory: createCalendarMcpServer,
    });
    const addr = handle.address();
    console.error(`listening on http://${addr?.host}:${addr?.port}/mcp`);

    for (const sig of ["SIGINT", "SIGTERM"] as const) {
        process.on(sig, () => {
            handle?.shutdown(sig).then((r) => process.exit(r.exitCode));
        });
    }
}

main().catch((err) => {
    console.error("fatal:", err);
    process.exit(1);
});
