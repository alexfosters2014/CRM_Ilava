import { json } from '@sveltejs/kit';
import { facturasRepositorio } from '#lib/server/repositorios/index.ts';
import { actualizarFacturaSchema } from '#lib/server/validaciones/facturas.ts';
import type { RequestHandler } from './$types';

/**
 * PATCH /api/facturas/:id
 * Edita la cabecera de la factura: comentario general, moneda y fecha.
 */
export const PATCH: RequestHandler = async ({ params, request }) => {
	let cuerpo: unknown;

	try {
		cuerpo = await request.json();
	} catch {
		return json({ error: 'El cuerpo debe ser JSON válido' }, { status: 400 });
	}

	const validacion = actualizarFacturaSchema.safeParse(cuerpo);
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

	const actualizada = await facturasRepositorio.actualizarFactura(id, validacion.data);
	if (!actualizada) return json({ error: 'Factura no encontrada' }, { status: 404 });

	return json({ ok: true, id: actualizada });
};
