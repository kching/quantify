# syntax=docker/dockerfile:1

FROM oven/bun:1.3.14-alpine AS dependencies
WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

FROM oven/bun:1.3.14-alpine AS builder
WORKDIR /app

COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
RUN bun run build

FROM oven/bun:1.3.14-alpine AS runner
WORKDIR /app

ARG APP_UID=1001
ARG APP_GID=1001

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup --system --gid "${APP_GID}" quantify \
  && adduser --system --uid "${APP_UID}" --ingroup quantify quantify \
  && mkdir -p /app/data \
  && chown -R quantify:quantify /app

COPY --from=builder --chown=quantify:quantify /app/public ./public
COPY --from=builder --chown=quantify:quantify /app/.next/standalone ./
COPY --from=builder --chown=quantify:quantify /app/.next/static ./.next/static

USER quantify
VOLUME ["/app/data"]
EXPOSE 3000

CMD ["bun", "server.js"]
