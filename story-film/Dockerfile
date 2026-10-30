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
# Python + MediaPipe find the creator's face and outline for "Edit my video" effects (EGL/GLES are
# loaded by MediaPipe even on CPU).
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg ca-certificates tini python3 python3-venv libegl1 libgles2 \
  && rm -rf /var/lib/apt/lists/*
COPY vision/requirements.txt /tmp/vision-requirements.txt
RUN python3 -m venv /opt/vision \
  && /opt/vision/bin/pip install --no-cache-dir -r /tmp/vision-requirements.txt \
  && rm /tmp/vision-requirements.txt
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 OUTPUT_DIR=/app/output FONTS_DIR=/app/assets/fonts \
  PYTHON=/opt/vision/bin/python VISION_DIR=/app/vision
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY package.json package-lock.json next.config.ts tsconfig.json drizzle.config.ts ./
COPY src ./src
COPY drizzle ./drizzle
COPY assets ./assets
COPY vision ./vision
COPY public ./public
RUN mkdir -p /app/output && chown node:node /app/output
USER node
EXPOSE 3000
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["npx", "next", "start", "-H", "0.0.0.0", "-p", "3000"]
