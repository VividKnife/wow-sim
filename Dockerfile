FROM node:24.11.1-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production PORT=8080
COPY apps/web/server.mjs ./apps/web/server.mjs
COPY apps/web/dist ./apps/web/dist
COPY packages/contracts/src/asset-paths.mjs ./packages/contracts/src/asset-paths.mjs

USER node
EXPOSE 8080
CMD ["node", "apps/web/server.mjs"]
