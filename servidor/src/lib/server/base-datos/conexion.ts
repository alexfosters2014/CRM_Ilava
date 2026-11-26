import { building } from '$app/env';
import { DATABASE_URL } from '$app/env/private';
import { Pool } from 'pg';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as esquemas from './esquemas/index.ts';

/**
 * Cadena de conexion. En runtime es obligatoria: el contenedor la inyecta por
 * entorno y no hay credenciales por defecto en el codigo. Durante el build solo
 * se analizan las rutas y no se abre ninguna conexion, asi que se usa un
 * placeholder inerte.
 */
function cadenaConexion(): string {
	if (DATABASE_URL) return DATABASE_URL;
	if (building) return 'postgres://build:build@localhost:5432/build';
	throw new Error(
		'Falta DATABASE_URL. El contenedor la define en infra/compose-backend.yml; en desarrollo local va en servidor/.env.'
	);
}

// Pool de conexiones a PostgreSQL (reutilizado por todos los endpoints)
export const pool = new Pool({
	connectionString: cadenaConexion(),
	max: 10,
	idleTimeoutMillis: 30000
});

/**
 * Cliente Drizzle sobre el pool de pg (driver node-postgres).
 *
 * Es el punto único de acceso tipado a la base de datos. Las capas superiores
 * (Repositorios) usan `db` en lugar de escribir SQL a mano.
 */
export const db: NodePgDatabase<typeof esquemas> = drizzle({ client: pool, schema: esquemas });

/**
 * Escape hatch: SQL crudo parametrizado. Reservado para consultas puntuales
 * que no conviene modelar (p. ej. el health check con `version()`). Para el
 * resto de la persistencia usá los Repositorios, que van con `db`.
 */
export async function query<T extends Record<string, unknown> = Record<string, unknown>>(
	text: string,
	params?: unknown[]
) {
	return pool.query<T>(text, params);
}
