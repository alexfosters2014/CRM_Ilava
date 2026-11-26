import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { and, desc, eq, sql } from 'drizzle-orm';
import { BETTER_AUTH_SECRET, GMAIL_PUBSUB_SECRET, GMAIL_PUBSUB_TOPIC, GMAIL_SYNC_INTERVALO_MINUTOS } from '$app/env/private';
import {
	db,
	gmailCuentas,
	seguimientos,
	seguimientosCorreos,
	seguimientosEventos,
	seguimientosNotificaciones,
	seguimientosParticipantes,
	servicios,
	serviciosEmails,
	ticketCorreos,
	ticketCorreoEnvios,
	tickets,
	user
} from '../base-datos/index.ts';
import { cifrarCredencial, descifrarCredencial } from '../autenticacion/cifrado.ts';
import { extraerAliasTicket } from '../servicios/gmail-texto.ts';
import type { UsuarioSesion } from '../permisos/reglas.ts';
import {
	ErrorGmail,
	construirReplyTo,
	enviarMensaje,
	extraerAliasSeguimiento,
	extraerCodigoSeguimiento,
	extraerCodigoTicket,
	gmailConfigurado,
	iniciarWatch,
	intercambiarCodigo,
	listarHistorial,
	listarMensajes,
	obtenerMensaje,
	obtenerPerfil,
	refrescarToken,
	urlConsentimiento,
	detenerWatch,
	type MensajeGmail,
	type TokensOAuth
} from '../servicios/gmail.ts';
import { registrarCorreoEntrante } from './tickets.ts';
import { sincronizarTicketEnSeguimientos } from './tickets-seguimiento.ts';
/**
 * Repositorio: conector Gmail API.
 *
 * Decisiones:
 * - Los tokens se guardan cifrados; nunca salen por la API.
 * - La sincronización es por sondeo (`history.list` con fallback a
 *   `messages.list`). El watch de Pub/Sub queda para una etapa posterior.
 * - Un mensaje se incorpora una sola vez por cuenta (índice único por
 *   `gmail_message_id`).
 * - El orden de vinculación es el del prompt: hilo → In-Reply-To/References →
 *   alias `seguimiento+SEG-...` → `[SEG-...]`/`[TCK-...]` en el asunto.
 * - Si no hay coincidencia segura, el correo queda en la bandeja de pendientes.
 */

export class ErrorGmailRepo extends Error {
	constructor(
		readonly codigo:
			| 'NO_CONFIGURADO'
			| 'NO_ENCONTRADO'
			| 'SIN_PERMISO'
			| 'SIN_CUENTA'
			| 'TOKEN'
			| 'API'
			| 'ESTADO_INVALIDO'
			| 'CONFLICTO',
		mensaje: string
	) {
		super(mensaje);
		this.name = 'ErrorGmailRepo';
	}
}

export interface GmailCuentaVista {
	id: number;
	email: string;
	nombre: string | null;
	activo: boolean;
	historyId: string | null;
	ultimaSincronizacion: string | null;
	watchExpiraEn: string | null;
	ultimoError: string | null;
	creadoEn: string;
}

function vista(cuenta: typeof gmailCuentas.$inferSelect): GmailCuentaVista {
	return {
		id: cuenta.id,
		email: cuenta.email,
		nombre: cuenta.nombre,
		activo: cuenta.activo,
		historyId: cuenta.historyId,
		ultimaSincronizacion: cuenta.ultimaSincronizacion?.toISOString() ?? null,
		watchExpiraEn: cuenta.watchExpiraEn?.toISOString() ?? null,
		ultimoError: cuenta.ultimoError,
		creadoEn: cuenta.creadoEn.toISOString()
	};
}

export function gmailDisponible(): boolean {
	return gmailConfigurado();
}

export async function listarCuentasGmail(): Promise<GmailCuentaVista[]> {
	const filas = await db.select().from(gmailCuentas).orderBy(desc(gmailCuentas.activo), gmailCuentas.email);
	return filas.map(vista);
}

export async function listarCuentasGmailParaEnvio(
	usuario: UsuarioSesion
): Promise<{ id: number; email: string; nombre: string | null }[]> {
	const condicion =
		usuario.admin || usuario.areaNombre === 'TODOS'
			? undefined
			: eq(gmailCuentas.areaId, usuario.areaId ?? -1);
	const filas = await db
		.select({ id: gmailCuentas.id, email: gmailCuentas.email, nombre: gmailCuentas.nombre })
		.from(gmailCuentas)
		.where(and(eq(gmailCuentas.activo, true), condicion))
		.orderBy(gmailCuentas.email);
	return filas;
}

// --------------------------------------------------------------- OAuth state

const ESTADO_VALIDEZ_MS = 10 * 60 * 1000;

function firmaEstado(payload: string): string {
	return createHmac('sha256', BETTER_AUTH_SECRET ?? '').update(payload).digest('base64url');
}

export function crearEstadoOAuth(usuarioId: string): string {
	const payload = Buffer.from(
		JSON.stringify({ u: usuarioId, ts: Date.now(), n: randomBytes(8).toString('hex') })
	).toString('base64url');
	return `${payload}.${firmaEstado(payload)}`;
}

export function validarEstadoOAuth(estado: string): string {
	const [payload, firma] = estado.split('.');
	if (!payload || !firma) throw new ErrorGmailRepo('ESTADO_INVALIDO', 'Estado OAuth inválido');
	const esperada = Buffer.from(firmaEstado(payload));
	const recibida = Buffer.from(firma);
	if (esperada.length !== recibida.length || !timingSafeEqual(esperada, recibida)) {
		throw new ErrorGmailRepo('ESTADO_INVALIDO', 'Estado OAuth inválido');
	}
	const datos = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
		u?: string;
		ts?: number;
	};
	if (!datos.u || !datos.ts || Date.now() - datos.ts > ESTADO_VALIDEZ_MS) {
		throw new ErrorGmailRepo('ESTADO_INVALIDO', 'El estado OAuth expiró');
	}
	return datos.u;
}

export function urlInicioOAuth(usuarioId: string): string {
	if (!gmailConfigurado()) {
		throw new ErrorGmailRepo(
			'NO_CONFIGURADO',
			'Gmail API no está configurada: faltan GMAIL_CLIENT_ID y GMAIL_CLIENT_SECRET'
		);
	}
	return urlConsentimiento(crearEstadoOAuth(usuarioId));
}

/** Intercambia el código, lee el perfil y guarda/actualiza la cuenta. */
export async function conectarCuentaGmail(
	code: string,
	usuarioId: string
): Promise<GmailCuentaVista> {
	const tokens = await intercambiarCodigo(code);
	const perfil = await obtenerPerfil(tokens.accessToken);
	const [existente] = await db
		.select()
		.from(gmailCuentas)
		.where(eq(gmailCuentas.email, perfil.email))
		.limit(1);
	const [autor] = await db
		.select({ areaId: user.areaId })
		.from(user)
		.where(eq(user.id, usuarioId))
		.limit(1);

	const refreshCifrado = tokens.refreshToken
		? cifrarCredencial(tokens.refreshToken)
		: existente?.refreshTokenCifrado;
	if (!refreshCifrado) {
		throw new ErrorGmailRepo(
			'TOKEN',
			'Google no devolvió refresh_token. Revocá el acceso de la app y volvé a conectar.'
		);
	}

	const valores = {
		email: perfil.email,
		nombre: existente?.nombre ?? perfil.email.split('@')[0],
		areaId: existente?.areaId ?? autor?.areaId ?? null,
		refreshTokenCifrado: refreshCifrado,
		accessTokenCifrado: cifrarCredencial(tokens.accessToken),
		accessTokenExpiraEn: tokens.expiraEn,
		scope: tokens.scope,
		historyId: existente?.historyId ?? perfil.historyId,
		ultimoError: null,
		activo: true,
		actualizadoEn: new Date()
	};

	const [cuenta] = existente
		? await db.update(gmailCuentas).set(valores).where(eq(gmailCuentas.id, existente.id)).returning()
		: await db
				.insert(gmailCuentas)
				.values({ ...valores, creadoPor: usuarioId })
				.returning();
	// Si hay Pub/Sub configurado, la casilla queda en tiempo real desde el inicio.
	await asegurarWatchPorId(cuenta.id);
	return vista(cuenta);
}

export async function desconectarCuentaGmail(id: number): Promise<boolean> {
	const [cuenta] = await db.select().from(gmailCuentas).where(eq(gmailCuentas.id, id)).limit(1);
	if (!cuenta) return false;
	await detenerWatchCuenta(cuenta);
	const [actualizada] = await db
		.update(gmailCuentas)
		.set({
			activo: false,
			accessTokenCifrado: null,
			accessTokenExpiraEn: null,
			watchExpiraEn: null,
			actualizadoEn: new Date()
		})
		.where(eq(gmailCuentas.id, id))
		.returning({ id: gmailCuentas.id });
	return Boolean(actualizada);
}

/** Access token válido: usa el cache y refresca si está por vencer o vencido. */
async function tokenDeCuenta(cuenta: typeof gmailCuentas.$inferSelect): Promise<string> {
	if (
		cuenta.accessTokenCifrado &&
		cuenta.accessTokenExpiraEn &&
		cuenta.accessTokenExpiraEn.getTime() > Date.now() + 60_000
	) {
		try {
			return descifrarCredencial(cuenta.accessTokenCifrado);
		} catch {
			// Si el token guardado no se puede descifrar, se regenera abajo.
		}
	}
	const refresh = descifrarCredencial(cuenta.refreshTokenCifrado);
	let tokens: TokensOAuth;
	try {
		tokens = await refrescarToken(refresh);
	} catch (error) {
		const mensaje =
			error instanceof Error ? error.message : 'No se pudo refrescar el token de Gmail';
		await db
			.update(gmailCuentas)
			.set({ ultimoError: mensaje, actualizadoEn: new Date() })
			.where(eq(gmailCuentas.id, cuenta.id));
		throw error;
	}
	await db
		.update(gmailCuentas)
		.set({
			accessTokenCifrado: cifrarCredencial(tokens.accessToken),
			accessTokenExpiraEn: tokens.expiraEn,
			refreshTokenCifrado: cifrarCredencial(tokens.refreshToken ?? refresh),
			ultimoError: null,
			actualizadoEn: new Date()
		})
		.where(eq(gmailCuentas.id, cuenta.id));
	return tokens.accessToken;
}

export async function verificarCuentaGmail(
	id: number
): Promise<{ ok: true; email: string } | { ok: false; error: string }> {
	const [cuenta] = await db.select().from(gmailCuentas).where(eq(gmailCuentas.id, id)).limit(1);
	if (!cuenta) throw new ErrorGmailRepo('NO_ENCONTRADO', 'La cuenta Gmail no existe');
	try {
		const perfil = await obtenerPerfil(await tokenDeCuenta(cuenta));
		await db
			.update(gmailCuentas)
			.set({ ultimoError: null, actualizadoEn: new Date() })
			.where(eq(gmailCuentas.id, id));
		return { ok: true, email: perfil.email };
	} catch (error) {
		const mensaje = mensajeDeError(error);
		await db
			.update(gmailCuentas)
			.set({ ultimoError: mensaje, actualizadoEn: new Date() })
			.where(eq(gmailCuentas.id, id));
		return { ok: false, error: mensaje };
	}
}

function mensajeDeError(error: unknown): string {
	if (error instanceof ErrorGmail) return error.message;
	if (error instanceof Error) return error.message;
	return 'Error desconocido de Gmail';
}

function extraerEmail(valor: string): string {
	const coincidencia = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.exec(valor);
	return coincidencia ? coincidencia[0].toLowerCase() : valor.trim().toLowerCase();
}

function extraerEmails(valor: string): string[] {
	const encontrados = valor.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? [];
	return [...new Set(encontrados.map((email) => email.toLowerCase()))];
}

interface DestinoCorreo {
	seguimientoId?: number;
	ticketId?: number;
	codigo?: string;
}

/**
 * Resuelve el destino de un mensaje entrante con el orden de prioridad del
 * prompt. Devuelve null si no hay coincidencia segura.
 */
export async function vincularMensaje(
	mensaje: MensajeGmail
): Promise<DestinoCorreo | null> {
	const alias = extraerAliasSeguimiento(`${mensaje.para} ${mensaje.cc}`);
	const aliasTck = extraerAliasTicket(`${mensaje.para} ${mensaje.cc}`);
	const asuntoSeg = extraerCodigoSeguimiento(mensaje.asunto);
	const asuntoTck = extraerCodigoTicket(mensaje.asunto);

	// 1. Hilo del proveedor.
	if (mensaje.threadId) {
		const [seg] = await db
			.select({ id: seguimientosCorreos.seguimientoId })
			.from(seguimientosCorreos)
			.where(
				and(
					eq(seguimientosCorreos.threadId, mensaje.threadId),
					sql`${seguimientosCorreos.seguimientoId} is not null`
				)
			)
			.limit(1);
		if (seg?.id) return { seguimientoId: seg.id };
		const [tck] = await db
			.select({ id: ticketCorreos.ticketId, codigo: tickets.codigoVisible })
			.from(ticketCorreos)
			.innerJoin(tickets, eq(tickets.id, ticketCorreos.ticketId))
			.where(eq(ticketCorreos.threadId, mensaje.threadId))
			.limit(1);
		if (tck?.id) return { ticketId: tck.id, codigo: tck.codigo };
	}

	// 2. In-Reply-To / References contra el Message-ID guardado.
	const candidatos = [mensaje.inReplyTo, mensaje.referencias]
		.filter(Boolean)
		.map((valor) => valor as string);
	for (const candidato of candidatos) {
		const ids = (candidato.match(/<[^>]+>/g) ?? [candidato]).slice(0, 20);
		for (const id of ids) {
			const [seg] = await db
				.select({ id: seguimientosCorreos.seguimientoId })
				.from(seguimientosCorreos)
				.where(
					and(
						eq(seguimientosCorreos.messageIdHeader, id),
						sql`${seguimientosCorreos.seguimientoId} is not null`
					)
				)
				.limit(1);
			if (seg?.id) return { seguimientoId: seg.id };
			const [tck] = await db
				.select({ id: ticketCorreos.ticketId, codigo: tickets.codigoVisible })
				.from(ticketCorreos)
				.innerJoin(tickets, eq(tickets.id, ticketCorreos.ticketId))
				.where(eq(ticketCorreos.messageId, id))
				.limit(1);
			if (tck?.id) return { ticketId: tck.id, codigo: tck.codigo };
		}
	}

	// 3. Alias único de Reply-To / destinatario.
	if (alias) {
		const [seg] = await db
			.select({ id: seguimientos.id })
			.from(seguimientos)
			.where(eq(seguimientos.codigoVisible, alias))
			.limit(1);
		if (seg) return { seguimientoId: seg.id };
	}
	if (aliasTck) {
		const [tck] = await db
			.select({ id: tickets.id, codigo: tickets.codigoVisible })
			.from(tickets)
			.where(eq(tickets.codigoVisible, aliasTck))
			.limit(1);
		if (tck) return { ticketId: tck.id, codigo: tck.codigo };
	}

	// 4. Identificador en el asunto.
	if (asuntoSeg) {
		const [seg] = await db
			.select({ id: seguimientos.id })
			.from(seguimientos)
			.where(eq(seguimientos.codigoVisible, asuntoSeg))
			.limit(1);
		if (seg) return { seguimientoId: seg.id };
	}
	if (asuntoTck) {
		const [tck] = await db
			.select({ id: tickets.id, codigo: tickets.codigoVisible })
			.from(tickets)
			.where(eq(tickets.codigoVisible, asuntoTck))
			.limit(1);
		if (tck) return { ticketId: tck.id, codigo: tck.codigo };
	}

	// 5. Sin coincidencia segura: no se adivina.
	return null;
}

async function servicioSugerido(de: string): Promise<number | null> {
	const email = extraerEmail(de);
	if (!email) return null;
	const [fila] = await db
		.select({ servicioId: serviciosEmails.servicioId })
		.from(serviciosEmails)
		.where(and(eq(serviciosEmails.email, email), eq(serviciosEmails.activo, true)))
		.limit(1);
	return fila?.servicioId ?? null;
}

async function registrarEntranteEnSeguimiento(
	seguimientoId: number,
	mensaje: MensajeGmail,
	cuenta: typeof gmailCuentas.$inferSelect
): Promise<void> {
	await db.transaction(async (tx) => {
		const [correo] = await tx
			.insert(seguimientosCorreos)
			.values({
				seguimientoId,
				servicioId: await servicioSugerido(mensaje.de),
				cuentaId: cuenta.id,
				proveedor: 'GMAIL',
				direccion: 'ENTRANTE',
				gmailMessageId: mensaje.id,
				threadId: mensaje.threadId,
				historyId: mensaje.historyId,
				internalDate: mensaje.internalDate,
				messageIdHeader: mensaje.messageId,
				inReplyTo: mensaje.inReplyTo,
				referencias: mensaje.referencias,
				de: mensaje.de,
				para: mensaje.para,
				cc: mensaje.cc || null,
				asunto: mensaje.asunto,
				cuerpo: mensaje.texto,
				fechaHora: mensaje.internalDate,
				estadoVinculacion: 'AUTOMATICO',
				vinculadoEn: new Date(),
				adjuntos: mensaje.adjuntos,
				metadatos: { html: Boolean(mensaje.html), labels: mensaje.labelIds }
			})
			.returning({ id: seguimientosCorreos.id });

		const [base] = await tx
			.select({
				estado: seguimientos.estado,
				version: seguimientos.version,
				codigo: seguimientos.codigoVisible,
				responsable: seguimientos.responsableUsuarioId
			})
			.from(seguimientos)
			.where(eq(seguimientos.id, seguimientoId))
			.limit(1);

		await tx.insert(seguimientosEventos).values({
			seguimientoId,
			tipo: 'CORREO',
			canal: 'CORREO',
			direccion: 'ENTRANTE',
			contenido: mensaje.texto || '(sin cuerpo)',
			autorNombre: mensaje.de,
			contacto: extraerEmail(mensaje.de),
			fechaHora: mensaje.internalDate,
			visibleCliente: true,
			estadoEntrega: 'RECIBIDO',
			correoId: correo.id,
			metadatos: {
				asunto: mensaje.asunto,
				para: mensaje.para,
				messageId: mensaje.messageId,
				threadId: mensaje.threadId,
				vinculacion: 'AUTOMATICO'
			}
		});

		const cambios: Record<string, unknown> = {
			ultimaActividad: new Date(),
			ultimoContactoEn: mensaje.internalDate,
			ultimoCanal: 'CORREO',
			version: (base?.version ?? 1) + 1
		};
		if (base?.estado === 'ESPERANDO_CLIENTE') {
			cambios.estado = 'EN_SEGUIMIENTO';
			await tx.insert(seguimientosEventos).values({
				seguimientoId,
				tipo: 'ESTADO',
				canal: 'SISTEMA',
				direccion: 'INTERNA',
				contenido: 'Recibió respuesta del cliente: el caso vuelve a En seguimiento.',
				metadatos: { anterior: 'ESPERANDO_CLIENTE', nuevo: 'EN_SEGUIMIENTO', origen: 'GMAIL' }
			});
		}
		await tx.update(seguimientos).set(cambios).where(eq(seguimientos.id, seguimientoId));

		// Aviso al responsable y a los observadores; si responde un usuario
		// interno, no se auto-notifica.
		const remitente = extraerEmail(mensaje.de);
		const [autor] = await tx
			.select({ id: user.id })
			.from(user)
			.where(eq(user.email, remitente))
			.limit(1);
		const observadores = await tx
			.select({ usuarioId: seguimientosParticipantes.usuarioId })
			.from(seguimientosParticipantes)
			.where(
				and(
					eq(seguimientosParticipantes.seguimientoId, seguimientoId),
					eq(seguimientosParticipantes.rol, 'OBSERVADOR'),
					eq(seguimientosParticipantes.activo, true)
				)
			);
		const destinatarios = [
			...(base?.responsable ? [base.responsable] : []),
			...observadores.map((fila) => fila.usuarioId)
		].filter((usuarioId) => usuarioId !== autor?.id);
		if (destinatarios.length > 0) {
			await tx
				.insert(seguimientosNotificaciones)
				.values(
					[...new Set(destinatarios)].map((usuarioId) => ({
						seguimientoId,
						usuarioId,
						tipo: 'CORREO_RECIBIDO',
						titulo: `Respuesta de correo en ${base?.codigo ?? 'el seguimiento'}`,
						detalle: mensaje.asunto || mensaje.texto.slice(0, 160),
						claveEvento: `correo:${mensaje.id}`
					}))
				)
				.onConflictDoNothing();
		}
	});
}

async function registrarPendiente(
	mensaje: MensajeGmail,
	cuenta: typeof gmailCuentas.$inferSelect
): Promise<void> {
	await db
		.insert(seguimientosCorreos)
		.values({
			seguimientoId: null,
			servicioId: await servicioSugerido(mensaje.de),
			cuentaId: cuenta.id,
			proveedor: 'GMAIL',
			direccion: 'ENTRANTE',
			gmailMessageId: mensaje.id,
			threadId: mensaje.threadId,
			historyId: mensaje.historyId,
			internalDate: mensaje.internalDate,
			messageIdHeader: mensaje.messageId,
			inReplyTo: mensaje.inReplyTo,
			referencias: mensaje.referencias,
			de: mensaje.de,
			para: mensaje.para,
			cc: mensaje.cc || null,
			asunto: mensaje.asunto,
			cuerpo: mensaje.texto,
			fechaHora: mensaje.internalDate,
			estadoVinculacion: 'PENDIENTE',
			adjuntos: mensaje.adjuntos,
			metadatos: {
				motivo: 'Sin coincidencia segura de hilo, encabezados, alias ni identificador',
				labels: mensaje.labelIds
			}
		})
		.onConflictDoNothing();
}

async function registrarProcesadoGmail(
	mensaje: MensajeGmail,
	cuenta: typeof gmailCuentas.$inferSelect,
	metadatos: Record<string, unknown>
): Promise<void> {
	await db
		.insert(seguimientosCorreos)
		.values({
			seguimientoId: null,
			servicioId: null,
			cuentaId: cuenta.id,
			proveedor: 'GMAIL',
			direccion: 'ENTRANTE',
			gmailMessageId: mensaje.id,
			threadId: mensaje.threadId,
			historyId: mensaje.historyId,
			internalDate: mensaje.internalDate,
			messageIdHeader: mensaje.messageId,
			inReplyTo: mensaje.inReplyTo,
			referencias: mensaje.referencias,
			de: mensaje.de,
			para: mensaje.para,
			asunto: mensaje.asunto,
			cuerpo: null,
			fechaHora: mensaje.internalDate,
			estadoVinculacion: 'DESCARTADO',
			metadatos
		})
		.onConflictDoNothing();
}

async function procesarMensaje(
	cuenta: typeof gmailCuentas.$inferSelect,
	mensaje: MensajeGmail
): Promise<'SEGUIMIENTO' | 'TICKET' | 'PENDIENTE' | 'DUPLICADO'> {
	const esEnviado = mensaje.labelIds.includes('SENT');
	const [existente] = await db
		.select({ id: seguimientosCorreos.id })
		.from(seguimientosCorreos)
		.where(
			and(
				eq(seguimientosCorreos.cuentaId, cuenta.id),
				eq(seguimientosCorreos.gmailMessageId, mensaje.id)
			)
		)
		.limit(1);
	if (existente) return 'DUPLICADO';

	// Copias de un envío del CRM a varios destinatarios: cada una tiene su
	// propio Gmail message id y no debe entrar como respuesta.
	const [enviadoPorCrm] = await db
		.select({ id: ticketCorreoEnvios.id })
		.from(ticketCorreoEnvios)
		.where(eq(ticketCorreoEnvios.gmailMessageId, mensaje.id))
		.limit(1);
	if (enviadoPorCrm) return 'DUPLICADO';

	const destino = await vincularMensaje(mensaje);
	if (destino?.seguimientoId) {
		await registrarEntranteEnSeguimiento(destino.seguimientoId, mensaje, cuenta);
		return 'SEGUIMIENTO';
	}
	if (destino?.ticketId) {
		const [yaIncorporado] = mensaje.messageId
			? await db
					.select({ id: ticketCorreos.id })
					.from(ticketCorreos)
					.where(eq(ticketCorreos.messageId, mensaje.messageId))
					.limit(1)
			: [];
		if (yaIncorporado) {
			await registrarProcesadoGmail(mensaje, cuenta, { ticketId: destino.ticketId });
			return 'DUPLICADO';
		}
		try {
			await registrarCorreoEntrante(destino.ticketId, {
				de: extraerEmail(mensaje.de),
				para: extraerEmails(mensaje.para),
				asunto: mensaje.asunto,
				cuerpo: mensaje.texto || '(sin cuerpo)',
				messageId: mensaje.messageId,
				threadId: mensaje.threadId,
				inReplyTo: mensaje.inReplyTo,
				fecha: mensaje.internalDate.toISOString()
			});
			await registrarProcesadoGmail(mensaje, cuenta, { ticketId: destino.ticketId });
			// Reflejo resumido en los seguimientos vinculados al ticket.
			await sincronizarTicketEnSeguimientos({
				ticketId: destino.ticketId,
				codigo: destino.codigo ?? '',
				tipoEvento: 'MENSAJE',
				detalle: `recibió una respuesta por correo${mensaje.asunto ? `: ${mensaje.asunto.slice(0, 120)}` : ''}`,
				ticketAbierto: true,
				clave: `mensaje:${mensaje.id}`
			});
			return 'TICKET';
		} catch {
			// Ticket cerrado: el correo va a la bandeja para no perderlo.
		}
	}
	// Un mensaje Enviado que no se pudo vincular es correo propio (no una
	// respuesta de un tercero): no se encola como pendiente.
	if (esEnviado) return 'DUPLICADO';
	await registrarPendiente(mensaje, cuenta);
	return 'PENDIENTE';
}

export interface ResultadoSincronizacion {
	cuenta: string;
	nuevos: number;
	vinculadosSeguimiento: number;
	vinculadosTicket: number;
	pendientes: number;
	error: string | null;
}

export async function sincronizarCuentaGmail(
	id: number
): Promise<ResultadoSincronizacion> {
	const [cuenta] = await db.select().from(gmailCuentas).where(eq(gmailCuentas.id, id)).limit(1);
	if (!cuenta) throw new ErrorGmailRepo('NO_ENCONTRADO', 'La cuenta Gmail no existe');
	if (!cuenta.activo) throw new ErrorGmailRepo('NO_ENCONTRADO', 'La cuenta Gmail está desconectada');

	const resultado: ResultadoSincronizacion = {
		cuenta: cuenta.email,
		nuevos: 0,
		vinculadosSeguimiento: 0,
		vinculadosTicket: 0,
		pendientes: 0,
		error: null
	};

	try {
		const accessToken = await tokenDeCuenta(cuenta);
		let ids: string[] = [];
		let nuevoHistoryId: string | null = cuenta.historyId;

		if (cuenta.historyId) {
			try {
				const historial = await listarHistorial(accessToken, cuenta.historyId);
				ids = historial.ids;
				nuevoHistoryId = historial.historyId ?? nuevoHistoryId;
			} catch (error) {
				const status = error instanceof ErrorGmail ? error.status : undefined;
				if (status === 404) {
					// Cursor viejo: se recupera con una ventana corta y se reinicia.
					// `in:anywhere` incluye Enviados y Spam; los enviados propios
					// sin ticket/SEG se descartan en procesarMensaje.
					const lista = await listarMensajes(accessToken, 'in:anywhere newer_than:2d', 50);
					ids = lista.map((mensaje) => mensaje.id);
					nuevoHistoryId = null;
				} else {
					throw error;
				}
			}
		} else {
			const lista = await listarMensajes(accessToken, 'in:anywhere newer_than:2d', 50);
			ids = lista.map((mensaje) => mensaje.id);
		}

		for (const idMensaje of ids) {
			try {
				const mensaje = await obtenerMensaje(accessToken, idMensaje);
				const estado = await procesarMensaje(cuenta, mensaje);
				if (mensaje.historyId && (!nuevoHistoryId || Number(mensaje.historyId) > Number(nuevoHistoryId))) {
					nuevoHistoryId = mensaje.historyId;
				}
				if (estado === 'DUPLICADO') continue;
				resultado.nuevos++;
				if (estado === 'SEGUIMIENTO') resultado.vinculadosSeguimiento++;
				if (estado === 'TICKET') resultado.vinculadosTicket++;
				if (estado === 'PENDIENTE') resultado.pendientes++;
			} catch (error) {
				// Un mensaje borrado o inaccesible no debe abortar el resto del
				// lote: se omite y el cursor sigue avanzando.
				if (error instanceof ErrorGmail && error.status === 404) continue;
				throw error;
			}
		}

		await db
			.update(gmailCuentas)
			.set({
				historyId: nuevoHistoryId,
				ultimaSincronizacion: new Date(),
				ultimoError: null,
				actualizadoEn: new Date()
			})
			.where(eq(gmailCuentas.id, cuenta.id));
	} catch (error) {
		resultado.error = mensajeDeError(error);
		await db
			.update(gmailCuentas)
			.set({
				ultimoError: resultado.error,
				ultimaSincronizacion: new Date(),
				actualizadoEn: new Date()
			})
			.where(eq(gmailCuentas.id, cuenta.id));
	}

	return resultado;
}

export async function sincronizarTodasLasCuentasGmail(): Promise<ResultadoSincronizacion[]> {
	if (!gmailConfigurado()) return [];
	const cuentas = await db
		.select({ id: gmailCuentas.id })
		.from(gmailCuentas)
		.where(eq(gmailCuentas.activo, true));
	const resultados: ResultadoSincronizacion[] = [];
	for (const cuenta of cuentas) {
		resultados.push(await sincronizarCuentaGmail(cuenta.id));
	}
	return resultados;
}

let temporizador: ReturnType<typeof setInterval> | undefined;
let temporizadorWatch: ReturnType<typeof setInterval> | undefined;

/** Arranca el sondeo periódico y la renovación de watch. Idempotente. */
export function iniciarSincronizacionGmail(): void {
	const clave = '__crmGmailSyncIniciado';
	const global = globalThis as typeof globalThis & { [clave]?: boolean };
	if (global[clave] || !gmailConfigurado()) return;
	global[clave] = true;
	const minutos = Math.max(1, Number(GMAIL_SYNC_INTERVALO_MINUTOS ?? 2));
	temporizador = setInterval(() => {
		void sincronizarTodasLasCuentasGmail().catch((error) => {
			console.error('[gmail] error de sincronización:', mensajeDeError(error));
		});
	}, minutos * 60_000);
	// Primera pasada diferida para no demorar el arranque del servidor.
	setTimeout(() => {
		void sincronizarTodasLasCuentasGmail().catch(() => null);
	}, 20_000);

	if (pubsubConfigurado()) {
		temporizadorWatch = setInterval(() => {
			void renovarWatchesGmail().catch((error) => {
				console.error('[gmail] error al renovar watch:', mensajeDeError(error));
			});
		}, 6 * 60 * 60_000);
		setTimeout(() => {
			void renovarWatchesGmail().catch(() => null);
		}, 30_000);
	}
}

export function detenerSincronizacionGmail(): void {
	if (temporizador) clearInterval(temporizador);
	if (temporizadorWatch) clearInterval(temporizadorWatch);
	temporizador = undefined;
	temporizadorWatch = undefined;
}

// ------------------------------------------------------------ Tiempo real

export function pubsubConfigurado(): boolean {
	return Boolean(GMAIL_PUBSUB_TOPIC?.trim() && GMAIL_PUBSUB_SECRET?.trim());
}

/** Compara el secreto del path del push sin filtrar tiempos. */
export function secretoPubSubValido(recibido: string): boolean {
	const esperado = GMAIL_PUBSUB_SECRET?.trim();
	if (!esperado || !recibido) return false;
	const a = Buffer.from(esperado);
	const b = Buffer.from(recibido);
	return a.length === b.length && timingSafeEqual(a, b);
}

async function asegurarWatch(cuenta: typeof gmailCuentas.$inferSelect): Promise<boolean> {
	const topic = GMAIL_PUBSUB_TOPIC?.trim();
	if (!topic || !GMAIL_PUBSUB_SECRET?.trim()) return false;
	try {
		const watch = await iniciarWatch(await tokenDeCuenta(cuenta), topic);
		await db
			.update(gmailCuentas)
			.set({ watchExpiraEn: watch.expiraEn, ultimoError: null, actualizadoEn: new Date() })
			.where(eq(gmailCuentas.id, cuenta.id));
		return true;
	} catch (error) {
		await db
			.update(gmailCuentas)
			.set({
				ultimoError: `Watch: ${mensajeDeError(error)}`,
				actualizadoEn: new Date()
			})
			.where(eq(gmailCuentas.id, cuenta.id));
		return false;
	}
}

/** Activa el watch de una cuenta recién conectada (si hay Pub/Sub configurado). */
export async function asegurarWatchPorId(id: number): Promise<boolean> {
	const [cuenta] = await db.select().from(gmailCuentas).where(eq(gmailCuentas.id, id)).limit(1);
	if (!cuenta || !cuenta.activo) return false;
	return await asegurarWatch(cuenta);
}

/** Renueva los watch que vencen en menos de 24 h. Gmail los da por 7 días. */
export async function renovarWatchesGmail(): Promise<{ renovados: number; errores: number }> {
	if (!pubsubConfigurado()) return { renovados: 0, errores: 0 };
	const cuentas = await db
		.select()
		.from(gmailCuentas)
		.where(eq(gmailCuentas.activo, true));
	let renovados = 0;
	let errores = 0;
	const limite = Date.now() + 24 * 60 * 60 * 1000;
	for (const cuenta of cuentas) {
		if (cuenta.watchExpiraEn && cuenta.watchExpiraEn.getTime() > limite) continue;
		if (await asegurarWatch(cuenta)) renovados++;
		else errores++;
	}
	return { renovados, errores };
}

async function detenerWatchCuenta(cuenta: typeof gmailCuentas.$inferSelect): Promise<void> {
	if (!pubsubConfigurado()) return;
	try {
		await detenerWatch(await tokenDeCuenta(cuenta));
	} catch {
		// Si el token ya no sirve, igual se desconecta localmente.
	}
	await db
		.update(gmailCuentas)
		.set({ watchExpiraEn: null, actualizadoEn: new Date() })
		.where(eq(gmailCuentas.id, cuenta.id));
}

const sincronizacionesEnCurso = new Map<number, Promise<ResultadoSincronizacion>>();

/** Evita que dos pushes de la misma casilla corran sync en paralelo. */
export async function sincronizarCuentaConLock(id: number): Promise<ResultadoSincronizacion> {
	const actual = sincronizacionesEnCurso.get(id);
	if (actual) return await actual;
	const promesa = sincronizarCuentaGmail(id).finally(() => {
		sincronizacionesEnCurso.delete(id);
	});
	sincronizacionesEnCurso.set(id, promesa);
	return await promesa;
}

export interface NotificacionGmail {
	emailAddress: string;
	historyId?: string | null;
}

/** Procesa el JSON que Pub/Sub entrega en `message.data`. */
export async function procesarNotificacionGmail(
	datos: NotificacionGmail
): Promise<
	| { estado: 'IGNORADO'; motivo: string }
	| { estado: 'SINCRONIZADO'; cuenta: string; resultado: ResultadoSincronizacion }
> {
	const email = datos.emailAddress.trim().toLowerCase();
	if (!email) return { estado: 'IGNORADO', motivo: 'Sin emailAddress' };
	const [cuenta] = await db
		.select({ id: gmailCuentas.id, email: gmailCuentas.email })
		.from(gmailCuentas)
		.where(sql`lower(${gmailCuentas.email}) = ${email}`)
		.limit(1);
	if (!cuenta) return { estado: 'IGNORADO', motivo: 'Cuenta no conectada' };
	const [activa] = await db
		.select({ activo: gmailCuentas.activo })
		.from(gmailCuentas)
		.where(eq(gmailCuentas.id, cuenta.id))
		.limit(1);
	if (!activa?.activo) return { estado: 'IGNORADO', motivo: 'Cuenta desconectada' };
	const resultado = await sincronizarCuentaConLock(cuenta.id);
	return { estado: 'SINCRONIZADO', cuenta: cuenta.email, resultado };
}

// ------------------------------------------------------------------ Envío

function escaparHtml(texto: string): string {
	return texto
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

async function exigirCuenta(
	usuario: UsuarioSesion,
	id: number
): Promise<typeof gmailCuentas.$inferSelect> {
	const [cuenta] = await db.select().from(gmailCuentas).where(eq(gmailCuentas.id, id)).limit(1);
	if (!cuenta || !cuenta.activo) {
		throw new ErrorGmailRepo(
			'SIN_CUENTA',
			'La cuenta Gmail no existe o está desconectada. Revisá Configuración › Correo.'
		);
	}
	if (
		!usuario.admin &&
		usuario.areaNombre !== 'TODOS' &&
		cuenta.areaId !== null &&
		cuenta.areaId !== usuario.areaId
	) {
		throw new ErrorGmailRepo('SIN_PERMISO', 'Esa casilla de Gmail pertenece a otra área');
	}
	return cuenta;
}

export interface DatosCorreoSeguimiento {
	cuentaGmailId: number;
	para: string[];
	cc?: string[];
	asunto: string;
	cuerpo: string;
	facturasReferencia?: string[];
}

export async function enviarCorreoSeguimiento(
	usuario: UsuarioSesion,
	seguimientoId: number,
	datos: DatosCorreoSeguimiento
): Promise<{ correoId: number; threadId: string; messageId: string }> {
	const [base] = await db
		.select({
			id: seguimientos.id,
			codigo: seguimientos.codigoVisible,
			titulo: seguimientos.titulo,
			areaId: seguimientos.areaId,
			estado: seguimientos.estado,
			servicioNombre: servicios.contactoFacturacion,
			version: seguimientos.version
		})
		.from(seguimientos)
		.innerJoin(servicios, eq(servicios.id, seguimientos.servicioId))
		.where(eq(seguimientos.id, seguimientoId))
		.limit(1);
	if (!base) throw new ErrorGmailRepo('NO_ENCONTRADO', 'El seguimiento no existe');
	const puedeEditar =
		usuario.admin || usuario.areaNombre === 'TODOS' || usuario.areaId === base.areaId;
	if (!puedeEditar) {
		throw new ErrorGmailRepo('SIN_PERMISO', 'No podés enviar correos en este seguimiento');
	}
	if (['CERRADO_PAGADO', 'CERRADO_ACUERDO', 'CERRADO_LEGAL', 'CERRADO_INCOBRABLE'].includes(base.estado)) {
		throw new ErrorGmailRepo('ESTADO_INVALIDO', 'El seguimiento está cerrado: reabrilo para enviar');
	}
	if (datos.para.length === 0) {
		throw new ErrorGmailRepo('API', 'Indicá al menos un destinatario');
	}

	const cuenta = await exigirCuenta(usuario, datos.cuentaGmailId);
	const accessToken = await tokenDeCuenta(cuenta);

	const [ultimo] = await db
		.select({
			threadId: seguimientosCorreos.threadId,
			messageId: seguimientosCorreos.messageIdHeader,
			referencias: seguimientosCorreos.referencias
		})
		.from(seguimientosCorreos)
		.where(
			and(
				eq(seguimientosCorreos.seguimientoId, seguimientoId),
				eq(seguimientosCorreos.direccion, 'SALIENTE')
			)
		)
		.orderBy(desc(seguimientosCorreos.id))
		.limit(1);

	const asunto = datos.asunto.includes(`[${base.codigo}]`)
		? datos.asunto
		: `[${base.codigo}] ${datos.asunto}`;
	const referencias = [ultimo?.referencias, ultimo?.messageId].filter(Boolean).join(' ');

	let texto = datos.cuerpo;
	if (datos.facturasReferencia?.length) {
		texto += `\n\nComprobantes incluidos: ${datos.facturasReferencia.join(', ')}`;
	}
	const html = `<p>${escaparHtml(texto).replace(/\n/g, '<br>')}</p>
<hr><p style="font-size:12px;color:#475569">Seguimiento ${escaparHtml(base.codigo)} · ${escaparHtml(base.servicioNombre)}</p>`;

	let envio: { id: string; threadId: string; messageId: string };
	try {
		envio = await enviarMensaje(accessToken, {
			de: { nombre: cuenta.nombre || cuenta.email, email: cuenta.email },
			para: datos.para,
			cc: datos.cc,
			asunto,
			texto,
			html,
			codigo: base.codigo,
			replyTo: construirReplyTo(cuenta.email, base.codigo),
			inReplyTo: ultimo?.messageId ?? null,
			references: referencias || null,
			threadId: ultimo?.threadId ?? null
		});
	} catch (error) {
		if (error instanceof ErrorGmail) {
			await db
				.update(gmailCuentas)
				.set({ ultimoError: error.message, actualizadoEn: new Date() })
				.where(eq(gmailCuentas.id, cuenta.id));
		}
		throw error;
	}

	const correoId = await db.transaction(async (tx) => {
		const [correo] = await tx
			.insert(seguimientosCorreos)
			.values({
				seguimientoId,
				cuentaId: cuenta.id,
				proveedor: 'GMAIL',
				direccion: 'SALIENTE',
				gmailMessageId: envio.id,
				threadId: envio.threadId,
				messageIdHeader: envio.messageId,
				inReplyTo: ultimo?.messageId ?? null,
				referencias: referencias || null,
				de: cuenta.email,
				para: datos.para.join(', '),
				cc: datos.cc?.join(', ') ?? null,
				asunto,
				cuerpo: texto,
				fechaHora: new Date(),
				estadoVinculacion: 'AUTOMATICO',
				usuarioId: usuario.id,
				metadatos: { cuenta: cuenta.email }
			})
			.returning({ id: seguimientosCorreos.id });

		await tx.insert(seguimientosEventos).values({
			seguimientoId,
			tipo: 'CORREO',
			canal: 'CORREO',
			direccion: 'SALIENTE',
			contenido: texto,
			autorUsuarioId: usuario.id,
			autorNombre: usuario.nombre,
			visibleCliente: true,
			estadoEntrega: 'ENVIADO',
			correoId: correo.id,
			metadatos: {
				asunto,
				destinatarios: datos.para,
				cuenta: cuenta.email,
				messageId: envio.messageId,
				threadId: envio.threadId
			}
		});
		const [actualizado] = await tx
			.update(seguimientos)
			.set({
				ultimaActividad: new Date(),
				ultimoContactoEn: new Date(),
				ultimoCanal: 'CORREO',
				version: sql`version + 1`
			})
			.where(and(eq(seguimientos.id, seguimientoId), eq(seguimientos.version, base.version)))
			.returning({ id: seguimientos.id });
		if (!actualizado) {
			throw new ErrorGmailRepo('CONFLICTO', 'Otro usuario modificó el seguimiento');
		}
		return correo.id;
	});

	return { correoId, threadId: envio.threadId, messageId: envio.messageId };
}

/** Reply-To con plus-addressing de Gmail: cuenta+SEG-...@dominio. */
export function replyToDeCuenta(email: string, codigo: string): string {
	return construirReplyTo(email, codigo);
}
