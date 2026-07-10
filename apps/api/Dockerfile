# Production image. Build from the repo root:
#   docker build -f apps/api/Dockerfile -t bw-ai-chat-api .
# Compiles everything to plain JS (no tsx in prod) and bakes the widget +
# dashboard bundles in; the API serves them same-origin.

FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /app

# Manifests first so the dependency layer caches across source-only changes.
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/widget/package.json packages/widget/
COPY apps/api/package.json apps/api/
COPY apps/dashboard/package.json apps/dashboard/
RUN pnpm install --frozen-lockfile

COPY packages packages
COPY apps/api apps/api
COPY apps/dashboard apps/dashboard
RUN pnpm -r build

FROM node:22-alpine
RUN corepack enable && apk add --no-cache tini
WORKDIR /app
ENV NODE_ENV=production

# Prod deps only (api + its workspace deps); same lockfile as the build stage.
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
RUN pnpm install --prod --frozen-lockfile --filter @bw-ai-chat/api...

COPY --from=build /app/packages/shared/dist packages/shared/dist
COPY --from=build /app/apps/api/dist apps/api/dist
COPY --from=build /app/packages/widget/dist static/widget
COPY --from=build /app/apps/dashboard/dist static/dashboard
COPY supabase/migrations migrations

# Compiled output lives at a different depth than src/, so point the static
# and migration paths at the baked-in copies.
ENV WIDGET_DIST_DIR=/app/static/widget \
    DASHBOARD_DIST_DIR=/app/static/dashboard \
    MIGRATIONS_DIR=/app/migrations \
    PORT=3001

USER node
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s \
  CMD wget -qO- http://127.0.0.1:3001/health || exit 1
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "apps/api/dist/src/server.js"]
