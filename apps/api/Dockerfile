FROM node:22-alpine AS builder

WORKDIR /app

ENV CI=true
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0

RUN apk add --no-cache openssl
RUN corepack enable
RUN corepack prepare pnpm@9.15.0 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json eslint.config.mjs ./
COPY packages/shared/package.json packages/shared/package.json
COPY apps/api/package.json apps/api/package.json

RUN pnpm install --frozen-lockfile

COPY packages/shared packages/shared
COPY apps/api apps/api

RUN pnpm --filter @wms-scan/shared build
RUN pnpm --filter @wms-scan/api prisma:generate
RUN pnpm --filter @wms-scan/api build
RUN pnpm --filter @wms-scan/api deploy /prod/api

FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

RUN apk add --no-cache openssl
RUN corepack enable

COPY --from=builder /prod/api /app/apps/api

WORKDIR /app/apps/api

EXPOSE 3000

CMD ["node", "dist/main.js"]
