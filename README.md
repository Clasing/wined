# Wined

Plataforma multi-tenant de IA para el sector del vino: sommelier digital, gestión de bodega
(cellar), distribución comercial, y curators normativos. Construida como monorepo
pnpm + Turborepo con Next.js 14, Hono API, Drizzle ORM sobre Postgres 16 + pgvector, y un
pipeline de agentes Anthropic con citation gate obligatorio.

Stack: TypeScript estricto, pnpm workspaces, Turbo, Postgres 16 + pgvector, Redis/BullMQ,
Clerk auth, Langfuse + PostHog para observabilidad.
