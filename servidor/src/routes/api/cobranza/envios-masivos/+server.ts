import { json } from '@sveltejs/kit';
import { colaEnviosRepositorio } from '#lib/server/repositorios/index.ts';
import { usuarioDePeticion } from '#lib/server/autenticacion/usuario.ts';
import type { RequestHandler } from './$types';

/**
 * POST /api/cobranza/envios-masivos
 * Body: { periodo, servicioIds, plantillaId, cuentaId, aliasId?, usuario? }
 * Encola los envíos; el procesamiento corre en el servidor.
 */
export const POST: RequestHandler = async ({ request }) => {
	let cuerpo: any;
	try {
		cuerpo = await request.json();
	} catch {
		return json({ error: 'El cuerpo debe ser JSON válido' }, { status: 400 });
	}
	const servicioIds: number[] = Array.isArray(cuerpo?.servicioIds)
		? cuerpo.servicioIds.map(Number).filter((id: number) => Number.isInteger(id) && id > 0)
		: [];
	if (servicioIds.length === 0) return json({ error: 'No hay servicios seleccionados' }, { status: 400 });
	if (!/^\d{4}-\d{2}$/.test(String(cuerpo?.periodo ?? ''))) {
		return json({ error: 'Período inválido' }, { status: 400 });
	}
	if (!Number(cuerpo?.plantillaId) || !Number(cuerpo?.cuentaId)) {
		return json({ error: 'Elegí plantilla y cuenta de correo' }, { status: 400 });
	}
	try {
		const lote = await colaEnviosRepositorio.crearLote({
			periodo: String(cuerpo.periodo),
			servicioIds,
			plantillaId: Number(cuerpo.plantillaId),
			cuentaId: Number(cuerpo.cuentaId),
			aliasId: cuerpo?.aliasId ? Number(cuerpo.aliasId) : null,
			usuario: await usuarioDePeticion(request, cuerpo?.usuario)
		});
		return json(lote, { status: 201 });
	} catch (error) {
		return json({ error: error instanceof Error ? error.message : 'No se pudo crear el lote' }, { status: 400 });
	}
};
