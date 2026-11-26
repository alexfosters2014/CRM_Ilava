import { json } from '@sveltejs/kit';
import { correoRepositorio } from '#lib/server/repositorios/index.ts';
import { usuarioDePeticion } from '#lib/server/autenticacion/usuario.ts';
import type { RequestHandler } from './$types';

/** PATCH /api/correo/cuentas/:id — edición parcial de la cuenta. */
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
		const cuenta = await correoRepositorio.guardarCuentaCorreo({ ...cuerpo, id, usuarioApp: await usuarioDePeticion(request, cuerpo?.usuarioApp) });
		return json(cuenta);
	} catch (error) {
		return json({ error: error instanceof Error ? error.message : 'No se pudo guardar la cuenta' }, { status: 400 });
	}
};

/** DELETE /api/correo/cuentas/:id */
export const DELETE: RequestHandler = async ({ params }) => {
	const id = Number(params.id);
	if (!Number.isInteger(id) || id <= 0) return json({ error: 'ID inválido' }, { status: 400 });
	const eliminada = await correoRepositorio.eliminarCuentaCorreo(id);
	return eliminada ? json({ eliminada: true }) : json({ error: 'Cuenta no encontrada' }, { status: 404 });
};
