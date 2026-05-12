# syntax=docker/dockerfile:1.7
# ---------- Stage 1: prune ----------
FROM node:20-alpine AS pruner
RUN apk add --no-cache libc6-compat
RUN corepack enable && corepack prepare pnpm@9.10.0 --activate
WORKDIR /repo
COPY . .
RUN pnpm dlx turbo@2.1.3 prune @wined/sommelier-web --docker

# ---------- Stage 2: deps ----------
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
# Clerk requires public env at build time; pass a stub so build doesn't crash.
ENV NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_placeholder_replace_at_runtime_xxxxxxxxxxxxxxxxxxx
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm turbo build --filter=@wined/sommelier-web...

# ---------- Stage 4: runtime ----------
FROM node:20-alpine AS runner
RUN apk add --no-cache curl tini
RUN addgroup -S wined && adduser -S wined -G wined
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV NEXT_TELEMETRY_DISABLED=1

# Next.js standalone output: server + minimal deps
COPY --from=builder --chown=wined:wined /repo/apps/sommelier-web/.next/standalone ./
COPY --from=builder --chown=wined:wined /repo/apps/sommelier-web/.next/static ./apps/sommelier-web/.next/static
COPY --from=builder --chown=wined:wined /repo/apps/sommelier-web/public ./apps/sommelier-web/public

USER wined
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS http://localhost:3000/ -o /dev/null || exit 1

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "apps/sommelier-web/server.js"]
