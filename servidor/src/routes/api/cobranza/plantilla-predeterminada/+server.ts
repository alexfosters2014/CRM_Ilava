import { json } from '@sveltejs/kit';
import { cobranzasRepositorio } from '#lib/server/repositorios/index.ts';
import type { RequestHandler } from './$types';

/** GET /api/cobranza/plantilla-predeterminada — plantilla sugerida al enviar. */
export const GET: RequestHandler = async () =>
	json({ plantillaId: await cobranzasRepositorio.obtenerPlantillaPredeterminadaCobranza() });

/** PUT /api/cobranza/plantilla-predeterminada — Body: { plantillaId: number | null } */
export const PUT: RequestHandler = async ({ request }) => {
	let cuerpo: any;
	try {
		cuerpo = await request.json();
	} catch {
		return json({ error: 'El cuerpo debe ser JSON válido' }, { status: 400 });
	}
	const plantillaId = cuerpo?.plantillaId;
	if (plantillaId !== null && (!Number.isInteger(plantillaId) || plantillaId <= 0)) {
		return json({ error: 'plantillaId inválido' }, { status: 400 });
	}
	try {
		const guardada = await cobranzasRepositorio.guardarPlantillaPredeterminadaCobranza(plantillaId);
		return json({ plantillaId: guardada });
	} catch (error) {
		return json(
			{ error: error instanceof Error ? error.message : 'No se pudo guardar la plantilla predeterminada' },
			{ status: 400 }
		);
	}
};
