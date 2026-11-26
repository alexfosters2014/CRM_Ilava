import { and, eq, notInArray, sql } from 'drizzle-orm';
import {
	db,
	seguimientos,
	seguimientosEventos,
	seguimientosNotificaciones,
	whatsappMensajes,
	whatsappMensajesSeguimientos,
	type DireccionMensajeWhatsApp,
	type EstadoMensajeWhatsApp,
	type TipoMensajeWhatsApp
} from '../base-datos/index.ts';
import { ESTADOS_CERRADOS } from '../validaciones/seguimientos.ts';
import { formatearTelefonoUy } from '../servicios/telefonos.ts';

/**
 * Repositorio: mensajes de WhatsApp del seguimiento.
 *
 * Regla central (lista blanca): un mensaje solo se persiste si su teléfono
 * pertenece a al menos un seguimiento activo. El mismo mensaje puede quedar
 * vinculado a varios casos; el vínculo se desactiva por separado.
 */

export interface MensajeWhatsAppEntrada {
	waId: string;
	/** Teléfono del contacto, canónico (598 + 8 dígitos). */
	telefono: string;
	/** JID con el que se responde (puede ser el PN o el LID resuelto). */
	jid: string;
	lid?: string | null;
	direccion: DireccionMensajeWhatsApp;
	tipo: TipoMensajeWhatsApp;
	texto: string | null;
	nombreArchivo?: string | null;
	mimetype?: string | null;
	desdeTelefono?: boolean;
	enviadoEn: Date;
	enviadoPorUsuarioId?: string | null;
	estado?: EstadoMensajeWhatsApp;
	metadatos?: Record<string, unknown> | null;
}

export interface CasoDeTelefono {
	id: number;
	codigo: string;
	titulo: string;
	estado: string;
	responsableId: string;
}

/** Casos vivos cuyo teléfono coincide: la lista blanca, derivada. */
export async function casosActivosPorTelefono(telefono: string): Promise<CasoDeTelefono[]> {
	return await db
		.select({
			id: seguimientos.id,
			codigo: seguimientos.codigoVisible,
			titulo: seguimientos.titulo,
			estado: seguimientos.estado,
			responsableId: seguimientos.responsableUsuarioId
		})
		.from(seguimientos)
		.where(
			and(
				eq(seguimientos.telefonoWhatsapp, telefono),
				notInArray(seguimientos.estado, [...ESTADOS_CERRADOS])
			)
		);
}

function contenidoDeMensaje(datos: MensajeWhatsAppEntrada): string {
	if (datos.tipo === 'TEXTO') return datos.texto?.trim() || '[Mensaje vacío]';
	const etiquetas: Record<string, string> = {
		DOCUMENTO: datos.nombreArchivo ? `[Documento] ${datos.nombreArchivo}` : '[Documento]',
		IMAGEN: '[Imagen]',
		AUDIO: '[Audio]',
		VIDEO: '[Video]',
		STICKER: '[Sticker]',
		OTRO: '[Mensaje de WhatsApp]'
	};
	const base = etiquetas[datos.tipo] ?? '[Mensaje de WhatsApp]';
	return datos.texto?.trim() ? `${base}\n${datos.texto.trim()}` : base;
}

/**
 * Guarda un mensaje y lo vincula a TODOS los seguimientos activos del
 * teléfono. Si el mensaje ya existía (eco o reintento), no duplica eventos.
 */
export async function ingestarMensajeWhatsApp(
	datos: MensajeWhatsAppEntrada
): Promise<{ guardado: boolean; casos: number }> {
	const casos = await casosActivosPorTelefono(datos.telefono);
	if (casos.length === 0) return { guardado: false, casos: 0 };

	return await db.transaction(async (tx) => {
		const [insertado] = await tx
			.insert(whatsappMensajes)
			.values({
				waId: datos.waId,
				telefono: datos.telefono,
				jid: datos.jid,
				lid: datos.lid ?? null,
				direccion: datos.direccion,
				tipo: datos.tipo,
				texto: datos.texto,
				nombreArchivo: datos.nombreArchivo ?? null,
				mimetype: datos.mimetype ?? null,
				estado:
					datos.estado ??
					(datos.direccion === 'ENTRANTE' ? 'RECIBIDO' : 'ENVIADO'),
				enviadoPorUsuarioId: datos.enviadoPorUsuarioId ?? null,
				desdeTelefono: Boolean(datos.desdeTelefono),
				enviadoEn: datos.enviadoEn,
				metadatos: datos.metadatos ?? null
			})
			.onConflictDoNothing({ target: whatsappMensajes.waId })
			.returning({ id: whatsappMensajes.id });

		if (!insertado) {
			// El mensaje ya estaba registrado: el eco no vuelve a tocar los casos.
			return { guardado: true, casos: 0 };
		}

		const contenido = contenidoDeMensaje(datos);
		const contacto = formatearTelefonoUy(datos.telefono);

		for (const caso of casos) {
			await tx
				.insert(whatsappMensajesSeguimientos)
				.values({ mensajeId: insertado.id, seguimientoId: caso.id })
				.onConflictDoUpdate({
					target: [
						whatsappMensajesSeguimientos.mensajeId,
						whatsappMensajesSeguimientos.seguimientoId
					],
					set: { desvinculadoEn: null }
				});

			await tx
				.insert(seguimientosEventos)
				.values({
					seguimientoId: caso.id,
					tipo: 'WHATSAPP',
					canal: 'WHATSAPP',
					direccion: datos.direccion,
					contenido,
					autorUsuarioId: datos.enviadoPorUsuarioId ?? null,
					autorNombre:
						datos.direccion === 'ENTRANTE'
							? 'Cliente'
							: datos.desdeTelefono
								? 'Equipo (teléfono)'
								: 'Equipo',
					contacto,
					fechaHora: datos.enviadoEn,
					visibleCliente: true,
					estadoEntrega: datos.direccion === 'ENTRANTE' ? 'RECIBIDO' : 'ENVIADO',
					metadatos: {
						whatsappMensajeId: insertado.id,
						jid: datos.jid,
						desdeTelefono: Boolean(datos.desdeTelefono),
						tipo: datos.tipo
					}
				});

			const cambios: Record<string, unknown> = {
				// GREATEST evita que un mensaje atrasado retrase la actividad.
				ultimaActividad: sql`greatest(${seguimientos.ultimaActividad}, ${datos.enviadoEn}::timestamptz)`,
				ultimoContactoEn: sql`greatest(${seguimientos.ultimoContactoEn}, ${datos.enviadoEn}::timestamptz)`,
				ultimoCanal: 'WHATSAPP',
				version: sql`version + 1`
			};
			// Un entrante saca el caso de "esperando cliente"; un saliente lo
			// reabre si estaba pausado.
			if (datos.direccion === 'ENTRANTE' && caso.estado === 'ESPERANDO_CLIENTE') {
				cambios.estado = 'EN_SEGUIMIENTO';
			}
			if (
				datos.direccion === 'SALIENTE' &&
				['ESPERANDO_CLIENTE', 'PAUSADO'].includes(caso.estado)
			) {
				cambios.estado = 'EN_SEGUIMIENTO';
			}
			await tx.update(seguimientos).set(cambios).where(eq(seguimientos.id, caso.id));

			if (datos.direccion === 'ENTRANTE' && caso.responsableId) {
				await tx
					.insert(seguimientosNotificaciones)
					.values({
						seguimientoId: caso.id,
						usuarioId: caso.responsableId,
						tipo: 'WHATSAPP_ENTRANTE',
						titulo: `Nuevo WhatsApp de ${contacto} en ${caso.codigo}`,
						detalle: contenido.length > 160 ? `${contenido.slice(0, 157)}...` : contenido,
						actorUsuarioId: null,
						claveEvento: `wa:${datos.waId}`
					})
					.onConflictDoNothing();
			}
		}

		return { guardado: true, casos: casos.length };
	});
}

/** Registra un saliente enviado desde el CRM, en el caso puntual. */
export async function registrarSalienteWhatsApp(
	datos: MensajeWhatsAppEntrada & { seguimientoId: number }
): Promise<{ mensajeId: number; eventoId: number }> {
	return await db.transaction(async (tx) => {
		const [mensaje] = await tx
			.insert(whatsappMensajes)
			.values({
				waId: datos.waId,
				telefono: datos.telefono,
				jid: datos.jid,
				lid: datos.lid ?? null,
				direccion: 'SALIENTE',
				tipo: datos.tipo,
				texto: datos.texto,
				nombreArchivo: datos.nombreArchivo ?? null,
				mimetype: datos.mimetype ?? null,
				estado: datos.estado ?? 'ENVIADO',
				enviadoPorUsuarioId: datos.enviadoPorUsuarioId ?? null,
				desdeTelefono: false,
				enviadoEn: datos.enviadoEn,
				metadatos: datos.metadatos ?? null
			})
			.onConflictDoNothing({ target: whatsappMensajes.waId })
			.returning({ id: whatsappMensajes.id });

		// El eco pudo procesarse antes que la respuesta del envío: en ese caso
		// el evento ya existe y no se duplica.
		const mensajeId =
			mensaje?.id ??
			(
				await tx
					.select({ id: whatsappMensajes.id })
					.from(whatsappMensajes)
					.where(eq(whatsappMensajes.waId, datos.waId))
					.limit(1)
			)[0]?.id;
		if (!mensajeId) throw new Error('No se pudo registrar el mensaje saliente');
		if (!mensaje) return { mensajeId, eventoId: 0 };

		await tx
			.insert(whatsappMensajesSeguimientos)
			.values({ mensajeId, seguimientoId: datos.seguimientoId })
			.onConflictDoUpdate({
				target: [
					whatsappMensajesSeguimientos.mensajeId,
					whatsappMensajesSeguimientos.seguimientoId
				],
				set: { desvinculadoEn: null }
			});

		const [evento] = await tx
			.insert(seguimientosEventos)
			.values({
				seguimientoId: datos.seguimientoId,
				tipo: 'WHATSAPP',
				canal: 'WHATSAPP',
				direccion: 'SALIENTE',
				contenido: contenidoDeMensaje(datos),
				autorUsuarioId: datos.enviadoPorUsuarioId ?? null,
				contacto: formatearTelefonoUy(datos.telefono),
				fechaHora: datos.enviadoEn,
				visibleCliente: true,
				estadoEntrega: 'ENVIADO',
				metadatos: {
					whatsappMensajeId: mensajeId,
					jid: datos.jid,
					tipo: datos.tipo
				}
			})
			.returning({ id: seguimientosEventos.id });

		await tx
			.update(seguimientos)
			.set({
				ultimaActividad: sql`greatest(${seguimientos.ultimaActividad}, ${datos.enviadoEn}::timestamptz)`,
				ultimoContactoEn: sql`greatest(${seguimientos.ultimoContactoEn}, ${datos.enviadoEn}::timestamptz)`,
				ultimoCanal: 'WHATSAPP',
				version: sql`version + 1`
			})
			.where(eq(seguimientos.id, datos.seguimientoId));

		return { mensajeId: mensaje.id, eventoId: evento.id };
	});
}

/** Desvincula un mensaje de un caso: borra su evento y su aviso. */
export async function desvincularMensajeDeCaso(
	seguimientoId: number,
	mensajeId: number
): Promise<{ desvinculado: boolean }> {
	return await db.transaction(async (tx) => {
		const [mensaje] = await tx
			.select({ waId: whatsappMensajes.waId })
			.from(whatsappMensajes)
			.where(eq(whatsappMensajes.id, mensajeId))
			.limit(1);

		const [vinculo] = await tx
			.update(whatsappMensajesSeguimientos)
			.set({ desvinculadoEn: new Date() })
			.where(
				and(
					eq(whatsappMensajesSeguimientos.mensajeId, mensajeId),
					eq(whatsappMensajesSeguimientos.seguimientoId, seguimientoId),
					sql`${whatsappMensajesSeguimientos.desvinculadoEn} is null`
				)
			)
			.returning({ id: whatsappMensajesSeguimientos.id });

		if (!vinculo) return { desvinculado: false };

		await tx
			.delete(seguimientosEventos)
			.where(
				and(
					eq(seguimientosEventos.seguimientoId, seguimientoId),
					sql`${seguimientosEventos.metadatos}->>'whatsappMensajeId' = ${String(mensajeId)}`
				)
			);

		if (mensaje) {
			await tx
				.delete(seguimientosNotificaciones)
				.where(
					and(
						eq(seguimientosNotificaciones.seguimientoId, seguimientoId),
						eq(seguimientosNotificaciones.claveEvento, `wa:${mensaje.waId}`)
					)
				);
		}

		return { desvinculado: true };
	});
}

/**
 * Guarda un saliente que no pertenece a un seguimiento (cobranza individual).
 * No crea evento ni vínculo: queda como registro del envío.
 */
export async function registrarMensajeSinCaso(
	datos: MensajeWhatsAppEntrada
): Promise<number | null> {
	const [mensaje] = await db
		.insert(whatsappMensajes)
		.values({
			waId: datos.waId,
			telefono: datos.telefono,
			jid: datos.jid,
			lid: datos.lid ?? null,
			direccion: 'SALIENTE',
			tipo: datos.tipo,
			texto: datos.texto,
			nombreArchivo: datos.nombreArchivo ?? null,
			mimetype: datos.mimetype ?? null,
			estado: datos.estado ?? 'ENVIADO',
			enviadoPorUsuarioId: datos.enviadoPorUsuarioId ?? null,
			desdeTelefono: false,
			enviadoEn: datos.enviadoEn,
			metadatos: datos.metadatos ?? null
		})
		.onConflictDoNothing({ target: whatsappMensajes.waId })
		.returning({ id: whatsappMensajes.id });
	return mensaje?.id ?? null;
}

/** Actualiza el estado de entrega de un saliente (ack de WhatsApp). */
export async function actualizarEstadoMensaje(
	waId: string,
	estado: EstadoMensajeWhatsApp
): Promise<void> {
	await db
		.update(whatsappMensajes)
		.set({ estado })
		.where(eq(whatsappMensajes.waId, waId));
}
