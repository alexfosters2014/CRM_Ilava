import { createHash, randomBytes } from 'node:crypto';
import { and, asc, eq, gt, inArray, isNull, or, sql } from 'drizzle-orm';
import { BETTER_AUTH_URL } from '$app/env/private';
import {
	db,
	ticketEnlacesPublicos,
	ticketMensajes,
	ticketNotificaciones,
	ticketParticipantes,
	tickets,
	user
} from '../base-datos/index.ts';
import { limpiarRespuestaCorreo } from '../servicios/gmail-texto.ts';
import { nombreDesdeEmail } from '../servicios/nombres.ts';

/**
 * Repositorio: portal público de tickets.
 *
 * El enlace es una capability URL: quien tiene el token puede ver y responder
 * ese ticket mientras esté abierto. No hay sesión ni usuario.
 *
 * - El token se genera con CSPRNG y se guarda hasheado (SHA-256).
 * - Solo se exponen mensajes con `visibleCliente = true`.
 * - Un ticket cerrado o cancelado no muestra ni acepta respuestas.
 * - El autor de una respuesta es el destinatario del enlace: se muestra su
 *   nombre, pero `autorUsuarioId` queda nulo (no se lo asocia a la sesión interna).
 */

export const VIGENCIA_ENLACE_DIAS = 30;

const ESTADOS_CERRADOS = ['CERRADO', 'CANCELADO'];

function hashToken(token: string): string {
	return createHash('sha256').update(token).digest('hex');
}

export function construirUrlPortal(token: string): string {
	const base = (BETTER_AUTH_URL ?? 'http://localhost:5173').replace(/\/$/, '');
	return `${base}/portal/${encodeURIComponent(token)}`;
}

export interface EnlacePublico {
	enlaceId: number;
	ticketId: number;
	codigo: string;
	titulo: string;
	estado: string;
	email: string | null;
	nombre: string | null;
	abierto: boolean;
}

/** Crea un token nuevo para el ticket. La URL se arma con construirUrlPortal. */
export async function crearEnlacePublico(
	ticketId: number,
	email: string | null = null
): Promise<string> {
	const token = randomBytes(32).toString('base64url');
	const expiraEn = new Date(Date.now() + VIGENCIA_ENLACE_DIAS * 24 * 60 * 60 * 1000);
	await db.insert(ticketEnlacesPublicos).values({
		ticketId,
		email: email?.trim().toLowerCase() || null,
		tokenHash: hashToken(token),
		expiraEn
	});
	return token;
}

/** Valida el token y devuelve el ticket. Registra el uso. */
export async function validarEnlacePublico(
	token: string | undefined | null
): Promise<EnlacePublico | null> {
	if (!token || token.length < 20 || token.length > 200) return null;

	const [fila] = await db
		.select({
			enlaceId: ticketEnlacesPublicos.id,
			ticketId: tickets.id,
			codigo: tickets.codigoVisible,
			titulo: tickets.titulo,
			estado: tickets.estado,
			email: ticketEnlacesPublicos.email,
			nombreUsuario: user.name
		})
		.from(ticketEnlacesPublicos)
		.innerJoin(tickets, eq(tickets.id, ticketEnlacesPublicos.ticketId))
		.leftJoin(user, eq(sql`lower(${user.email})`, ticketEnlacesPublicos.email))
		.where(
			and(
				eq(ticketEnlacesPublicos.tokenHash, hashToken(token)),
				isNull(ticketEnlacesPublicos.revocadoEn),
				gt(ticketEnlacesPublicos.expiraEn, new Date())
			)
		)
		.limit(1);

	if (!fila) return null;

	await db
		.update(ticketEnlacesPublicos)
		.set({
			ultimoUsoEn: new Date(),
			usos: sql`${ticketEnlacesPublicos.usos} + 1`
		})
		.where(eq(ticketEnlacesPublicos.id, fila.enlaceId));

	return {
		enlaceId: fila.enlaceId,
		ticketId: fila.ticketId,
		codigo: fila.codigo,
		titulo: fila.titulo,
		estado: fila.estado,
		email: fila.email,
		nombre: fila.nombreUsuario?.trim() || nombreDesdeEmail(fila.email) || null,
		abierto: !ESTADOS_CERRADOS.includes(fila.estado)
	};
}

export interface MensajePortal {
	id: number;
	autor: string;
	origen: 'EQUIPO' | 'INVITADO';
	contenido: string;
	fechaHora: string;
}

/** Mensajes públicos del ticket, del más viejo al más nuevo. */
export async function listarMensajesPortal(ticketId: number): Promise<MensajePortal[]> {
	const filas = await db
		.select({
			id: ticketMensajes.id,
			autorUsuarioId: ticketMensajes.autorUsuarioId,
			autorNombre: ticketMensajes.autorNombre,
			canal: ticketMensajes.canal,
			contenido: ticketMensajes.contenido,
			fechaHora: ticketMensajes.fechaHora
		})
		.from(ticketMensajes)
		.where(and(eq(ticketMensajes.ticketId, ticketId), eq(ticketMensajes.visibleCliente, true)))
		.orderBy(asc(ticketMensajes.fechaHora), asc(ticketMensajes.id))
		.limit(300);

	return filas.map((fila) => {
		const nombre = fila.autorNombre?.trim() ?? '';
		const esEquipo = Boolean(fila.autorUsuarioId);
		return {
			id: fila.id,
			// No exponemos el email del remitente externo en el portal.
			autor: nombre && !nombre.includes('@') ? nombre : esEquipo ? 'Equipo' : 'Cliente',
			origen: esEquipo ? 'EQUIPO' : 'INVITADO',
			contenido: fila.canal === 'CORREO' ? limpiarRespuestaCorreo(fila.contenido) : fila.contenido,
			fechaHora: fila.fechaHora.toISOString()
		};
	});
}

async function idsInvolucrados(ticketId: number): Promise<string[]> {
	const [base] = await db
		.select({
			areaResponsableId: tickets.areaResponsableId,
			usuarioAsignadoId: tickets.usuarioAsignadoId,
			creadoPorUsuarioId: tickets.creadoPorUsuarioId
		})
		.from(tickets)
		.where(eq(tickets.id, ticketId))
		.limit(1);
	if (!base) return [];

	const participantes = await db
		.select()
		.from(ticketParticipantes)
		.where(and(eq(ticketParticipantes.ticketId, ticketId), eq(ticketParticipantes.activo, true)));

	const areaIds = new Set<number>([base.areaResponsableId]);
	const usuarioIds = new Set<string>([base.creadoPorUsuarioId]);
	if (base.usuarioAsignadoId) usuarioIds.add(base.usuarioAsignadoId);
	for (const participante of participantes) {
		if (participante.tipo === 'AREA' && participante.areaId) areaIds.add(participante.areaId);
		if (participante.tipo === 'USUARIO' && participante.usuarioId) {
			usuarioIds.add(participante.usuarioId);
		}
	}

	const condiciones = [];
	if (usuarioIds.size > 0) condiciones.push(inArray(user.id, [...usuarioIds]));
	if (areaIds.size > 0) condiciones.push(inArray(user.areaId, [...areaIds]));
	if (condiciones.length === 0) return [];

	const filas = await db
		.select({ id: user.id })
		.from(user)
		.where(and(eq(user.activo, true), isNull(user.eliminadoEn), or(...condiciones)));

	return filas.map((fila) => fila.id);
}

export interface DatosMensajePortal {
	/** Solo se usa cuando el enlace no identifica al destinatario. */
	nombre?: string;
	email?: string;
	contenido: string;
}

/** Guarda la respuesta del invitado, avisa a los involucrados y la pública. */
export async function agregarMensajePortal(
	enlace: EnlacePublico,
	datos: DatosMensajePortal
): Promise<MensajePortal> {
	if (!enlace.abierto) throw new Error('TICKET_CERRADO');

	const nombre = (enlace.nombre ?? datos.nombre ?? '').trim().slice(0, 120) || 'Invitado';
	const email = (enlace.email ?? datos.email ?? '').trim().toLowerCase().slice(0, 200);
	if (!email) throw new Error('EMAIL_REQUERIDO');
	const contenido = datos.contenido.trim().slice(0, 8000);

	const [mensaje] = await db
		.insert(ticketMensajes)
		.values({
			ticketId: enlace.ticketId,
			autorUsuarioId: null,
			autorNombre: nombre,
			autorEmail: email,
			tipo: 'COMENTARIO',
			contenido,
			canal: 'PORTAL',
			visibleCliente: true,
			metadata: { origen: 'PORTAL' }
		})
		.returning({
			id: ticketMensajes.id,
			fechaHora: ticketMensajes.fechaHora
		});

	await db
		.update(tickets)
		.set({
			version: sql`${tickets.version} + 1`,
			fechaActualizacion: new Date()
		})
		.where(eq(tickets.id, enlace.ticketId));

	const destinatarios = await idsInvolucrados(enlace.ticketId);
	if (destinatarios.length > 0) {
		await db
			.insert(ticketNotificaciones)
			.values(
				destinatarios.map((usuarioId) => ({
					ticketId: enlace.ticketId,
					usuarioId,
					tipo: 'RESPUESTA_PORTAL',
					titulo: `Nueva respuesta de ${nombre} en ${enlace.codigo}`,
					detalle: contenido.slice(0, 180),
					actorUsuarioId: null,
					claveEvento: `portal:${mensaje.id}`
				}))
			)
			.onConflictDoNothing();
	}

	return {
		id: mensaje.id,
		autor: nombre,
		origen: 'INVITADO',
		contenido,
		fechaHora: mensaje.fechaHora.toISOString()
	};
}
