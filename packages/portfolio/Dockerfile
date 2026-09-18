# syntax=docker/dockerfile:1
#
# Build from the repo root: docker build -f packages/portfolio/Dockerfile .
FROM oven/bun:1.3.11 AS build

WORKDIR /app

COPY package.json bun.lock ./
COPY packages/portfolio/package.json ./packages/portfolio/
COPY packages/assert/package.json ./packages/assert/
COPY packages/infra/package.json ./packages/infra/
COPY packages/logger/package.json ./packages/logger/
COPY packages/object-store/package.json ./packages/object-store/
COPY packages/openrouter/package.json ./packages/openrouter/
COPY packages/secret-store/package.json ./packages/secret-store/
COPY packages/secret-string/package.json ./packages/secret-string/
COPY packages/turborepo-remote-cache/package.json ./packages/turborepo-remote-cache/
COPY packages/vault/package.json ./packages/vault/
COPY packages/workstation/package.json ./packages/workstation/
COPY packages/9router/package.json ./packages/9router/

RUN bun install --frozen-lockfile

COPY packages/portfolio ./packages/portfolio

WORKDIR /app/packages/portfolio

RUN bun run build

FROM nginx:alpine

LABEL org.opencontainers.image.source=https://github.com/crvouga/workspace
LABEL org.opencontainers.image.description="chrisvouga.dev portfolio static site"

RUN rm /etc/nginx/conf.d/default.conf
COPY packages/portfolio/nginx.conf /etc/nginx/conf.d/

COPY --from=build /app/packages/portfolio/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
