import path from 'node:path';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { db, pool } from './conexion.ts';
import {
	seedearAreas,
	seedearCatalogos,
	seedearCategoriasTickets,
	seedearClientes
} from './seed.ts';

/**
 * Prepara la base de datos al arrancar el servidor (se invoca desde el hook
 * `init` de SvelteKit, una vez y antes de atender el primer request).
 *
 * Drizzle es la ÚNICA fuente de verdad del esquema y de los datos:
 * 1. Aplica las migraciones pendientes de `drizzle/` (idempotente: solo corre
 *    las que aún no están registradas en drizzle.__drizzle_migrations).
 * 2. Seedea los datos de ejemplo (idempotente por restricción única de email).
 *
 * Si algo falla, lanza el error: en producción SvelteKit deja de arrancar, que
 * es el comportamiento deseable ante una BD inaccesible (fallo visible, no
 * silencioso).
 */
export async function prepararBaseDatos(): Promise<void> {
	// Resuelve la carpeta de migraciones relativa al cwd del proceso.
	// En el contenedor el cwd es /app y las migraciones viven en /app/drizzle.
	const migrationsFolder = path.join(process.cwd(), 'drizzle');

	await migrate(db, { migrationsFolder });
	await seedearAreas();
	await seedearClientes();
	await seedearCatalogos();
	await seedearCategoriasTickets();
}

/** Cierra el pool de conexiones (útil para scripts y tests). */
export async function cerrarBaseDatos(): Promise<void> {
	await pool.end();
}
