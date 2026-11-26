import { json } from '@sveltejs/kit';
import { and, asc, desc, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import {
	comprobantesCobranza,
	configuracionCobranza,
	db,
	periodosCobranza,
	plantillasCobranza,
	servicios
} from '#lib/server/base-datos/index.ts';
import { generarPdf, cartaConFondo } from '#lib/server/servicios/pdf.ts';
import {
	armarFilasCobranza,
	armarPdfCobranza,
	captionCobranza,
	formatearTotales,
	nombreArchivoCobranza,
	textoCobranza,
	totalesDeFilas
} from '#lib/server/servicios/cobranza-whatsapp.ts';
import {
	enviarDocumentoWhatsApp,
	enviarTextoWhatsApp,
	iniciarWhatsApp,
	jidDeTelefono,
	vistaSesionWhatsApp
} from '#lib/server/whatsapp/gestor.ts';
import { registrarMensajeSinCaso } from '#lib/server/repositorios/whatsapp-mensajes.ts';
import type { RequestHandler } from './$types';

const enviarSchema = z.object({
	servicioId: z.number().int().positive(),
	/** Período que se está viendo en el modal (`YYYY-MM`). */
	periodo: z
		.string()
		.trim()
		.regex(/^\d{4}-\d{2}$/, 'El período debe tener formato YYYY-MM')
		.optional(),
	/** Modelo de Cobranza elegido en el modal: define carta y fondo del PDF. */
	plantillaId: z.number().int().positive().optional(),
	/** Mismo filtro que el envío por correo: solo comprobantes vencidos. */
	soloVencidos: z.boolean().default(false),
	/**
	 * Totales que el usuario está viendo en el modal. Se comparan con los que
	 * se van a enviar: si no coinciden, no se envía nada.
	 */
	totales: z
		.object({ uyu: z.number().finite(), usd: z.number().finite() })
		.optional()
});

/**
 * POST /api/cobranza/whatsapp/enviar
 *
 * Envía el estado de cuenta del servicio por WhatsApp. Intenta la carta en
 * PDF (mismo generador que el correo); si Chrome no está disponible, manda el
 * detalle como texto. El envío queda registrado en whatsapp_mensajes.
 */
export const POST: RequestHandler = async ({ locals, request }) => {
	let cuerpo: unknown;
	try {
		cuerpo = await request.json();
	} catch {
		return json({ error: 'El cuerpo debe ser JSON válido' }, { status: 400 });
	}
	const validacion = enviarSchema.safeParse(cuerpo);
	if (!validacion.success) {
		return json({ error: 'Datos inválidos', codigo: 'DATOS_INVALIDOS' }, { status: 400 });
	}

	try {
		await iniciarWhatsApp();
		if (!vistaSesionWhatsApp().conectado) {
			return json(
				{
					error: 'La sesión de WhatsApp no está conectada. Avisá al administrador.',
					codigo: 'WHATSAPP_DESCONECTADO'
				},
				{ status: 409 }
			);
		}

		const [servicio] = await db
			.select({
				id: servicios.id,
				contacto: servicios.contactoFacturacion,
				celular: servicios.celular,
				cantidadDiasVencimiento: servicios.cantidadDiasVencimiento
			})
			.from(servicios)
			.where(
				and(
					eq(servicios.id, validacion.data.servicioId),
					isNull(servicios.eliminadoEn)
				)
			)
			.limit(1);

		if (!servicio) {
			return json({ error: 'El servicio no existe' }, { status: 404 });
		}
		if (!servicio.celular) {
			return json(
				{ error: 'El servicio no tiene celular de WhatsApp', codigo: 'SIN_TELEFONO' },
				{ status: 400 }
			);
		}

		// El período que se está viendo manda; si no vino, el último importado.
		const [periodo] = validacion.data.periodo
			? await db
					.select({ id: periodosCobranza.id, periodo: periodosCobranza.periodo })
					.from(periodosCobranza)
					.where(eq(periodosCobranza.periodo, validacion.data.periodo))
					.limit(1)
			: await db
					.select({ id: periodosCobranza.id, periodo: periodosCobranza.periodo })
					.from(periodosCobranza)
					.orderBy(desc(periodosCobranza.periodo))
					.limit(1);
		if (!periodo) {
			return json(
				{ error: 'No hay un período de cobranza importado', codigo: 'SIN_PERIODO' },
				{ status: 400 }
			);
		}

		const documentos = await db
			.select({
				tipoComprobante: comprobantesCobranza.tipoComprobante,
				serie: comprobantesCobranza.serie,
				numero: comprobantesCobranza.numero,
				fechaEmision: comprobantesCobranza.fechaEmision,
				fechaVencimiento: comprobantesCobranza.fechaVencimiento,
				importe: comprobantesCobranza.importe,
				saldo: comprobantesCobranza.saldoPendiente,
				moneda: comprobantesCobranza.moneda,
				excluidoEnvio: comprobantesCobranza.excluidoEnvio
			})
			.from(comprobantesCobranza)
			.where(
				and(
					eq(comprobantesCobranza.servicioId, servicio.id),
					eq(comprobantesCobranza.periodoId, periodo.id),
					eq(comprobantesCobranza.activo, true),
					isNull(comprobantesCobranza.eliminadoEn)
				)
			)
			.orderBy(asc(comprobantesCobranza.fechaEmision));

		const hoy = new Date().toISOString().slice(0, 10);
		// Incluye notas de crédito (saldo negativo): son parte del total.
		const filas = armarFilasCobranza(documentos, {
			soloVencidos: validacion.data.soloVencidos,
			hoy,
			plazoDias: servicio.cantidadDiasVencimiento
		});

		// Verificación de consistencia: lo que se ve en el modal debe ser
		// exactamente lo que se envía.
		const totalesEnvio = totalesDeFilas(filas);
		if (validacion.data.totales) {
			const diferenciaUyu = Math.abs(validacion.data.totales.uyu - totalesEnvio.uyu);
			const diferenciaUsd = Math.abs(validacion.data.totales.usd - totalesEnvio.usd);
			if (diferenciaUyu > 0.01 || diferenciaUsd > 0.01) {
				return json(
					{
						error:
							`El total del modal no coincide con el del envío. ` +
							`Modal: ${formatearTotales(validacion.data.totales)}. ` +
							`Envío: ${formatearTotales(totalesEnvio)}. ` +
							`Recargá el detalle del servicio y volvé a intentar.`,
						codigo: 'TOTAL_DESACTUALIZADO',
						totalesModal: validacion.data.totales,
						totalesEnvio
					},
					{ status: 409 }
				);
			}
		}

		if (filas.length === 0) {
			return json(
				{ error: 'El servicio no tiene saldo pendiente para enviar', codigo: 'SIN_SALDO' },
				{ status: 400 }
			);
		}

		// Modelo de Cobranza: de ahí salen la carta y la imagen de fondo.
		let plantilla: typeof plantillasCobranza.$inferSelect | undefined;
		if (validacion.data.plantillaId) {
			[plantilla] = await db
				.select()
				.from(plantillasCobranza)
				.where(eq(plantillasCobranza.id, validacion.data.plantillaId))
				.limit(1);
		} else {
			const [config] = await db
				.select({ id: configuracionCobranza.plantillaPredeterminadaId })
				.from(configuracionCobranza)
				.limit(1);
			if (config?.id) {
				[plantilla] = await db
					.select()
					.from(plantillasCobranza)
					.where(eq(plantillasCobranza.id, config.id))
					.limit(1);
			}
		}

		const { html, fondo } = armarPdfCobranza({
			contacto: servicio.contacto,
			periodo: periodo.periodo,
			filas,
			plantilla: plantilla ?? null
		});
		const datos = { contacto: servicio.contacto, filas };
		let modo: 'PDF' | 'TEXTO' = 'TEXTO';
		let envio;
		try {
			const pdf = await generarPdf(cartaConFondo(html, fondo));
			envio = await enviarDocumentoWhatsApp(servicio.celular, {
				contenido: pdf,
				nombreArchivo: nombreArchivoCobranza(servicio.contacto),
				mimetype: 'application/pdf',
				caption: captionCobranza(datos)
			});
			modo = 'PDF';
		} catch (errorPdf) {
			console.warn(
				'[whatsapp] cobranza sin PDF, se envía texto:',
				errorPdf instanceof Error ? errorPdf.message : 'error desconocido'
			);
			envio = await enviarTextoWhatsApp(servicio.celular, textoCobranza(datos));
		}

		await registrarMensajeSinCaso({
			waId: envio.waId,
			telefono: servicio.celular,
			jid: jidDeTelefono(servicio.celular),
			direccion: 'SALIENTE',
			tipo: modo === 'PDF' ? 'DOCUMENTO' : 'TEXTO',
			texto: modo === 'PDF' ? captionCobranza(datos) : textoCobranza(datos),
			nombreArchivo:
				modo === 'PDF' ? nombreArchivoCobranza(servicio.contacto) : null,
			mimetype: modo === 'PDF' ? 'application/pdf' : null,
			enviadoEn: envio.enviadoEn,
			enviadoPorUsuarioId: locals.usuario!.id,
			estado: 'ENVIADO',
			metadatos: { origen: 'COBRANZA', servicioId: servicio.id }
		});

		return json(
			{
				ok: true,
				modo,
				waId: envio.waId,
				telefono: servicio.celular,
				enviadoEn: envio.enviadoEn,
				totales: totalesEnvio
			},
			{ status: 201 }
		);
	} catch (error) {
		console.error(
			'[whatsapp] error al enviar cobranza:',
			error instanceof Error ? error.message : 'error desconocido'
		);
		return json(
			{ error: 'No se pudo enviar el estado de cuenta por WhatsApp' },
			{ status: 500 }
		);
	}
};
