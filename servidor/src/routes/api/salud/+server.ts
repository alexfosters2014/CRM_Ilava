import { json } from '@sveltejs/kit';
import { pool } from '#lib/server/base-datos/index.ts';

/**
 * GET /api/salud
 * Endpoint de comprobación: verifica que la API está viva y responde PostgreSQL.
 * Usa SQL crudo sobre el pool: es un health check puntual, caso válido de
 * escape hatch (no modela una entidad).
 */
export async function GET() {
	try {
		const resultado = await pool.query('SELECT NOW() AS ahora, version() AS version');
		return json({
			ok: true,
			mensaje: 'API del CRM operativa',
			base_datos: {
				conectada: true,
				ahora: resultado.rows[0].ahora,
				version: String(resultado.rows[0].version).split(' ')[0]
			}
		});
	} catch (error) {
		return json(
			{
				ok: false,
				mensaje: 'API operativa pero sin conexión a PostgreSQL',
				base_datos: { conectada: false, error: (error as Error).message }
			},
			{ status: 503 }
		);
	}
}
