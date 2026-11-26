import { json } from '@sveltejs/kit';
import { cobranzasRepositorio } from '#lib/server/repositorios/index.ts';
import { usuarioDePeticion } from '#lib/server/autenticacion/usuario.ts';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => json(await cobranzasRepositorio.listarPlantillasCobranza());

export const POST: RequestHandler = async ({ request }) => {
	try {
		const datos = await request.json();
		datos.usuario = await usuarioDePeticion(request, datos?.usuario);
		return json(await cobranzasRepositorio.guardarPlantillaCobranza(datos), { status: datos.id ? 200 : 201 });
	} catch (error) {
		return json({ error: error instanceof Error ? error.message : 'No se pudo guardar la plantilla' }, { status: 400 });
	}
};
