import { and, desc, eq, sql } from 'drizzle-orm';
import {
	db,
	seguimientos,
	seguimientosEventos,
	seguimientosNotificaciones,
	seguimientosParticipantes,
	seguimientosTareas,
	seguimientosTickets
} from '../base-datos/index.ts';
import { ESTADOS_CERRADOS } from '../validaciones/seguimientos.ts';

/**
 * Puente entre Tickets y Seguimientos de cobranza.
 *
 * No depende de los repositorios de ninguno de los dos módulos: solo de las
 * tablas, para que tanto el repo de tickets como el conector Gmail puedan
 * llamarlo sin ciclos.
 *
 * Responsabilidades:
 * - reflejar cambios relevantes del ticket como eventos resumidos en cada
 *   seguimiento vinculado;
 * - desbloquear el caso (BLOQUEADO_TICKET) cuando el ticket deja de estar
 *   abierto, restaurando el estado anterior;
 * - completar las tareas REVISAR_TICKET pendientes al cerrarse el ticket;
 * - notificar al responsable y observadores del caso.
 */

export interface CambioTicket {
	ticketId: number;
	codigo: string;
	tipoEvento: string;
	detalle: string;
	ticketAbierto: boolean;
	clave: string;
	actor?: { id: string; nombre: string } | null;
}

export async function casosVinculadosDe(ticketId: number): Promise<number[]> {
	const filas = await db
		.select({ seguimientoId: seguimientosTickets.seguimientoId })
		.from(seguimientosTickets)
		.where(eq(seguimientosTickets.ticketId, ticketId));
	return filas.map((fila) => fila.seguimientoId);
}

export async function sincronizarTicketEnSeguimientos(datos: CambioTicket): Promise<number> {
	const ids = await casosVinculadosDe(datos.ticketId);
	let casos = 0;
	for (const seguimientoId of ids) {
		try {
			await sincronizarEnCaso(seguimientoId, datos);
			casos++;
		} catch (error) {
			console.error(
				`[tickets-seguimiento] no se pudo reflejar ${datos.tipoEvento} en el seguimiento ${seguimientoId}:`,
				error
			);
		}
	}
	return casos;
}

async function sincronizarEnCaso(seguimientoId: number, datos: CambioTicket): Promise<void> {
	await db.transaction(async (tx) => {
		const [caso] = await tx
			.select({
				estado: seguimientos.estado,
				codigo: seguimientos.codigoVisible,
				responsable: seguimientos.responsableUsuarioId
			})
			.from(seguimientos)
			.where(eq(seguimientos.id, seguimientoId))
			.limit(1);
		if (!caso) return;

		await tx.insert(seguimientosEventos).values({
			seguimientoId,
			tipo: 'TICKET',
			canal: 'SISTEMA',
			direccion: 'INTERNA',
			contenido: `Ticket ${datos.codigo}: ${datos.detalle}`,
			autorUsuarioId: datos.actor?.id ?? null,
			autorNombre: datos.actor?.nombre ?? 'Sistema',
			ticketId: datos.ticketId,
			metadatos: { tipoEvento: datos.tipoEvento, abierto: datos.ticketAbierto }
		});

		const cambios: Record<string, unknown> = {
			ultimaActividad: new Date(),
			version: sql`version + 1`
		};

		// Desbloqueo: el ticket dejó de estar abierto.
		if (caso.estado === 'BLOQUEADO_TICKET' && !datos.ticketAbierto) {
			const [bloqueo] = await tx
				.select({ metadatos: seguimientosEventos.metadatos })
				.from(seguimientosEventos)
				.where(
					and(
						eq(seguimientosEventos.seguimientoId, seguimientoId),
						eq(seguimientosEventos.tipo, 'ESTADO')
					)
				)
				.orderBy(desc(seguimientosEventos.id))
				.limit(1);
			const metadatos = (bloqueo?.metadatos ?? {}) as { anterior?: unknown; nuevo?: unknown };
			const anterior =
				typeof metadatos.anterior === 'string' &&
				!ESTADOS_CERRADOS.includes(metadatos.anterior as never) &&
				metadatos.anterior !== 'BLOQUEADO_TICKET'
					? metadatos.anterior
					: 'EN_SEGUIMIENTO';
			cambios.estado = anterior;
			await tx.insert(seguimientosEventos).values({
				seguimientoId,
				tipo: 'ESTADO',
				canal: 'SISTEMA',
				direccion: 'INTERNA',
				contenido: `El ticket ${datos.codigo} dejó de bloquear: el caso vuelve a ${anterior}.`,
				ticketId: datos.ticketId,
				metadatos: { anterior: 'BLOQUEADO_TICKET', nuevo: anterior, origen: 'TICKET' }
			});
		}

		await tx.update(seguimientos).set(cambios).where(eq(seguimientos.id, seguimientoId));

		// El ticket cerró: las gestiones de revisión del caso ya tienen resolución.
		if (!datos.ticketAbierto) {
			await tx
				.update(seguimientosTareas)
				.set({
					estado: 'COMPLETADA',
					resultado: `Ticket ${datos.codigo} cerrado`,
					fechaCompletada: new Date(),
					version: sql`version + 1`
				})
				.where(
					and(
						eq(seguimientosTareas.seguimientoId, seguimientoId),
						eq(seguimientosTareas.estado, 'PENDIENTE'),
						eq(seguimientosTareas.tipoAccion, 'REVISAR_TICKET')
					)
				);
		}

		// Aviso al responsable y observadores, salvo al actor.
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
		const destinatarios = [caso.responsable, ...observadores.map((fila) => fila.usuarioId)]
			.filter((usuarioId) => usuarioId && usuarioId !== datos.actor?.id)
			.filter((usuarioId, indice, lista) => lista.indexOf(usuarioId) === indice);
		if (destinatarios.length > 0) {
			await tx
				.insert(seguimientosNotificaciones)
				.values(
					destinatarios.map((usuarioId) => ({
						seguimientoId,
						usuarioId,
						tipo: 'TICKET_ACTUALIZADO',
						titulo: `Ticket ${datos.codigo} en ${caso.codigo}`,
						detalle: datos.detalle,
						actorUsuarioId: datos.actor?.id ?? null,
						claveEvento: `ticket-sync:${datos.clave}:${seguimientoId}`
					}))
				)
				.onConflictDoNothing();
		}
	});
}
