import { json } from '@sveltejs/kit';
import { cobranzasRepositorio } from '#lib/server/repositorios/index.ts';
import { ErrorValidacionCobranza } from '#lib/server/repositorios/cobranzas.ts';
import { usuarioDePeticion } from '#lib/server/autenticacion/usuario.ts';
import type { RequestHandler } from './$types';

/** GET /api/cobranza?periodo=YYYY-MM&hoy=YYYY-MM-DD */
export const GET: RequestHandler = async ({ url }) => {
	const periodos = await cobranzasRepositorio.listarPeriodosCobranza();
	const periodo = url.searchParams.get('periodo') ?? periodos[0]?.periodo;
	if (!periodo) return json({ periodos, cartera: null });
	const hoy = url.searchParams.get('hoy') ?? new Date().toISOString().slice(0, 10);
	const cartera = await cobranzasRepositorio.listarCarteraCobranza(periodo, hoy);
	return json({ periodos, cartera });
};

/** POST /api/cobranza — Body: { periodo, cotizacionUsd, filas, archivoNombre?, usuario? } */
export const POST: RequestHandler = async ({ request }) => {
	let cuerpo: any;
	try {
		cuerpo = await request.json();
	} catch {
		return json({ error: 'El cuerpo debe ser JSON válido' }, { status: 400 });
	}
	if (!/^\d{4}-\d{2}$/.test(cuerpo?.periodo ?? '') || !Number.isFinite(Number(cuerpo?.cotizacionUsd)) || !Array.isArray(cuerpo?.filas)) {
		return json({ error: 'Se requiere período YYYY-MM, cotización y filas' }, { status: 400 });
	}
	try {
		const resumen = await cobranzasRepositorio.importarCarteraCobranza(
			cuerpo.periodo,
			Number(cuerpo.cotizacionUsd),
			cuerpo.filas,
			await usuarioDePeticion(request, cuerpo.usuario),
			cuerpo.archivoNombre
		);
		return json(resumen, { status: 201 });
	} catch (error) {
		if (error instanceof ErrorValidacionCobranza) return json({ error: error.message, errores: error.errores }, { status: 422 });
		return json({ error: error instanceof Error ? error.message : 'No se pudo importar la cartera' }, { status: 400 });
	}
};

/** DELETE /api/cobranza?id=123 — borrado lógico auditado. */
export const DELETE: RequestHandler = async ({ request, url }) => {
	const id = Number(url.searchParams.get('id'));
	if (!Number.isInteger(id) || id <= 0) return json({ error: 'ID inválido' }, { status: 400 });
	const usuario = await usuarioDePeticion(request, url.searchParams.get('usuario'));
	const eliminado = await cobranzasRepositorio.eliminarLogicamenteComprobante(id, usuario, url.searchParams.get('motivo') ?? undefined);
	return eliminado ? json({ eliminado: true }) : json({ error: 'Comprobante no encontrado' }, { status: 404 });
};
