import { json } from '@sveltejs/kit';
import { correoRepositorio } from '#lib/server/repositorios/index.ts';
import type { RequestHandler } from './$types';

/**
 * POST /api/correo/cuentas/:id/verificar
 *
 * Prueba conexión y autenticación SMTP sin enviar un correo. Es la forma de
 * detectar una contraseña cambiada o una contraseña de aplicación revocada.
 */
export const POST: RequestHandler = async ({ params }) => {
	const id = Number(params.id);
	if (!Number.isInteger(id) || id <= 0) {
		return json({ error: 'ID de cuenta inválido' }, { status: 400 });
	}
	try {
		const resultado = await correoRepositorio.verificarCuentaCorreo(id);
		if (resultado.ok) return json({ ok: true });
		return json({
			ok: false,
			tipo: resultado.clasificacion.tipo,
			codigo: resultado.clasificacion.codigo,
			error: resultado.clasificacion.explicacion,
			detalle: resultado.clasificacion.mensaje
		});
	} catch (error) {
		return json(
			{ error: error instanceof Error ? error.message : 'No se pudo verificar la cuenta' },
			{ status: 400 }
		);
	}
};
