import { json } from '@sveltejs/kit';
import { cobranzasRepositorio } from '#lib/server/repositorios/index.ts';
import { usuarioDePeticion } from '#lib/server/autenticacion/usuario.ts';
import type { RequestHandler } from './$types';

/** GET /api/cobranza/exclusiones — reglas activas decididas por el usuario. */
export const GET: RequestHandler = async () => json(await cobranzasRepositorio.listarExclusionesCobranza());

/** POST /api/cobranza/exclusiones — registra una observación para omitirla en adelante. */
export const POST: RequestHandler = async ({ request }) => {
	let cuerpo: any;
	try {
		cuerpo = await request.json();
	} catch {
		return json({ error: 'El cuerpo debe ser JSON válido' }, { status: 400 });
	}
	if (!cuerpo?.fila?.contacto || !cuerpo?.motivo?.trim()) {
		return json({ error: 'Se requiere la fila y el motivo de exclusión' }, { status: 400 });
	}
	const exclusion = await cobranzasRepositorio.crearExclusionCobranza({ fila: cuerpo.fila, motivo: cuerpo.motivo, usuario: await usuarioDePeticion(request, cuerpo.usuario) });
	return json(exclusion, { status: 201 });
};
