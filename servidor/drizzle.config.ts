import { defineConfig } from 'drizzle-kit';

/**
 * Configuración de drizzle-kit (corre fuera de SvelteKit, por eso NO usa
 * `$app/env` sino `process.env` y `.env`).
 *
 * Esquema: `src/lib/server/base-datos/esquemas/` (fuente de tipos y de las
 * migraciones). Migraciones generadas: carpeta `drizzle/`.
 *
 * Comandos (ver package.json):
 *   npm run db:generate  -> genera SQL a partir del esquema
 *   npm run db:migrate   -> aplica las migraciones pendientes
 *   npm run db:push      -> sincroniza el esquema contra la BD (dev, sin migraciones)
 *   npm run db:studio    -> GUI para inspeccionar la BD
 */
export default defineConfig({
	dialect: 'postgresql',
	schema: './src/lib/server/base-datos/esquemas/index.ts',
	out: './drizzle',
	dbCredentials: {
		// En desarrollo apunta al pod de Podman publicado en :5433 (ver .env).
		url: process.env.DATABASE_URL ?? 'postgres://crm:crm@localhost:5433/crmdb'
	},
	verbose: true,
	breakpoints: true
});
