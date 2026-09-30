FROM node:24.11.1-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages ./packages
RUN npm ci
COPY apps/web/package.json apps/web/package-lock.json ./apps/web/
RUN npm --prefix apps/web ci
COPY apps/web ./apps/web
# Local/container builds are self-contained. Production deploys use the exact
# CI artifact and a generated runtime-only Dockerfile (publish-zeabur.mjs).
RUN npm --prefix apps/web run build
FROM node:24.11.1-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production PORT=8080
COPY --from=build /app/apps/web/dist ./apps/web/dist
COPY apps/web/public ./apps/web/public
COPY apps/web/server.mjs ./apps/web/server.mjs
COPY packages/contracts/src/asset-paths.mjs ./packages/contracts/src/asset-paths.mjs
USER node
EXPOSE 8080
CMD ["node", "apps/web/server.mjs"]
