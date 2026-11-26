import { json } from '@sveltejs/kit';
import { z } from 'zod';
import {
	ErrorSeguimientos,
	obtenerSeguimiento
} from '#lib/server/repositorios/seguimientos.ts';
import { registrarSalienteWhatsApp } from '#lib/server/repositorios/whatsapp-mensajes.ts';
import {
	enviarTextoWhatsApp,
	iniciarWhatsApp,
	jidDeTelefono,
	vistaSesionWhatsApp
} from '#lib/server/whatsapp/gestor.ts';
import {
	leerCuerpo,
	respuestaErrorSeguimientos,
	respuestaValidacion
} from '#lib/server/http/seguimientos.ts';
import type { RequestHandler } from './$types';

const enviarSchema = z.object({
	texto: z
		.string()
		.trim()
		.min(1, 'Escribí el mensaje')
		.max(4096, 'WhatsApp admite hasta 4096 caracteres')
});

/**
 * POST /api/seguimientos/[id]/whatsapp/enviar
 *
 * Envía un texto por WhatsApp al celular del caso, lo registra como mensaje
 * saliente y crea el evento en la línea de tiempo.
 */
export const POST: RequestHandler = async ({ locals, params, request }) => {
	try {
		const id = Number(params.id);
		if (!Number.isInteger(id) || id <= 0) {
			throw new ErrorSeguimientos('DATOS_INVALIDOS', 'El identificador no es válido');
		}

		const cuerpo = await leerCuerpo(request);
		const validacion = enviarSchema.safeParse(cuerpo);
		if (!validacion.success) return respuestaValidacion(validacion.error);

		const caso = await obtenerSeguimiento(locals.usuario!, id, false);
		if (!caso.permisos.editar) {
			throw new ErrorSeguimientos('SIN_PERMISO', 'No podés enviar mensajes en este caso');
		}
		if (!caso.telefonoWhatsapp) {
			throw new ErrorSeguimientos(
				'SIN_TELEFONO',
				'El seguimiento no tiene celular de WhatsApp'
			);
		}
		await iniciarWhatsApp();
		if (!vistaSesionWhatsApp().conectado) {
			throw new ErrorSeguimientos(
				'WHATSAPP_DESCONECTADO',
				'La sesión de WhatsApp no está conectada. Avisá al administrador.'
			);
		}

		const envio = await enviarTextoWhatsApp(caso.telefonoWhatsapp, validacion.data.texto);
		await registrarSalienteWhatsApp({
			seguimientoId: id,
			waId: envio.waId,
			telefono: caso.telefonoWhatsapp,
			jid: jidDeTelefono(caso.telefonoWhatsapp),
			direccion: 'SALIENTE',
			tipo: 'TEXTO',
			texto: validacion.data.texto,
			enviadoEn: envio.enviadoEn,
			enviadoPorUsuarioId: locals.usuario!.id,
			estado: 'ENVIADO'
		});

		const actualizado = await obtenerSeguimiento(locals.usuario!, id, false);
		return json(
			{ ok: true, seguimiento: actualizado, waId: envio.waId, enviadoEn: envio.enviadoEn },
			{ status: 201 }
		);
	} catch (error) {
		return respuestaErrorSeguimientos(error);
	}
};
