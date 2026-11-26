import { json } from '@sveltejs/kit';
import { facturasRepositorio } from '#lib/server/repositorios/index.ts';
import { actualizarLineaSchema } from '#lib/server/validaciones/facturas.ts';
import type { RequestHandler } from './$types';

/**
 * PATCH /api/facturas/:id/lineas/:lineaId
 * Edición rápida de una línea. Si llega `codigo`, se valida contra el catálogo:
 * un código inexistente no se guarda (400).
 *
 * DELETE /api/facturas/:id/lineas/:lineaId
 * Baja DEFINITIVA de la línea. La factura no puede quedar sin líneas.
 */
export const PATCH: RequestHandler = async ({ params, request }) => {
	let cuerpo: unknown;

	try {
		cuerpo = await request.json();
	} catch {
		return json({ error: 'El cuerpo debe ser JSON válido' }, { status: 400 });
	}

	const validacion = actualizarLineaSchema.safeParse(cuerpo);
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

	const facturaId = Number(params.id);
	const lineaId = Number(params.lineaId);
	if (!Number.isInteger(facturaId) || facturaId <= 0 || !Number.isInteger(lineaId) || lineaId <= 0) {
		return json({ error: 'Factura o línea inválida' }, { status: 400 });
	}

	try {
		const linea = await facturasRepositorio.actualizarLinea(facturaId, lineaId, validacion.data);
		if (!linea) return json({ error: 'Línea no encontrada' }, { status: 404 });
		return json(linea);
	} catch (error) {
		if (error instanceof facturasRepositorio.ErrorArticuloInexistente) {
			return json({ error: error.message, codigo: error.codigo }, { status: 400 });
		}
		throw error;
	}
};

export const DELETE: RequestHandler = async ({ params }) => {
	const facturaId = Number(params.id);
	const lineaId = Number(params.lineaId);
	if (
		!Number.isInteger(facturaId) ||
		facturaId <= 0 ||
		!Number.isInteger(lineaId) ||
		lineaId <= 0
	) {
		return json({ error: 'Factura o línea inválida' }, { status: 400 });
	}

	try {
		await facturasRepositorio.eliminarLineaDefinitivo(facturaId, lineaId);
		return json({ ok: true });
	} catch (error) {
		if (error instanceof facturasRepositorio.ErrorFactura) {
			return json({ error: error.message }, { status: 400 });
		}
		throw error;
	}
};
