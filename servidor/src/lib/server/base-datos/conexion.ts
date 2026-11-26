import { DATABASE_URL } from '$app/env/private';
import { Pool } from 'pg';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as esquemas from './esquemas/index.ts';

// Pool de conexiones a PostgreSQL (reutilizado por todos los endpoints)
export const pool = new Pool({
	connectionString: DATABASE_URL ?? 'postgres://crm:crm@localhost:5432/crmdb',
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
