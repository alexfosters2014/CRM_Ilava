/**
 * Capa: ServiciosDatosAPI — Notificaciones generales.
 *
 * Espejo del agregado de la campana de la cabecera. El backend filtra por las
 * pantallas habilitadas del usuario.
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

export class ErrorApiNotificaciones extends Error {
	constructor(mensaje: string) {
		super(mensaje);
		this.name = 'ErrorApiNotificaciones';
	}
}

async function pedir<T>(url: string, init?: RequestInit): Promise<T> {
	const respuesta = await fetch(url, { cache: 'no-store', ...init });
	const datos = (await respuesta.json().catch(() => ({}))) as Record<string, unknown>;
	if (!respuesta.ok) {
		throw new ErrorApiNotificaciones(
			typeof datos.error === 'string' ? datos.error : 'No se pudieron cargar las notificaciones'
		);
	}
	return datos as T;
}

export async function listarNotificacionesGenerales(): Promise<NotificacionesGenerales> {
	return await pedir<NotificacionesGenerales>('/api/notificaciones');
}

export async function marcarTodasNotificaciones(): Promise<number> {
	const datos = await pedir<{ actualizadas: number }>('/api/notificaciones/leidas', {
		method: 'POST'
	});
	return datos.actualizadas;
}

export async function marcarNotificacionLeida(
	origen: OrigenNotificacion,
	id: number
): Promise<boolean> {
	const datos = await pedir<{ ok: boolean }>('/api/notificaciones/leer', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ origen, id })
	});
	return datos.ok;
}
