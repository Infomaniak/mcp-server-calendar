#!/usr/bin/env node

import {StdioServerTransport} from "@modelcontextprotocol/sdk/server/stdio.js";
import {createCalendarMcpServer} from "./mcp-server.js";

const token = process.env.CALENDAR_TOKEN;

if (!token) {
    console.error(
        "Please set CALENDAR_TOKEN environment variable",
    );
    process.exit(1);
}

const server = createCalendarMcpServer(token);

async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
}

main().catch((error) => {
    console.error("Fatal error in main():", error);
    process.exit(1);
});
