import { json } from '@sveltejs/kit';
import { cobranzasRepositorio } from '#lib/server/repositorios/index.ts';
import { usuarioDePeticion } from '#lib/server/autenticacion/usuario.ts';
import type { RequestHandler } from './$types';

/** POST /api/cobranza/comprobantes/:id/restaurar — revierte el borrado lógico. */
export const POST: RequestHandler = async ({ params, request }) => {
	const id = Number(params.id);
	if (!Number.isInteger(id) || id <= 0) return json({ error: 'ID inválido' }, { status: 400 });
	const cuerpo = await request.json().catch(() => ({}));
	const restaurado = await cobranzasRepositorio.restaurarComprobante(id, await usuarioDePeticion(request, cuerpo?.usuario));
	return restaurado ? json({ restaurado: true }) : json({ error: 'Comprobante no encontrado' }, { status: 404 });
};
