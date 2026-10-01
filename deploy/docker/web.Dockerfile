# syntax=docker/dockerfile:1
# Build context: repository root.  Targets: dev (compose) and runner (default, last stage).
FROM node:24-alpine AS base
ENV NEXT_TELEMETRY_DISABLED=1 \
    PNPM_HOME=/pnpm
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@12 --activate
WORKDIR /app

# ---- deps: install from the lockfile only ----------------------------------------------------
FROM base AS deps
COPY web/package.json web/pnpm-lock.yaml ./
RUN --mount=type=cache,target=/pnpm/store \
    pnpm install --frozen-lockfile

# ---- dev: Next dev server, code arrives through a bind mount ---------------------------------
FROM deps AS dev
COPY web/ ./
EXPOSE 3000
CMD ["pnpm", "dev", "-H", "0.0.0.0", "-p", "3000"]

# ---- build: standalone production output -----------------------------------------------------
FROM deps AS build
COPY web/ ./
RUN pnpm build

# ---- runner: minimal non-root runtime --------------------------------------------------------
FROM node:24-alpine AS runner
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000
WORKDIR /app
RUN addgroup -S -g 1001 nodejs && adduser -S -u 1001 -G nodejs nextjs
COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=build --chown=nextjs:nodejs /app/public ./public
USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
