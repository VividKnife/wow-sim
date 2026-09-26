FROM node:24.11.1-bookworm-slim AS deployment-assets
ADD https://codeload.github.com/VividKnife/wow-sim/tar.gz/1d76babd549c97e510857c3568a7a08a00fd52c5 /tmp/source.tar.gz
RUN mkdir /assets && tar -xzf /tmp/source.tar.gz -C /assets --strip-components=4 wow-sim-1d76babd549c97e510857c3568a7a08a00fd52c5/apps/web/public && rm /tmp/source.tar.gz
RUN printf '%s\n' '{"commit":"1d76babd549c97e510857c3568a7a08a00fd52c5","source":"VividKnife/wow-sim","publicAssetVersion":"8c03de098e6a23aef62c44bd0089e4ca1fa76fad"}' > /assets/__deployment.json

FROM node:24.11.1-bookworm-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
COPY packages ./packages
RUN npm ci
COPY apps/web/package.json apps/web/package-lock.json ./apps/web/
RUN npm --prefix apps/web ci
COPY apps/web ./apps/web
COPY --from=deployment-assets /assets ./apps/web/public
RUN npm --prefix apps/web run build

FROM node:24.11.1-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=8080
COPY package.json package-lock.json ./
COPY packages ./packages
RUN npm ci --omit=dev && npm cache clean --force
COPY apps/web/package.json apps/web/package-lock.json ./apps/web/
RUN npm --prefix apps/web ci --omit=dev && npm cache clean --force
COPY --from=build --chown=node:node /app/apps/web/.next ./apps/web/.next
COPY --from=deployment-assets /assets ./apps/web/public
COPY apps/web/next.config.mjs ./apps/web/next.config.mjs
USER node
EXPOSE 8080
WORKDIR /app/apps/web
CMD ["node", "node_modules/next/dist/bin/next", "start", "--hostname", "0.0.0.0"]
