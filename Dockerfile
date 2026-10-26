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
# NEXT_PUBLIC_* has to be here, not in fly.toml.
#
# Next inlines these into the client bundle while it compiles; fly.toml's
# [env] block sets the machine's runtime environment, which the already-built
# JavaScript never consults. Declaring them there and nowhere else compiled
# every one of them to `undefined`.
#
# It stayed invisible because the two that existed both had harmless
# fallbacks on the apex domain: NEXT_PUBLIC_APP_URL is mostly read on the
# server, where runtime env does apply, and passkeyRpId() falls back to
# window.location.hostname, which on pokter.xyz is the value the variable
# would have supplied. On www.pokter.xyz it is not — which is the exact case
# the variable was added to handle, so the feature was off precisely where it
# was needed. WalletConnect is what finally showed it: a missing project id
# drops the connector outright, with no fallback to hide behind.
#
# None of these is a secret. Each ships inside the client bundle by
# design, so they are plain build args rather than mounted secrets.
ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_PASSKEY_RP_ID
ARG NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID
# Escrow chains hires may be funded on. Unset means testnet only; "97,56"
# opens mainnet hires, with real money. See src/lib/network/escrow.ts.
ARG NEXT_PUBLIC_ESCROW_CHAINS
# Pay per call over x402. Off unless exactly "true"; see docs/release/x402.md.
ARG NEXT_PUBLIC_X402_ENABLED
# USDT hiring. Off unless exactly "true"; see docs/release/usdt-hiring.md.
ARG NEXT_PUBLIC_USDT_HIRING_ENABLED
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_PASSKEY_RP_ID=$NEXT_PUBLIC_PASSKEY_RP_ID
ENV NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=$NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID
ENV NEXT_PUBLIC_ESCROW_CHAINS=$NEXT_PUBLIC_ESCROW_CHAINS
ENV NEXT_PUBLIC_X402_ENABLED=$NEXT_PUBLIC_X402_ENABLED
ENV NEXT_PUBLIC_USDT_HIRING_ENABLED=$NEXT_PUBLIC_USDT_HIRING_ENABLED
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
ENV DELIVERABLE_DB_PATH=/data/deliverables.db
ENV RATE_LIMIT_DB_PATH=/data/rate-limit.db
ENV NOTIFICATION_DB_PATH=/data/notifications.db
ENV REVIEW_DB_PATH=/data/reviews.db
ENV BUILDER_DB_PATH=/data/builders.db
ENV FUNDER_DB_PATH=/data/funders.db
ENV ASSAY_DB_PATH=/data/assay.db
ENV QUEST_DB_PATH=/data/quest.db
ENV CONVERSION_DB_PATH=/data/conversion.db
ENV SEAL_DB_PATH=/data/seals.db
ENV WALLET_ACTIVITY_DB_PATH=/data/wallet-activity.db
ENV CAPABILITY_DB_PATH=/data/capability.db
ENV FEEDBACK_DB_PATH=/data/feedback.db
ENV BRIEF_DB_PATH=/data/briefs.db
ENV PROFILE_DB_PATH=/data/profiles.db
ENV MAINTENANCE_DB_PATH=/data/maintenance.db
ENV SATURATION_DB_PATH=/data/saturation.db
ENV TRADING_DB_PATH=/data/trading.db
ENV HIRE_ATTEMPT_DB_PATH=/data/hire-attempts.db
ENV PROVIDER_DB_PATH=/data/provider.db
ENV X402_DB_PATH=/data/x402.db

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
