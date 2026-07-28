# Deep Canvas production launch

The supported first deployment target is the Render blueprint in `render.yaml`. It runs
the compiled Deep Canvas UI, the JiuWenClaw-derived Python runtime, and Open Design in
one authenticated web service. Persistent account and workspace data lives on the
mounted `/var/data` disk.

## Before deploying

1. Push the reviewed launch branch to the private GitHub repository.
2. Create a Render Blueprint from that repository.
3. Confirm the service has the 10 GB persistent disk mounted at `/var/data`.
4. Keep `DEEPCANVAS_REQUIRE_WEB_AUTH=true`.
5. Initially keep `DEEPCANVAS_ALLOW_SIGNUPS=true` so both owners can register.
6. Configure feature credentials either in each user's settings or as service
   environment variables. Common variables are `APIFY_API_KEY`,
   `UPLOAD_POST_API_KEY`, `PLUNK_SECRET_KEY`, `PLUNK_PROJECT_ID`, and
   `EMAIL_DOMAIN`.

Do not put API keys in Git, `render.yaml`, Docker build arguments, or frontend `VITE_*`
variables. A `VITE_*` value is shipped to every browser.

## First-login sequence

1. Open the Render URL and create the owner account.
2. Create the partner account in a separate browser profile or private window.
3. Verify each account can add a uniquely named test lead and cannot see the other
   account's lead.
4. Change `DEEPCANVAS_ALLOW_SIGNUPS` to `false` in Render and redeploy.
5. Verify existing accounts can sign in and new registration returns
   `SIGNUPS_DISABLED`.

## Verification

Render uses `/health` for its health check. For a complete authenticated smoke test
against a disposable or staging deployment, run:

```bash
python scripts/smoke_live_stack.py \
  --url wss://YOUR-HOST/ws \
  --origin https://YOUR-HOST
```

The script creates two temporary accounts, verifies authentication enforcement and
CRM isolation, and checks that Lead Gen and Email RPCs are reachable. Do not run it
against production after registrations have been closed.

## Email limitation

The main Render service intentionally sets `PLUNK_AUTOSTART=false`. The vendored Plunk
application requires Postgres, Redis, ClickHouse, S3-compatible storage, and an email
delivery provider, so it is not safely embedded in this single container. The backend
Email state and provider APIs still work, but the full `/mail` dashboard requires a
separate Plunk deployment and `PLUNK_WEB_PROXY_TARGET` pointing to it. See
`docs/deepcanvas-mail-plunk.md`.

## Operations

- Back up `/var/data` before runtime upgrades or migrations.
- Test upgrades on a staging disk copy before production.
- Keep production logs free of secrets; auth tokens are sent in WebSocket request
  bodies, not URL query strings.
- Run the Python unit suite and frontend build before every deployment.
- The current production image includes the full vendored Open Design workspace and
  is approximately 1.7 GB. It works, but trimming desktop-only dependencies is a
  future image-size optimization.
