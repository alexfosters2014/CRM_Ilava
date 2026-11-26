import { json } from '@sveltejs/kit';
import { esViolacionUnica } from '#lib/server/base-datos/index.ts';
import { configuracionRepositorio } from '#lib/server/repositorios/index.ts';
import type { RequestHandler } from './$types';

/** GET /api/configuracion/grupos-cobranza — grupos de cobranza con colores. */
export const GET: RequestHandler = async () => json(await configuracionRepositorio.listarGruposCobranzaAdmin());

/** POST /api/configuracion/grupos-cobranza — Body: { nombre, colorFondo, colorTexto, orden? } */
export const POST: RequestHandler = async ({ request }) => {
	let cuerpo: any;
	try {
		cuerpo = await request.json();
	} catch {
		return json({ error: 'El cuerpo debe ser JSON válido' }, { status: 400 });
	}
	const nombre = String(cuerpo?.nombre ?? '').trim();
	if (!nombre) return json({ error: 'El nombre es obligatorio' }, { status: 400 });
	try {
		await configuracionRepositorio.crearGrupoCobranza({
			nombre,
			colorFondo: cuerpo?.colorFondo ?? '#3346b8',
			colorTexto: cuerpo?.colorTexto ?? '#ffffff',
			orden: Number(cuerpo?.orden) || 0
		});
		return json({ creado: true }, { status: 201 });
	} catch (error) {
		if (esViolacionUnica(error)) return json({ error: 'Ya existe un grupo con ese nombre' }, { status: 409 });
		return json({ error: error instanceof Error ? error.message : 'No se pudo crear' }, { status: 400 });
	}
};
