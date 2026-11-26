import { json } from '@sveltejs/kit';
import {
	ErrorSeguimientos,
	obtenerSeguimiento
} from '#lib/server/repositorios/seguimientos.ts';
import { desvincularMensajeDeCaso } from '#lib/server/repositorios/whatsapp-mensajes.ts';
import { respuestaErrorSeguimientos } from '#lib/server/http/seguimientos.ts';
import type { RequestHandler } from './$types';

/**
 * DELETE /api/seguimientos/[id]/whatsapp/mensajes/[mensajeId]
 *
 * Desvincula un mensaje del caso. El original queda en el espejo de WhatsApp
 * (puede seguir vinculado a otro caso con el mismo teléfono).
 */
export const DELETE: RequestHandler = async ({ locals, params }) => {
	try {
		const id = Number(params.id);
		const mensajeId = Number(params.mensajeId);
		if (!Number.isInteger(id) || id <= 0 || !Number.isInteger(mensajeId) || mensajeId <= 0) {
			throw new ErrorSeguimientos('DATOS_INVALIDOS', 'El identificador no es válido');
		}

		const caso = await obtenerSeguimiento(locals.usuario!, id, false);
		if (!caso.permisos.editar) {
			throw new ErrorSeguimientos('SIN_PERMISO', 'No podés modificar este caso');
		}

		const resultado = await desvincularMensajeDeCaso(id, mensajeId);
		if (!resultado.desvinculado) {
			throw new ErrorSeguimientos('NO_ENCONTRADO', 'El mensaje no está vinculado a este caso');
		}
		return json({ ok: true });
	} catch (error) {
		return respuestaErrorSeguimientos(error);
	}
};
