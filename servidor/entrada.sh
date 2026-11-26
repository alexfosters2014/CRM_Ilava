#!/bin/bash
# Punto de entrada del contenedor crm-backend: arranca PostgreSQL y la API
# juntos, tal como se pide la arquitectura (API y base de datos en el mismo
# contenedor del pod crm-backend).
set -e

# Fail-closed: sin secreto de sesion no arrancamos. Un valor por defecto dentro
# de la imagen es publico y permitiria firmar cookies de sesion validas.
if [ -z "${BETTER_AUTH_SECRET}" ]; then
	echo "[entrada] ERROR: falta BETTER_AUTH_SECRET. Inyectalo en runtime:" >&2
	echo "[entrada]   docker run -e BETTER_AUTH_SECRET=<secreto de 32+ caracteres>" >&2
	exit 1
fi

echo "[entrada] Arrancando PostgreSQL..."

# Entry point oficial de la imagen postgres: inicializa el volumen la primera
# vez (crea el usuario/BD) y luego deja el servidor en primer plano. No hay
# init.sql: el esquema y los datos iniciales los aplica la API al arrancar
# (hook `init` de SvelteKit con las migraciones y el seed de Drizzle).
# Lo lanzamos en segundo plano.
docker-entrypoint.sh postgres &
PID_PG=$!

echo "[entrada] Esperando a que PostgreSQL acepte conexiones..."
for _ in $(seq 1 60); do
	if pg_isready -q -U "${POSTGRES_USER:-crm}" -d "${POSTGRES_DB:-crmdb}"; then
		echo "[entrada] PostgreSQL listo."
		break
	fi
	sleep 1
done

if ! pg_isready -q -U "${POSTGRES_USER:-crm}" -d "${POSTGRES_DB:-crmdb}"; then
	echo "[entrada] ERROR: PostgreSQL no llego a estar listo." >&2
	kill "$PID_PG" 2>/dev/null || true
	exit 1
fi

echo "[entrada] Arrancando la API en el puerto ${PORT:-3000}..."

# La API queda como proceso principal del contenedor (PID 1): si el usuario
# para el contenedor, Docker se la senala y el cierre es limpio.
cd /app
exec node build
