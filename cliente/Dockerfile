# Imagen del frontend. Un solo Dockerfile con dos etapas de arranque: `dev`
# (Vite con HMR) y `production` (artefacto de adapter-node). Se elige con
# `build.target` desde compose; la ultima etapa es el default.

FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci --ignore-scripts
COPY . .
RUN npm run build

# --- dev: Vite con HMR y el codigo montado --------------------------------
# Mismo puerto que produccion (4173) para que la URL no cambie entre modos.
FROM node:22-alpine AS dev
WORKDIR /app
ENV NODE_ENV=development
# node_modules sale del build para no montar cientos de MB desde el anfitrion.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
EXPOSE 4173
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "4173"]

# --- production ---
FROM node:22-alpine AS production
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=4173
COPY --from=build /app/build ./build
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
EXPOSE 4173
CMD ["node", "build"]
