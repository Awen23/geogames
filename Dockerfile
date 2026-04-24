# syntax=docker/dockerfile:1

FROM node:22-alpine AS builder
WORKDIR /app

COPY tsconfig.base.json ./
COPY shared ./shared
COPY api/package.json api/package-lock.json ./api/
COPY web/package.json web/package-lock.json ./web/
COPY api ./api
COPY web ./web

RUN npm ci --prefix api && npm ci --prefix web

ARG VITE_MAPTILER_API_KEY
ENV VITE_MAPTILER_API_KEY=${VITE_MAPTILER_API_KEY}
ENV NODE_ENV=production

RUN npm run build --prefix web
RUN npm run build --prefix api

FROM node:22-alpine AS runner
WORKDIR /app/api

ENV NODE_ENV=production
ENV PORT=3001

COPY --from=builder /app/api/package.json ./
COPY --from=builder /app/api/package-lock.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/api/dist ./dist
COPY --from=builder /app/api/drizzle ./drizzle
COPY --from=builder /app/api/src/data/csv ./data/csv
COPY --from=builder /app/web/dist /app/web/dist

EXPOSE 3001
CMD ["node", "dist/index.cjs"]
