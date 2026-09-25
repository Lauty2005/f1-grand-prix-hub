# syntax=docker/dockerfile:1

# ── base ────────────────────────────────────────────────────────────────────
FROM node:22-alpine AS base
WORKDIR /app
COPY package*.json ./
RUN npm ci

# ── dev ─────────────────────────────────────────────────────────────────────
# El código llega por bind mount (ver docker-compose.yml), no se copia.
# --legacy-watch: en bind mounts desde Windows/macOS los eventos inotify no
# llegan al contenedor, así que nodemon tiene que hacer polling.
FROM base AS dev
ENV NODE_ENV=development
EXPOSE 3000
CMD ["npx", "nodemon", "--legacy-watch", "server.js"]

# ── prod ────────────────────────────────────────────────────────────────────
FROM node:22-alpine AS prod
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
USER node
EXPOSE 3000
CMD ["node", "server.js"]
