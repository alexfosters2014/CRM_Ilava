/**
 * Clasificación de errores de PostgreSQL para las capas superiores.
 *
 * Drizzle envuelve el error original de `pg`: el error que llega al `catch`
 * es un `Error` de Drizzle ("Failed query: ...") SIN el código SQL arriba, y
 * el error de base de datos real (con `code`) vive en `error.cause`.
 * Por eso hay que mirar ambos niveles en vez de `error.code` a secas.
 */

const CODIGO_VIOLACION_UNICA = '23505';

/** Devuelve el código SQL de estado de un error de pg, si existe. */
function codigoSql(error: unknown): string | undefined {
	if (!error || typeof error !== 'object') return undefined;
	const e = error as { code?: unknown; cause?: unknown };
	if (typeof e.code === 'string') return e.code;
	// Drizzle envuelve el error de pg en `cause`.
	if (e.cause && typeof e.cause === 'object') {
		const c = e.cause as { code?: unknown };
		if (typeof c.code === 'string') return c.code;
	}
	return undefined;
}

/** true si el error es una violación de restricción única (p. ej. email duplicado). */
export function esViolacionUnica(error: unknown): boolean {
	return codigoSql(error) === CODIGO_VIOLACION_UNICA;
}
