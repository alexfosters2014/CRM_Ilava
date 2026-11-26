import { json } from '@sveltejs/kit';
import { cobranzasRepositorio } from '#lib/server/repositorios/index.ts';
import type { RequestHandler } from './$types';

/** GET /api/configuracion/cobranza — copia global de control interno. */
export const GET: RequestHandler = async () => json(await cobranzasRepositorio.obtenerConfiguracionCobranza());

/** PUT /api/configuracion/cobranza — Body: { copiaActiva, copiaEmails, copiaTipo } */
export const PUT: RequestHandler = async ({ request }) => {
	let cuerpo: any;
	try {
		cuerpo = await request.json();
	} catch {
		return json({ error: 'El cuerpo debe ser JSON válido' }, { status: 400 });
	}
	try {
		const config = await cobranzasRepositorio.guardarConfiguracionCobranza({
			copiaActiva: Boolean(cuerpo?.copiaActiva),
			copiaEmails: String(cuerpo?.copiaEmails ?? ''),
			copiaTipo: cuerpo?.copiaTipo === 'CCO' ? 'CCO' : 'CC'
		});
		return json(config);
	} catch (error) {
		return json({ error: error instanceof Error ? error.message : 'No se pudo guardar' }, { status: 400 });
	}
};
