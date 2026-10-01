# HTTP transport

The Calendar MCP server exposes the
[MCP Streamable HTTP transport](https://modelcontextprotocol.io) on a single
endpoint:

```
POST/GET/DELETE  http://$MCP_HTTP_HOST:$MCP_HTTP_PORT/mcp
```

This document is the canonical reference for HTTP deployment. It is kept out
of the upstream `README.md` on purpose: the upstream project edits its README
on every tool addition, so we keep ours byte-identical with upstream and
document HTTP-only behaviour here.

## What runs in the image

The published Docker image (`infomaniak/mcp-server-calendar`) starts the HTTP
server out of the box. No entrypoint override is required:

- `ENTRYPOINT ["node", "dist/http.js"]`
- `EXPOSE 4500`
- The image also sets `MCP_HTTP_HOST=0.0.0.0` and `MCP_HTTP_PORT=4500` via
  the `Dockerfile`, so the listen socket is reachable from outside the
  container without extra `-e` flags.

## Quick start

Run the image and publish the port:

```bash
docker run --rm -p 4500:4500 \
  -e CALENDAR_TOKEN \
  infomaniak/mcp-server-calendar
```

Point your MCP client at `http://localhost:4500/mcp`. The server speaks the
Streamable HTTP transport, so a single POST establishes the session and
subsequent requests reuse it.

### docker compose

A drop-in service block:

```yaml
services:
  calendar-mcp:
    image: infomaniak/mcp-server-calendar
    restart: unless-stopped
    ports:
      - "4500:4500"
    environment:
      CALENDAR_TOKEN: ${CALENDAR_TOKEN}
      # Optional — only set these if you need to override the image defaults.
      # MCP_HTTP_HOST: 0.0.0.0
      # MCP_HTTP_PORT: 4500
      # MCP_HTTP_ALLOWED_HOSTS: calendar.example.com,127.0.0.1,localhost
      # MCP_HTTP_ALLOWED_ORIGINS: https://calendar.example.com
```

The image already binds to `0.0.0.0` and exposes `4500`, so you do not need
to override the entrypoint in compose.

## Required environment variable

| Variable         | Required | Notes                                                                  |
| ---------------- | -------- | ---------------------------------------------------------------------- |
| `CALENDAR_TOKEN` | yes      | Infomaniak API token with the `workspace:calendar user_info` scope. See the upstream `README.md` for how to create one. |

The server refuses to start without a valid `CALENDAR_TOKEN`.

## HTTP transport variables

| Variable                 | Default in image | Default in `node dist/http.js` | Notes                                                                                                          |
| ------------------------ | ---------------- | ------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| `MCP_HTTP_HOST`          | `0.0.0.0`        | `127.0.0.1`                    | Bind address for the HTTP listener.                                                                            |
| `MCP_HTTP_PORT`          | `4500`           | `4500`                         | TCP port the HTTP listener binds to. Must be an integer in `1..65535`.                                         |
| `MCP_HTTP_ALLOWED_HOSTS` | unset            | unset                          | Optional comma-separated allowlist of accepted `Host` header values. If unset, loopback hostnames are allowed (`127.0.0.1`, `localhost`, `[::1]`). |
| `MCP_HTTP_ALLOWED_ORIGINS` | unset          | unset                          | Optional comma-separated allowlist of accepted `Origin` header values. A trailing `*` is treated as a suffix wildcard (e.g. `http://127.0.0.1:*` matches any port on that host). If unset, the loopback origins with `:*` are allowed. |

## Host and origin validation

Before the Streamable HTTP handler runs, the server checks the `Host` and
`Origin` request headers against the allowlists above. This is a defence
against DNS rebinding and cross-origin abuse from a browser.

- A request with a `Host` header that is not in `MCP_HTTP_ALLOWED_HOSTS` (and
  is not one of the loopback defaults) is rejected with **`403 Forbidden`**.
- A request with an `Origin` header that is not in `MCP_HTTP_ALLOWED_ORIGINS`
  is rejected with **`403 Forbidden`**. Requests without an `Origin` header
  (e.g. most server-to-server clients) are passed through.
- `Origin` values may use a trailing `*` as a suffix wildcard. `Host` values
  are matched literally.

When deploying behind a reverse proxy, set `MCP_HTTP_ALLOWED_HOSTS` and
`MCP_HTTP_ALLOWED_ORIGINS` to the public hostname(s) you serve the MCP
endpoint on. If the proxy terminates TLS, the values must be the
browser-visible origin (`https://calendar.example.com`), not the internal
upstream address.

## Falling back to stdio

The unchanged stdio entry point (`node dist/index.js`) is still shipped in
the image. It is useful for clients that only speak stdio (e.g. Claude
Desktop configured with `command: docker run ...`).

To run stdio from the published image, override the entrypoint at runtime:

```bash
docker run --rm -i \
  -e CALENDAR_TOKEN \
  --entrypoint node \
  infomaniak/mcp-server-calendar \
  dist/index.js
```

This is an optional escape hatch. Normal HTTP deployment does not need it,
and you should not set it in `docker-compose.yml` for the HTTP service.

## See also

- `.env.example` for a copy-pasteable environment file.
- `docs/adr-001-stdio-to-http.md` for the design decision that introduced the
  HTTP transport.
- Upstream `README.md` for the tool catalogue, Claude Desktop configuration,
  and the `CALENDAR_TOKEN` setup steps.
