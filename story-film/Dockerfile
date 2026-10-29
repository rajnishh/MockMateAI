# One image for the web app, the worker and database migrations (see deploy/docker-compose.yml).
FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS build
ENV NEXT_TELEMETRY_DISABLED=1
COPY . .
RUN npm run build

FROM node:22-bookworm-slim AS runtime
# FFmpeg renders the videos; tini forwards signals so jobs shut down cleanly.
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg ca-certificates tini \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 OUTPUT_DIR=/app/output FONTS_DIR=/app/assets/fonts
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY package.json package-lock.json next.config.ts tsconfig.json drizzle.config.ts ./
COPY src ./src
COPY drizzle ./drizzle
COPY assets ./assets
COPY public ./public
RUN mkdir -p /app/output && chown node:node /app/output
USER node
EXPOSE 3000
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["npx", "next", "start", "-H", "0.0.0.0", "-p", "3000"]
