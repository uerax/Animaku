# Animaku — single image: Hono API + Vite SPA
# Build:  docker build -t animaku .
# Run:    docker compose up -d (pull pre-built) OR docker compose -f docker-compose.build.yml up -d --build
#         open http://localhost:$PORT  (default 8787; SPA + /api same origin)

# ---- deps ----
FROM node:22-bookworm-slim AS base
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/
COPY apps/server/package.json apps/server/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --frozen-lockfile

# ---- build frontend + server bundle ----
FROM deps AS build
COPY . .

# Footer / branding is Vite build-time (VITE_*). Pass via --build-arg or compose.
ARG VITE_SITE_URL
ARG VITE_APP_VERSION
ARG VITE_DEFAULT_THEME
ARG VITE_NAV_SHOW_GITHUB
ARG VITE_GITHUB_URL
ARG VITE_GITHUB_LABEL
ARG VITE_PRODUCT_NAME
ARG VITE_SITE_TAGLINE
ARG VITE_MAINTAINER_NAME
ARG VITE_MAINTAINER_URL
ARG VITE_HOMEPAGE_URL
ARG VITE_HOMEPAGE_LABEL
ARG VITE_CONTACT_EMAIL
ARG VITE_FOOTER_NOTE
# Analytics (build-time)
ARG VITE_CLARITY_ID
ARG VITE_GA_ID
ARG VITE_BAIDU_TONGJI_ID
# Bangumi API & Cover image host (build-time)
ARG BANGUMI_API
ARG BANGUMI_IMAGE
ARG VITE_BANGUMI_API_HOST
ARG VITE_BANGUMI_IMAGE_HOST
ENV BANGUMI_API=$BANGUMI_API \
    BANGUMI_IMAGE=$BANGUMI_IMAGE \
    VITE_BANGUMI_API_HOST=$VITE_BANGUMI_API_HOST \
    VITE_BANGUMI_IMAGE_HOST=$VITE_BANGUMI_IMAGE_HOST \
    VITE_CLARITY_ID=$VITE_CLARITY_ID \
    VITE_GA_ID=$VITE_GA_ID \
    VITE_BAIDU_TONGJI_ID=$VITE_BAIDU_TONGJI_ID \
    VITE_SITE_URL=$VITE_SITE_URL \
    VITE_APP_VERSION=$VITE_APP_VERSION \
    VITE_DEFAULT_THEME=$VITE_DEFAULT_THEME \
    VITE_NAV_SHOW_GITHUB=$VITE_NAV_SHOW_GITHUB \
    VITE_GITHUB_URL=$VITE_GITHUB_URL \
    VITE_GITHUB_LABEL=$VITE_GITHUB_LABEL \
    VITE_PRODUCT_NAME=$VITE_PRODUCT_NAME \
    VITE_SITE_TAGLINE=$VITE_SITE_TAGLINE \
    VITE_MAINTAINER_NAME=$VITE_MAINTAINER_NAME \
    VITE_MAINTAINER_URL=$VITE_MAINTAINER_URL \
    VITE_HOMEPAGE_URL=$VITE_HOMEPAGE_URL \
    VITE_HOMEPAGE_LABEL=$VITE_HOMEPAGE_LABEL \
    VITE_CONTACT_EMAIL=$VITE_CONTACT_EMAIL \
    VITE_FOOTER_NOTE=$VITE_FOOTER_NOTE

RUN pnpm --filter @animaku/web build \
 && pnpm --filter @animaku/server build

# ---- runtime native deps (sharp prebuilts for target platform) ----
FROM node:22-bookworm-slim AS prod-deps
WORKDIR /app
RUN npm install --omit=dev sharp@0.35.5 7zip-min@3.0.1 && npm cache clean --force

# ---- runtime (node dist only; no tsx / no full monorepo src) ----
FROM node:22-bookworm-slim AS runner
# 必须配置 UTF-8 语言环境（glibc 原生支持 C.UTF-8），避免 7-Zip (7za) 等底层 C 工具在解压含中日文字符的压缩包时
# 因 POSIX/C 纯 ASCII 编码无法映射字符而强制将文件名替换为 '?'
ENV NODE_ENV=production \
    PORT=8787 \
    HOST=0.0.0.0 \
    WEB_DIST=public \
    DATA_DIR=/app/data \
    TZ=Asia/Shanghai \
    LANG=C.UTF-8 \
    LC_ALL=C.UTF-8

WORKDIR /app

# Ensure data directory exists with correct permissions and install gosu for non-root entrypoint
RUN apt-get update \
 && apt-get install -y --no-install-recommends gosu \
 && rm -rf /var/lib/apt/lists/* \
 && mkdir -p /app/data && chown -R node:node /app/data

# Native modules (sharp) + bundled server JS + SPA assets + entrypoint script
COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/apps/server/dist/index.js ./dist/index.js
COPY --from=build --chown=node:node /app/apps/web/dist ./public
COPY docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh

VOLUME ["/app/data"]

EXPOSE 8787

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8787)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Entrypoint automatically heals /app/data volume permissions and drops privileges to node user
ENTRYPOINT ["/app/docker-entrypoint.sh"]

# cwd=/app so WEB_DIST=public and resolveWebRootRel finds ./public
CMD ["node", "dist/index.js"]
