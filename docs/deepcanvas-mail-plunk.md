# Deep Canvas Mail with Plunk

Deep Canvas keeps the user-facing Email feature. Plunk runs behind it as the internal mail engine for sending, templates, campaigns, contacts, inbound activity, and domain verification.

## Runtime Pieces

- `Deep Canvas`: app UI and feature RPCs.
- `Plunk`: self-hosted mail platform.
- `AWS SES`: outbound delivery and reputation layer.
- `DNS`: SPF, DKIM, MAIL FROM, and inbound routing records from Plunk/SES.

## Deep Canvas Config

Set these in Configuration or the server environment:

```env
EMAIL_ENGINE=plunk
EMAIL_API_BASE=https://mail-api.deepcanvas.ai
EMAIL_API_KEY=sk_replace_with_plunk_secret_key
EMAIL_FROM_ADDRESS=hello@deepcanvas.ai
EMAIL_REPLY_TO=hello@deepcanvas.ai
EMAIL_DOMAIN=deepcanvas.ai
PLUNK_PROJECT_ID=replace_with_project_id_for_domain_sync
```

`PLUNK_SECRET_KEY` can be used instead of `EMAIL_API_KEY`.

## Plunk VPS Setup

Use the included compose file:

```bash
cp docker/plunk.env.example /opt/deepcanvas/plunk/.env
cp docker/plunk.compose.yml /opt/deepcanvas/plunk/docker-compose.yml
cd /opt/deepcanvas/plunk
docker compose --env-file .env up -d
```

Point these DNS records to the VPS:

- `mail-api.deepcanvas.ai`
- `mail.deepcanvas.ai`
- `mail-www.deepcanvas.ai`
- `mail-docs.deepcanvas.ai`
- `smtp.deepcanvas.ai`

Put HTTPS in front of `PLUNK_HTTP_PORT` with Caddy, Nginx, Traefik, or the host panel proxy.

## First Production Checklist

- Create the Plunk admin account.
- Create the Deep Canvas project in Plunk.
- Add the sending domain.
- Add the DNS records Plunk/SES returns.
- Move SES out of sandbox.
- Create a Plunk secret key and add it to Deep Canvas.
- Set `EMAIL_RATE_LIMIT_PER_SECOND` to match SES quota.
- Send a test email from the Email feature.
- Create one template and one campaign from the Email feature.
