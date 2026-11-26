#!/bin/bash
# Punto de entrada del modo DESARROLLO del contenedor crm-backend.
#
# Misma forma que produccion (PostgreSQL adentro, Variables de entorno, mismo
# volumen), pero la app corre con Vite y HMR en vez de `node build`.
set -e

# Fail-closed igual que en produccion: sin secreto de sesion no arrancamos.
if [ -z "${BETTER_AUTH_SECRET}" ]; then
	echo "[entrada-dev] ERROR: falta BETTER_AUTH_SECRET. Inyectalo en runtime:" >&2
	echo "[entrada-dev]   docker run -e BETTER_AUTH_SECRET=<secreto de 32+ caracteres>" >&2
	exit 1
fi

echo "[entrada-dev] Arrancando PostgreSQL..."

# Mismo entry point oficial de la imagen postgres que usa produccion: inicializa
# el volumen la primera vez y deja el servidor en primer plano (en background).
docker-entrypoint.sh postgres &
PID_PG=$!

echo "[entrada-dev] Esperando a que PostgreSQL acepte conexiones..."
for _ in $(seq 1 60); do
	if pg_isready -q -U "${POSTGRES_USER:-crm}" -d "${POSTGRES_DB:-crmdb}"; then
		echo "[entrada-dev] PostgreSQL listo."
		break
	fi
	sleep 1
done

if ! pg_isready -q -U "${POSTGRES_USER:-crm}" -d "${POSTGRES_DB:-crmdb}"; then
	echo "[entrada-dev] ERROR: PostgreSQL no llego a estar listo." >&2
	kill "$PID_PG" 2>/dev/null || true
	exit 1
fi

echo "[entrada-dev] Arrancando Vite en el puerto ${PORT:-3000} (HMR)..."
cd /app
# --host 0.0.0.0 para que el puerto publicado por Docker sea alcanzable.
exec npm run dev -- --host 0.0.0.0 --port "${PORT:-3000}"
