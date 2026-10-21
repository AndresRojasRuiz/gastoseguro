# syntax=docker/dockerfile:1.7
# -----------------------------------------------------------------------------------------
# GastoSeguro - imagen de producción (A02, A03 y A08:2025)
#  - Imágenes base fijadas por digest (inmutables y verificables).
#  - Construcción multi-etapa: la imagen final no contiene compiladores, código fuente ni
#    dependencias de desarrollo (menor superficie de ataque).
#  - Ejecución como usuario sin privilegios ("node") y con sistema de ficheros de solo lectura
#    (ver docker-compose.yml).
# -----------------------------------------------------------------------------------------
ARG NODE_IMAGE=node:24-alpine@sha256:ebfe2f90462722a7a4de65e91990e97fe0d401c70e0e762c5b53302f905ec1c1

# ---- Etapa 1: compilación ----------------------------------------------------------------
FROM ${NODE_IMAGE} AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json backend/
COPY frontend/package.json frontend/
RUN npm ci --no-audit --no-fund
COPY . .
ENV DB_PROVIDER=postgresql
RUN npm run build -w frontend \
 && cd backend \
 && DATABASE_URL=postgresql://build:build@localhost:5432/build npx prisma generate \
 && npx tsc -p tsconfig.build.json

# ---- Etapa 2: dependencias de ejecución --------------------------------------------------
FROM ${NODE_IMAGE} AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json backend/
COPY frontend/package.json frontend/
RUN npm ci --omit=dev --workspace backend --no-audit --no-fund && npm cache clean --force

# ---- Etapa 3: imagen final ---------------------------------------------------------------
FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production \
    PORT=4000 \
    STATIC_DIR=/app/frontend/dist \
    UPLOAD_DIR=/app/backend/storage/receipts
WORKDIR /app
COPY --from=deps --chown=root:root /app/node_modules ./node_modules
COPY --from=build --chown=root:root /app/backend/package.json ./backend/package.json
COPY --from=build --chown=root:root /app/backend/dist ./backend/dist
COPY --from=build --chown=root:root /app/frontend/dist ./frontend/dist
RUN mkdir -p /app/backend/storage/receipts && chown -R node:node /app/backend/storage
WORKDIR /app/backend
USER node
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:4000/api/health || exit 1
CMD ["node", "dist/server.js"]
