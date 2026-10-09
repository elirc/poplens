# Web + worker image (compose picks the command).
# No `next build` here: the production build prerenders public pages from the
# database, which is only reachable at runtime — compose's web service runs
# `pnpm build` on boot (cached in the nextbuild volume).
FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml ./
COPY patches ./patches
RUN pnpm install --frozen-lockfile

FROM base AS runner
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY . .
EXPOSE 3000
CMD ["pnpm", "start"]
