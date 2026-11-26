import { json } from '@sveltejs/kit';
import { esViolacionUnica } from '#lib/server/base-datos/index.ts';
import { configuracionRepositorio } from '#lib/server/repositorios/index.ts';
import type { RequestHandler } from './$types';

/** PATCH /api/configuracion/grupos-cobranza/:id */
export const PATCH: RequestHandler = async ({ params, request }) => {
	const id = Number(params.id);
	if (!Number.isInteger(id) || id <= 0) return json({ error: 'ID inválido' }, { status: 400 });
	let cuerpo: any;
	try {
		cuerpo = await request.json();
	} catch {
		return json({ error: 'El cuerpo debe ser JSON válido' }, { status: 400 });
	}
	try {
		const actualizado = await configuracionRepositorio.actualizarGrupoCobranza(id, {
			...(cuerpo?.nombre !== undefined ? { nombre: String(cuerpo.nombre).trim() } : {}),
			...(cuerpo?.colorFondo !== undefined ? { colorFondo: cuerpo.colorFondo } : {}),
			...(cuerpo?.colorTexto !== undefined ? { colorTexto: cuerpo.colorTexto } : {}),
			...(cuerpo?.orden !== undefined ? { orden: Number(cuerpo.orden) || 0 } : {}),
			...(cuerpo?.activo !== undefined ? { activo: Boolean(cuerpo.activo) } : {})
		});
		return actualizado ? json({ actualizado: true }) : json({ error: 'Grupo no encontrado' }, { status: 404 });
	} catch (error) {
		if (esViolacionUnica(error)) return json({ error: 'Ya existe un grupo con ese nombre' }, { status: 409 });
		return json({ error: error instanceof Error ? error.message : 'No se pudo actualizar' }, { status: 400 });
	}
};
