import { json } from '@sveltejs/kit';
import { correoRepositorio } from '#lib/server/repositorios/index.ts';
import { usuarioDePeticion } from '#lib/server/autenticacion/usuario.ts';
import type { RequestHandler } from './$types';

/** GET /api/correo/cuentas — cuentas SMTP con sus alias (sin contraseñas). */
export const GET: RequestHandler = async () => json(await correoRepositorio.listarCuentasCorreo());

/** POST /api/correo/cuentas — alta o edición de una cuenta. */
export const POST: RequestHandler = async ({ request }) => {
	let cuerpo: any;
	try {
		cuerpo = await request.json();
	} catch {
		return json({ error: 'El cuerpo debe ser JSON válido' }, { status: 400 });
	}
	try {
		cuerpo.usuarioApp = await usuarioDePeticion(request, cuerpo?.usuarioApp);
		const cuenta = await correoRepositorio.guardarCuentaCorreo(cuerpo);
		return json(cuenta, { status: cuerpo?.id ? 200 : 201 });
	} catch (error) {
		return json({ error: error instanceof Error ? error.message : 'No se pudo guardar la cuenta' }, { status: 400 });
	}
};
