import { json } from '@sveltejs/kit';
import { facturasRepositorio } from '#lib/server/repositorios/index.ts';
import { cambioEstadoSchema } from '#lib/server/validaciones/facturas.ts';
import type { RequestHandler } from './$types';

/**
 * POST /api/facturas/:id/estado
 * Mueve la factura de estado.
 * Body: { estado, motivo?, fecha?, variables? }
 *
 * - PENDIENTE exige `motivo`.
 * - BANDEJA exige `fecha` y sustituye las variables de los comentarios.
 */
export const POST: RequestHandler = async ({ params, request }) => {
	let cuerpo: unknown;

	try {
		cuerpo = await request.json();
	} catch {
		return json({ error: 'El cuerpo debe ser JSON válido' }, { status: 400 });
	}

	const validacion = cambioEstadoSchema.safeParse(cuerpo);
	if (!validacion.success) {
		return json(
			{
				error: 'Datos inválidos',
				detalles: validacion.error.issues.map((issue) => ({
					campo: issue.path.join('.'),
					mensaje: issue.message
				}))
			},
			{ status: 400 }
		);
	}

	const id = Number(params.id);
	if (!Number.isInteger(id) || id <= 0) {
		return json({ error: 'Factura inválida' }, { status: 400 });
	}

	try {
		await facturasRepositorio.cambiarEstado(id, validacion.data);
		return json({ ok: true, id, estado: validacion.data.estado });
	} catch (error) {
		if (error instanceof facturasRepositorio.ErrorVariablesFaltantes) {
			return json(
				{ error: error.message, faltantes: error.faltantes },
				{ status: 422 }
			);
		}
		if (error instanceof facturasRepositorio.ErrorFactura) {
			return json({ error: error.message }, { status: 400 });
		}
		throw error;
	}
};
