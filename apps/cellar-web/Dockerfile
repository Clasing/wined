# syntax=docker/dockerfile:1.7
FROM node:20-alpine AS pruner
RUN apk add --no-cache libc6-compat
RUN corepack enable && corepack prepare pnpm@9.10.0 --activate
WORKDIR /repo
COPY . .
RUN pnpm dlx turbo@2.1.3 prune @wined/cellar-web --docker

FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat python3 make g++
RUN corepack enable && corepack prepare pnpm@9.10.0 --activate
WORKDIR /repo
COPY --from=pruner /repo/out/json/ ./
COPY --from=pruner /repo/out/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=pruner /repo/out/pnpm-workspace.yaml ./pnpm-workspace.yaml
RUN pnpm install --frozen-lockfile

FROM node:20-alpine AS builder
RUN apk add --no-cache libc6-compat
RUN corepack enable && corepack prepare pnpm@9.10.0 --activate
WORKDIR /repo
COPY --from=deps /repo/ ./
COPY --from=pruner /repo/out/full/ ./
COPY tsconfig.base.json ./tsconfig.base.json
ENV NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_placeholder_replace_at_runtime_xxxxxxxxxxxxxxxxxxx
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm turbo build --filter=@wined/cellar-web...

FROM node:20-alpine AS runner
RUN apk add --no-cache curl tini
RUN addgroup -S wined && adduser -S wined -G wined
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=builder --chown=wined:wined /repo/apps/cellar-web/.next/standalone ./
COPY --from=builder --chown=wined:wined /repo/apps/cellar-web/.next/static ./apps/cellar-web/.next/static
COPY --from=builder --chown=wined:wined /repo/apps/cellar-web/public ./apps/cellar-web/public

USER wined
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS http://localhost:3000/ -o /dev/null || exit 1

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "apps/cellar-web/server.js"]
