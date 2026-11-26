import { json } from '@sveltejs/kit';
import {
	ErrorSeguimientos,
	marcarWhatsAppVerificado,
	obtenerSeguimiento
} from '#lib/server/repositorios/seguimientos.ts';
import { respuestaErrorSeguimientos } from '#lib/server/http/seguimientos.ts';
import { iniciarWhatsApp, verificarNumeroWhatsApp } from '#lib/server/whatsapp/gestor.ts';
import type { RequestHandler } from './$types';

/**
 * POST /api/seguimientos/[id]/whatsapp/verificar
 *
 * Consulta onWhatsApp con el celular del caso. Si el número existe, deja la
 * marca de verificación; si no existe, la borra. Si la sesión no está
 * conectada no se toca nada: la caída de WhatsApp no invalida el dato.
 */
export const POST: RequestHandler = async ({ locals, params }) => {
	try {
		const id = Number(params.id);
		if (!Number.isInteger(id) || id <= 0) {
			throw new ErrorSeguimientos('DATOS_INVALIDOS', 'El identificador no es válido');
		}

		const caso = await obtenerSeguimiento(locals.usuario!, id, false);
		if (!caso.permisos.ver) {
			throw new ErrorSeguimientos('SIN_PERMISO', 'No podés ver este seguimiento');
		}
		if (!caso.telefonoWhatsapp) {
			return json(
				{ error: 'El seguimiento no tiene celular de WhatsApp', codigo: 'SIN_TELEFONO' },
				{ status: 400 }
			);
		}

		await iniciarWhatsApp();
		const resultado = await verificarNumeroWhatsApp(caso.telefonoWhatsapp);
		const fecha = resultado.consultado && resultado.existe ? new Date() : null;
		if (resultado.consultado) {
			await marcarWhatsAppVerificado(id, fecha);
		}

		return json({
			...resultado,
			telefonoWhatsapp: caso.telefonoWhatsapp,
			verificadoEn: resultado.consultado
				? (fecha?.toISOString() ?? null)
				: caso.telefonoWhatsappVerificadoEn
		});
	} catch (error) {
		return respuestaErrorSeguimientos(error);
	}
};
