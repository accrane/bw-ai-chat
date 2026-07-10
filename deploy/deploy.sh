#!/usr/bin/env bash
# Runs on the VPS from the directory holding docker-compose.yml + .env.
# Pulls the latest image, applies migrations, then swaps the api container.
set -euo pipefail
cd "$(dirname "$0")"

docker compose pull api

# Migrations run from the NEW image before it starts serving. `run` also
# starts db (and waits for its healthcheck) if it isn't up yet.
docker compose run --rm api node apps/api/dist/scripts/migrate.js
# Grants LOGIN + password to the unprivileged app_api role (idempotent).
docker compose run --rm api node apps/api/dist/scripts/db-role.js

docker compose up -d --remove-orphans
docker image prune -f >/dev/null

echo "deployed. containers:"
docker compose ps
