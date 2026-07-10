# Phase 1 image: runs via tsx. Production build hardening (compiled output,
# multi-stage, non-root) lands in Phase 8 (deployment).
FROM node:22-alpine

RUN corepack enable
WORKDIR /app

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/

RUN pnpm install --frozen-lockfile --filter @bw-ai-chat/api...

COPY packages/shared packages/shared
COPY apps/api apps/api
RUN pnpm --filter @bw-ai-chat/shared build

EXPOSE 3001
CMD ["pnpm", "--filter", "@bw-ai-chat/api", "start"]
