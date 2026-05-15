# syntax=docker/dockerfile:1.7
# ---------- Stage 1: prune monorepo to just @wined/api and its deps ----------
FROM node:20-alpine AS pruner
RUN apk add --no-cache libc6-compat
RUN corepack enable && corepack prepare pnpm@9.10.0 --activate
WORKDIR /repo

COPY . .
RUN pnpm dlx turbo@2.1.3 prune @wined/api --docker

# ---------- Stage 2: install deps ----------
FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat python3 make g++
RUN corepack enable && corepack prepare pnpm@9.10.0 --activate
WORKDIR /repo

COPY --from=pruner /repo/out/json/ ./
COPY --from=pruner /repo/out/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=pruner /repo/out/pnpm-workspace.yaml ./pnpm-workspace.yaml
RUN pnpm install --frozen-lockfile

# ---------- Stage 3: build ----------
FROM node:20-alpine AS builder
RUN apk add --no-cache libc6-compat
RUN corepack enable && corepack prepare pnpm@9.10.0 --activate
WORKDIR /repo

COPY --from=deps /repo/ ./
COPY --from=pruner /repo/out/full/ ./
COPY tsconfig.base.json ./tsconfig.base.json
RUN pnpm turbo build --filter=@wined/api...

# ---------- Stage 4: runtime ----------
FROM node:20-alpine AS runner
RUN apk add --no-cache curl tini
RUN addgroup -S wined && adduser -S wined -G wined
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8787

# Copy the full pruned + built workspace (deps are workspace-linked)
COPY --from=builder --chown=wined:wined /repo/ ./

# Migration SQL files (consumed by POST /api/v1/admin/db/migrate at bootstrap)
COPY --chown=wined:wined infra/sql /app/infra/sql

USER wined
EXPOSE 8787

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD curl -fsS http://localhost:8787/health || exit 1

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "apps/api/dist/index.js"]
