FROM node:24.15.0-bookworm-slim AS build

ARG NPM_REGISTRY=https://registry.npmjs.org
ENV CI=true
ENV DATABASE_URL=postgresql://build:build@127.0.0.1:5432/build?schema=public
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
WORKDIR /workspace

RUN apt-get update \
    && apt-get install --yes --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/* \
    && npm install --global pnpm@11.15.1 --no-audit --no-fund --registry="$NPM_REGISTRY"

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/admin-web/package.json apps/admin-web/package.json
COPY apps/api/package.json apps/api/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY packages/config/package.json packages/config/package.json
COPY packages/database/package.json packages/database/package.json
COPY .husky/install.mjs .husky/install.mjs

RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm --config.trust-lockfile=true \
    --fetch-retries=5 \
    --fetch-retry-maxtimeout=120000 \
    --fetch-timeout=300000 \
    --network-concurrency=8 \
    --registry="$NPM_REGISTRY" \
    install --frozen-lockfile \
    --filter . \
    --filter @makeup/api... \
    --filter @makeup/worker... \
    --filter @makeup/admin-web...

COPY . .

RUN pnpm db:client \
    && pnpm --filter @makeup/api build \
    && pnpm --filter @makeup/worker build \
    && pnpm --filter @makeup/admin-web build

FROM node:24.15.0-bookworm-slim AS api

ENV NODE_ENV=production
WORKDIR /workspace

RUN apt-get update \
    && apt-get install --yes --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

COPY --from=build --chown=node:node /workspace/node_modules/ ./node_modules/
COPY --from=build --chown=node:node /workspace/apps/api/package.json ./apps/api/package.json
COPY --from=build --chown=node:node /workspace/apps/api/node_modules/ ./apps/api/node_modules/
COPY --from=build --chown=node:node /workspace/apps/api/dist/ ./apps/api/dist/
COPY --from=build --chown=node:node /workspace/packages/database/package.json ./packages/database/package.json
COPY --from=build --chown=node:node /workspace/packages/database/node_modules/ ./packages/database/node_modules/
COPY --from=build --chown=node:node /workspace/packages/database/dist/ ./packages/database/dist/
COPY --from=build --chown=node:node /workspace/packages/database/generated/ ./packages/database/generated/

RUN mkdir -p /var/lib/makeup-booking/exports \
    && chown -R node:node /var/lib/makeup-booking

USER node
EXPOSE 3000
CMD ["node", "apps/api/dist/main.js"]

FROM node:24.15.0-bookworm-slim AS worker

ENV NODE_ENV=production
WORKDIR /workspace

COPY --from=build --chown=node:node /workspace/node_modules/ ./node_modules/
COPY --from=build --chown=node:node /workspace/apps/worker/package.json ./apps/worker/package.json
COPY --from=build --chown=node:node /workspace/apps/worker/node_modules/ ./apps/worker/node_modules/
COPY --from=build --chown=node:node /workspace/apps/worker/dist/ ./apps/worker/dist/

USER node
CMD ["node", "apps/worker/dist/main.js"]

FROM build AS migrate

ENV NODE_ENV=production
CMD ["pnpm", "db:migrate"]

FROM nginx:1.29.5-alpine3.23 AS gateway

COPY deploy/nginx.conf /etc/nginx/nginx.conf
COPY deploy/security-headers.conf /etc/nginx/security-headers.conf
COPY --from=build /workspace/apps/admin-web/dist/ /usr/share/nginx/html/

EXPOSE 80 443

FROM nginx:1.29.5-alpine3.23 AS gateway-http

COPY deploy/nginx.http.conf /etc/nginx/nginx.conf
COPY deploy/security-headers-http.conf /etc/nginx/security-headers.conf
COPY --from=build /workspace/apps/admin-web/dist/ /usr/share/nginx/html/

EXPOSE 80
