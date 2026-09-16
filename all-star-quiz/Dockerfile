FROM node:22.22.0-bookworm-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY prisma ./prisma
ENV DATABASE_URL=postgresql://build:build@localhost/build DIRECT_URL=postgresql://build:build@localhost/build
RUN npm ci
COPY src ./src
COPY tsconfig.json ./
RUN npm run realtime:build && npm prune --omit=dev --ignore-scripts

FROM node:22.22.0-bookworm-slim AS runtime
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production PORT=10000
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/prisma ./prisma
COPY --from=build --chown=node:node /app/.realtime ./.realtime
COPY --from=build --chown=node:node /app/package.json ./package.json
USER node
EXPOSE 10000
CMD ["node", ".realtime/server.cjs"]
