# Production deployment

Target: the existing Hostinger KVM 2 VPS (2 CPU / 8 GB) already running n8n.
The n8n compose project's **Traefik** owns ports 80/443 and terminates TLS;
our API container joins its `n8n_default` docker network and registers the
route `https://chat.bellaworksweb.com` via labels — n8n is never touched.

```
Traefik (n8n project, ports 80/443)
  ├── automation.bellaworksweb.com → n8n
  └── chat.bellaworksweb.com      → bw-ai-chat api ── internal network ── postgres (pgvector)
                                                                            └── nightly pg_dump → ./backups
```

The image bundles everything: compiled API, widget bundle (`/widget.js`,
`/widget/v1.js`), admin dashboard (`/admin`), and the SQL migrations. The
only persistent state on the VPS is the Postgres volume and the backups dir.

---

## One-time setup

### 1. GitHub repo + Actions secrets

```bash
# from the repo root (installs: brew install gh)
gh repo create bw-ai-chat --private --source . --push
```

Generate a deploy SSH key and add it to the VPS and to GitHub:

```bash
ssh-keygen -t ed25519 -f ~/.ssh/bw-chat-deploy -N "" -C "gh-actions-deploy"
ssh-copy-id -i ~/.ssh/bw-chat-deploy.pub root@<VPS_IP>
```

In the GitHub repo → Settings → Secrets and variables → Actions, add:

| Secret        | Value                                  |
| ------------- | -------------------------------------- |
| `VPS_HOST`    | the VPS IP                             |
| `VPS_USER`    | `root` (or your VPS user)              |
| `VPS_SSH_KEY` | contents of `~/.ssh/bw-chat-deploy` (the private key) |

### 2. DNS (hPanel)

Domains → bellaworksweb.com → DNS: add an **A record** `chat` → VPS IP
(copy the value from the existing `automation` record). Wait for it to
resolve: `dig +short chat.bellaworksweb.com`.

### 3. VPS directory + secrets

```bash
ssh root@<VPS_IP>
mkdir -p /opt/bw-ai-chat && cd /opt/bw-ai-chat
```

Copy `deploy/docker-compose.yml`, `deploy/deploy.sh`, and `deploy/.env.example`
from the repo (scp or paste), then:

```bash
cp .env.example .env && chmod 600 .env && chmod +x deploy.sh
```

Fill every value in `.env` — each has a generation command in the comments
(`openssl rand -base64 ...`). Set `API_IMAGE=ghcr.io/<github-username>/bw-ai-chat-api:latest`.

The GHCR image is private, so log docker in once (PAT with `read:packages`
from GitHub → Settings → Developer settings → Tokens (classic)):

```bash
docker login ghcr.io -u <github-username>   # paste the PAT as password
```

### 4. First deploy

Push to `main` (or run the "Build and deploy" workflow manually). It builds
the image, pushes to GHCR, and runs `/opt/bw-ai-chat/deploy.sh` over SSH,
which applies migrations before starting the API. Then verify:

```bash
curl https://chat.bellaworksweb.com/health     # {"ok":true,"db":"up"}
```

### 5. First admin + first client

```bash
cd /opt/bw-ai-chat
docker compose run --rm api node apps/api/dist/scripts/create-admin.js austin@bellaworksweb.com '<strong password>' 'Austin'
```

Log into `https://chat.bellaworksweb.com/admin`, create the client, copy its
`bw_sk_...` API key, then in the client site's WP admin (BW AI Chat settings)
set the API URL to `https://chat.bellaworksweb.com` and paste the key.

---

## Routine operations

| Task              | Command                                                              |
| ----------------- | -------------------------------------------------------------------- |
| Deploy            | push to `main` (or Actions → Build and deploy → Run workflow)        |
| Manual deploy     | `ssh root@<VPS_IP> /opt/bw-ai-chat/deploy.sh`                        |
| API logs          | `docker compose -f /opt/bw-ai-chat/docker-compose.yml logs -f api`   |
| Restart API       | `docker compose -f /opt/bw-ai-chat/docker-compose.yml restart api`   |
| Rollback          | set `API_IMAGE=ghcr.io/<user>/bw-ai-chat-api:<old-sha>` in `.env`, run `./deploy.sh` |

Every push to `main` also tags the image with the commit SHA, so any previous
build can be pinned for rollback.

## Backups & restore

`db-backup` runs `pg_dump` nightly into `/opt/bw-ai-chat/backups/` with
rotation (7 daily, 4 weekly, 3 monthly). The knowledge base re-syncs from
WordPress, so worst case is losing chat history since the last dump.

**Offsite**: Hostinger's weekly VPS snapshot covers the dumps directory for
free. For tighter coverage, add an `rclone` cron to any cheap object storage
(Backblaze B2, Cloudflare R2) syncing `/opt/bw-ai-chat/backups/daily/`.

**Restore drill** (run it once now, not during an outage):

```bash
cd /opt/bw-ai-chat
docker compose stop api
gunzip -c backups/daily/postgres-latest.sql.gz | docker compose exec -T db psql -U postgres -d postgres
docker compose run --rm api node apps/api/dist/scripts/db-role.js
docker compose start api
```

(For a truly fresh database — new volume — run `./deploy.sh` instead of the
last two lines; it applies migrations and role grants before starting.)

## Widget version bump

`/widget/v1.js` is served with immutable 1-year caching in production. If a
widget change must reach **existing** embeds, bump the bundle: rename the
vite output to `v2.js` (`packages/widget/vite.config.ts`) and update the
loader (`packages/widget/public/widget.js`) to inject `/widget/v2.js`. The
loader URL itself (`/widget.js`, 5-min cache) never changes — client sites
never edit their embed code.

## Client onboarding checklist

1. Dashboard → create client (slug, allowed domains, branding).
2. Copy the `bw_sk_...` API key.
3. Client WP site: install the `wordpress-plugin/bw-ai-chat` plugin, set API
   URL + key in Settings → BW AI Chat, choose bubble or `[bw_ai_chat]`
   shortcode placement.
4. Publish/update a post to trigger the first content sync; confirm documents
   appear in the dashboard's knowledge tab.
5. Ask a test question on the client site; confirm sources cite their pages.
