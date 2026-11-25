# ARGOS 003 (T433; REQ-CLD-001, REQ-SEC-005, NFR-CLD-011). Imagen multi-etapa sin secretos.
# Base fijada por digest del índice multi-arquitectura de node:22.23.4-slim (.nvmrc = 22.23.4), verificado el 2026-11-16
# con `docker buildx imagetools inspect node:22.23.4-slim`. Existe 22.23.5; se mantiene 22.23.4 (H-MERO-015).

# ---- Etapa de build: instala todo, produce dist/ (vite build) y dist-server/ (esbuild, D-07 = A) ----
FROM node:22.23.4-slim@sha256:5ec23b7c622b00547753bc6ffd78085dd868a68aeb41c8e0a1418f033e13d96d AS build
WORKDIR /app
COPY package.json package-lock.json ./
# Sin scripts de instalación: no se compila better-sqlite3 (external; con postgres no se carga) ni se ejecuta código de paquetes.
RUN npm ci --ignore-scripts
COPY tsconfig.json vite.config.ts postcss.config.js tailwind.config.ts index.html admin.html ./
COPY scripts/build-server.mjs scripts/build-server.mjs
COPY public public
COPY src src
RUN node scripts/build-server.mjs --outdir dist-server && ./node_modules/.bin/vite build

# ---- Etapa final: solo el bundle y los estáticos; sin node_modules, sin npm y sin better-sqlite3 ----
FROM node:22.23.4-slim@sha256:5ec23b7c622b00547753bc6ffd78085dd868a68aeb41c8e0a1418f033e13d96d
# esbuild empaqueta todas las dependencias de ejecución salvo better-sqlite3 (REQ-PG-010): con postgres no hace falta.
# Se retiran npm, npx, corepack y yarn (superficie de ataque y tamaño, NFR-CLD-011).
RUN rm -rf /usr/local/lib/node_modules /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack /opt/yarn*
ENV NODE_ENV=production
ENV ARGOS_DB_DRIVER=postgres
ENV HOST=0.0.0.0
ENV PORT=8080
# Los secretos (DATABASE_URL, ARGOS_AUDIT_HMAC_SECRET, ...) los inyecta Cloud Run en tiempo de ejecución; nunca en la imagen.
WORKDIR /app
COPY --from=build /app/dist-server ./dist-server
COPY --from=build /app/dist ./dist
# Archivos de root y de solo lectura para el proceso; la única escritura permitida es /tmp.
USER 1000:1000
EXPOSE 8080
CMD ["node", "dist-server/server.js"]
