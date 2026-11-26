import { and, eq, isNull, sql } from 'drizzle-orm';
import { db, seguimientosNotificaciones, ticketNotificaciones } from '../base-datos/index.ts';
import { puede, type UsuarioSesion } from '../permisos/reglas.ts';
import {
	listarNotificaciones as listarNotificacionesTickets,
	marcarNotificacionesLeidas as marcarTicketsLeidas
} from './tickets.ts';
import {
	listarNotificacionesSeguimientos,
	marcarNotificacionesLeidas as marcarSeguimientosLeidas
} from './seguimientos.ts';

/**
 * Repositorio: notificaciones generales.
 *
 * Agrega los avisos de Tickets y Seguimientos en una sola lista para la
 * campana de la cabecera. No crea una tabla nueva: respeta las tablas y el
 * estado `leidoEn` de cada módulo.
 *
 * Permisos:
 * - Con `tickets` se ven (y marcan) solo los avisos de tickets.
 * - Con `seguimientos`, solo los de seguimientos.
 * - Un ADMIN o un usuario con ambas pantallas ve la lista combinada.
 */

export type OrigenNotificacion = 'TICKET' | 'SEGUIMIENTO';

export interface NotificacionGeneral {
	id: string;
	notificacionId: number;
	origen: OrigenNotificacion;
	tipo: string;
	entidadId: number;
	codigo: string;
	titulo: string;
	referencia: string;
	detalle: string | null;
	leido: boolean;
	creadoEn: string;
	url: string;
}

export interface NotificacionesGenerales {
	items: NotificacionGeneral[];
	noLeidas: number;
}

export async function listarNotificacionesGenerales(
	usuario: UsuarioSesion
): Promise<NotificacionesGenerales> {
	const puedeTickets = puede(usuario, 'tickets');
	const puedeSeguimientos = puede(usuario, 'seguimientos');

	const [ticketsData, seguimientosData, conteoTickets, conteoSeguimientos] = await Promise.all([
		puedeTickets ? listarNotificacionesTickets(usuario) : Promise.resolve(null),
		puedeSeguimientos ? listarNotificacionesSeguimientos(usuario) : Promise.resolve(null),
		puedeTickets
			? db
					.select({ total: sql<number>`count(*)::int` })
					.from(ticketNotificaciones)
					.where(
						and(
							eq(ticketNotificaciones.usuarioId, usuario.id),
							isNull(ticketNotificaciones.leidoEn)
						)
					)
			: Promise.resolve([{ total: 0 }]),
		puedeSeguimientos
			? db
					.select({ total: sql<number>`count(*)::int` })
					.from(seguimientosNotificaciones)
					.where(
						and(
							eq(seguimientosNotificaciones.usuarioId, usuario.id),
							isNull(seguimientosNotificaciones.leidoEn)
						)
					)
			: Promise.resolve([{ total: 0 }])
	]);

	const items: NotificacionGeneral[] = [];

	if (ticketsData) {
		for (const item of ticketsData.items) {
			items.push({
				id: `ticket:${item.id}`,
				notificacionId: item.id,
				origen: 'TICKET',
				tipo: item.tipo,
				entidadId: item.ticketId,
				codigo: item.codigo,
				titulo: item.titulo,
				referencia: item.tituloTicket,
				detalle: item.detalle,
				leido: item.leido,
				creadoEn: item.creadoEn,
				url: `/tickets?ticket=${encodeURIComponent(item.codigo)}`
			});
		}
	}

	if (seguimientosData) {
		for (const item of seguimientosData.items) {
			items.push({
				id: `seguimiento:${item.id}`,
				notificacionId: item.id,
				origen: 'SEGUIMIENTO',
				tipo: item.tipo,
				entidadId: item.seguimientoId,
				codigo: item.codigo,
				titulo: item.titulo,
				referencia: item.tituloSeguimiento,
				detalle: item.detalle,
				leido: item.leido,
				creadoEn: item.creadoEn,
				url: `/seguimientos?seg=${item.seguimientoId}`
			});
		}
	}

	items.sort((a, b) => new Date(b.creadoEn).getTime() - new Date(a.creadoEn).getTime());

	return {
		items: items.slice(0, 60),
		noLeidas:
			Number(conteoTickets[0]?.total ?? 0) + Number(conteoSeguimientos[0]?.total ?? 0)
	};
}

export async function marcarTodasLasNotificaciones(usuario: UsuarioSesion): Promise<number> {
	let total = 0;
	if (puede(usuario, 'tickets')) total += await marcarTicketsLeidas(usuario);
	if (puede(usuario, 'seguimientos')) total += await marcarSeguimientosLeidas(usuario);
	return total;
}

export async function marcarNotificacionLeida(
	usuario: UsuarioSesion,
	origen: OrigenNotificacion,
	id: number
): Promise<boolean> {
	if (!Number.isInteger(id) || id <= 0) return false;

	if (origen === 'TICKET') {
		if (!puede(usuario, 'tickets')) return false;
		const filas = await db
			.update(ticketNotificaciones)
			.set({ leidoEn: new Date() })
			.where(
				and(
					eq(ticketNotificaciones.id, id),
					eq(ticketNotificaciones.usuarioId, usuario.id),
					isNull(ticketNotificaciones.leidoEn)
				)
			)
			.returning({ id: ticketNotificaciones.id });
		return filas.length > 0;
	}

	if (!puede(usuario, 'seguimientos')) return false;
	const filas = await db
		.update(seguimientosNotificaciones)
		.set({ leidoEn: new Date() })
		.where(
			and(
				eq(seguimientosNotificaciones.id, id),
				eq(seguimientosNotificaciones.usuarioId, usuario.id),
				isNull(seguimientosNotificaciones.leidoEn)
			)
		)
		.returning({ id: seguimientosNotificaciones.id });
	return filas.length > 0;
}
