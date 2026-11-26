import { json } from '@sveltejs/kit';
import { enviosCobranzaRepositorio } from '#lib/server/repositorios/index.ts';
import { usuarioDePeticion } from '#lib/server/autenticacion/usuario.ts';
import type { RequestHandler } from './$types';

/** GET /api/cobranza/envios?servicioId=123 — historial de envíos del servicio. */
export const GET: RequestHandler = async ({ url }) => {
	const servicioId = Number(url.searchParams.get('servicioId'));
	if (!Number.isInteger(servicioId) || servicioId <= 0) {
		return json({ error: 'servicioId inválido' }, { status: 400 });
	}
	return json(await enviosCobranzaRepositorio.listarEnviosServicio(servicioId));
};

/**
 * POST /api/cobranza/envios
 * Body: { servicioId, periodo, plantillaId, cuentaId, aliasId?, usuario?, soloVencidos? }
 * Envía el estado de cuenta y limpia las exclusiones temporales.
 */
export const POST: RequestHandler = async ({ request }) => {
	let cuerpo: any;
	try {
		cuerpo = await request.json();
	} catch {
		return json({ error: 'El cuerpo debe ser JSON válido' }, { status: 400 });
	}
	if (!Number.isInteger(Number(cuerpo?.servicioId)) || !cuerpo?.periodo || !Number(cuerpo?.plantillaId) || !Number(cuerpo?.cuentaId)) {
		return json({ error: 'Se requiere servicio, período, plantilla y cuenta' }, { status: 400 });
	}
	try {
		const envio = await enviosCobranzaRepositorio.enviarEstadoCuenta({
			servicioId: Number(cuerpo.servicioId),
			periodo: String(cuerpo.periodo),
			plantillaId: Number(cuerpo.plantillaId),
			cuentaId: Number(cuerpo.cuentaId),
			aliasId: cuerpo.aliasId ? Number(cuerpo.aliasId) : null,
			usuario: await usuarioDePeticion(request, cuerpo.usuario),
			soloVencidos: cuerpo.soloVencidos === true
		});
		return json(envio, { status: 201 });
	} catch (error) {
		return json({ error: error instanceof Error ? error.message : 'No se pudo enviar' }, { status: 400 });
	}
};
