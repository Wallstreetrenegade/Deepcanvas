# Deep Canvas Sidecars (Plunk + Open Design)

Deep Canvas Mail is built from the self-hosted Plunk source vendored in `packages/plunk`.
The Email feature opens that internal mail app instead of using the temporary Deep Canvas
composer wrapper.

## Local Development

Run Deep Canvas:

```bash
npm run dev
```

Run the Plunk dashboard:

```bash
npm run mail:install
npm run mail:dev
```

Deep Canvas loads the Email feature from `http://localhost:3000` by default during local
development. Override it with:

```env
VITE_PLUNK_WEB_URL=http://localhost:3000
```

## Production Shape

For production, serve the Plunk dashboard behind the same VPS and proxy it at `/mail`.
Deep Canvas will use `/mail` by default outside localhost.

Plunk still needs its own runtime services configured for production:

- Postgres
- Redis
- ClickHouse
- S3-compatible storage
- SES or another mail delivery layer
- DNS records for SPF, DKIM, MAIL FROM, and inbound routes

## Source Customizations

The Plunk dashboard sidebar is moved from the left side to the right side in:

```text
packages/plunk/apps/web/src/components/DashboardLayout.tsx
```

Keep Deep Canvas-specific Plunk changes small and isolated so we can still pull upstream
Plunk fixes later.

## Open Design MCP Integration

Open Design is vendored in `packages/open-design` and can be attached to the main agent
as an MCP server. Once enabled, App Builder can call Open Design MCP tools through the
existing main-agent tool path.

### MCP wiring (backend)

- `jiuwenclaw/agentserver/tools/open_design_tools.py` builds MCP config from env.
- `JiuWenClawDeepAdapter` registers the MCP server during create/reload.

### Env flags

```env
OPEN_DESIGN_MCP_ENABLED=1
# Optional transport override: stdio|sse|streamable-http
OPEN_DESIGN_MCP_CLIENT_TYPE=stdio
```

For stdio mode, default command resolution is:

1. Local repo binary: `node packages/open-design/apps/daemon/bin/od.mjs mcp`
2. Fallback: `od mcp` from PATH

### Optional sidecar auto-start

Deep Canvas startup now supports env-gated sidecar processes:

```env
PLUNK_AUTOSTART=1
OPEN_DESIGN_DAEMON_AUTOSTART=1
```

- `PLUNK_AUTOSTART=1` starts `npm run mail:dev`
- `OPEN_DESIGN_DAEMON_AUTOSTART=1` starts `pnpm exec od daemon`

Both are optional and disabled by default to avoid changing existing runtime behavior.
