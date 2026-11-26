# Imagen multi-etapa: compila el proyecto SvelteKit y ejecuta el servidor con Node
FROM node:22-alpine AS build
WORKDIR /app
# Better Auth valida el secreto al analizar las rutas durante el build. Esta
# etapa se descarta, asi que un placeholder publico es seguro: el secreto real
# entra por entorno en runtime (entrada.sh lo exige y aborta si falta). Nunca
# se usa el valor de build en el artefacto final.
ENV BETTER_AUTH_SECRET=build-placeholder-no-es-un-secreto
COPY package*.json ./
RUN npm ci --ignore-scripts
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
# Chromium + fuentes para exportar la carta HTML/CSS a PDF.
RUN apk add --no-cache chromium font-liberation
ENV NODE_ENV=production
ENV PORT=3000
ENV CHROME_PATH=/usr/bin/chromium
# Credenciales de WhatsApp (Baileys). Montar un volumen persistente acá: sin
# ellas hay que volver a escanear el QR en cada deploy.
ENV WHATSAPP_AUTH_DIR=/app/.whatsapp-auth
COPY --from=build /app/build ./build
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
# Migraciones de Drizzle: el hook `init` del server las aplica y seedea los
# datos de ejemplo al arrancar (Drizzle es la única fuente de verdad del
# esquema y los datos; se eliminó sql/init.sql).
COPY --from=build /app/drizzle ./drizzle
EXPOSE 3000
CMD ["node", "build"]
