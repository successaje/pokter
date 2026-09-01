# Node 24 specifically: the app persists to node:sqlite, which does not exist
# before 22.5 and is still marked experimental — so the runtime is pinned
# rather than floating on "latest LTS".
FROM node:24-slim AS deps
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
RUN npm ci --ignore-scripts

FROM node:24-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Build-time only: the registry key is baked into nothing, but Next reads
# NEXT_PUBLIC_* at build time and the rest at runtime.
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:24-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=8080
ENV HOSTNAME=0.0.0.0

# Databases live on the mounted volume, not in the image layer.
ENV PROBE_DB_PATH=/data/probes.db
ENV SESSION_DB_PATH=/data/sessions.db
ENV JOB_DB_PATH=/data/jobs.db

RUN groupadd --system --gid 1001 nodejs \
 && useradd --system --uid 1001 --gid nodejs nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# The volume is mounted here at runtime; creating it now means the first boot
# does not race the mount.
RUN mkdir -p /data && chown nextjs:nodejs /data

USER nextjs
EXPOSE 8080

CMD ["node", "server.js"]
