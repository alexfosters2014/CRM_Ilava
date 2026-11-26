/**
 * Capa: ServiciosDatosAPI — Tickets.
 *
 * Espejo tipado de las respuestas del módulo. El backend aplica visibilidad y
 * permisos; este módulo no decide nada, solo transporta.
 */

export type EstadoTicket =
	| 'NUEVO'
	| 'ABIERTO'
	| 'EN_PROCESO'
	| 'ESPERANDO_RESPUESTA'
	| 'RESUELTO'
	| 'CERRADO'
	| 'CANCELADO';

export type PrioridadTicket = 'BAJA' | 'NORMAL' | 'ALTA' | 'URGENTE';
export type TipoOrigenTicket = 'SERVICIO' | 'INTERNO';
export type TipoRelacionTicket = 'PADRE' | 'RELACIONADO' | 'DUPLICADO' | 'BLOQUEADO';

export interface AreaTicket {
	id: number;
	nombre: string;
	protegida?: boolean;
}

export interface UsuarioTicket {
	id: string;
	nombre: string;
	email: string;
	areaId: number | null;
	areaNombre: string | null;
}

export interface ParticipanteTicket {
	id: number;
	tipo: 'AREA' | 'USUARIO';
	areaId: number | null;
	usuarioId: string | null;
	nombre: string;
	email: string | null;
	areaNombre: string | null;
	origen: string;
	activo: boolean;
}

export interface FacturaTicket {
	id: number;
	tipoComprobante: string;
	serie: string;
	numero: string;
	moneda: string;
	saldoPendiente: string;
	fechaVencimiento: string | null;
}

export interface ServicioTicket {
	id: number;
	nombre: string;
	nombreFantasia: string | null;
	numeracion: string | null;
	cliente: string;
}

export interface TicketResumen {
	id: number;
	codigo: string;
	titulo: string;
	tipoOrigen: TipoOrigenTicket;
	estado: EstadoTicket;
	prioridad: PrioridadTicket;
	areaResponsable: AreaTicket;
	areaSolicitante: AreaTicket | null;
	usuarioAsignado: UsuarioTicket | null;
	categoria: { id: number; nombre: string } | null;
	servicio: ServicioTicket | null;
	periodo: { id: number; periodo: string } | null;
	seguimiento: { id: number; codigo: string; titulo: string } | null;
	facturas: FacturaTicket[];
	creadoPor: { id: string; nombre: string };
	fechaCreacion: string;
	fechaActualizacion: string;
	fechaLimite: string | null;
	version: number;
	nuevasRespuestas: number;
	totalMensajes: number;
	participantes: ParticipanteTicket[];
}

export interface MensajeTicket {
	id: number;
	autorUsuarioId: string | null;
	autorNombre: string | null;
	autorEmail: string | null;
	areaNombre: string | null;
	tipo: string;
	contenido: string;
	fechaHora: string;
	editado: boolean;
	menciones: string[];
	canal: string;
	visibleCliente: boolean;
	correoId: number | null;
	metadata: Record<string, unknown> | null;
}

export interface EventoTicket {
	id: number;
	tipoEvento: string;
	usuarioId: string | null;
	usuarioNombre: string | null;
	fechaHora: string;
	valorAnterior: string | null;
	valorNuevo: string | null;
	detalle: string | null;
}

export interface CorreoTicket {
	id: number;
	direccion: string;
	threadId: string | null;
	messageId: string | null;
	inReplyTo: string | null;
	de: string | null;
	para: string | null;
	cc: string | null;
	asunto: string | null;
	cuerpo: string | null;
	fecha: string;
	estado: string;
}

export interface PermisosTicket {
	ver: boolean;
	responder: boolean;
	cambiarEstado: boolean;
	cambiarPrioridad: boolean;
	cambiarArea: boolean;
	asignar: boolean;
	fechaLimite: boolean;
	resolver: boolean;
	validar: boolean;
	cerrar: boolean;
	cancelar: boolean;
	agregarParticipantes: boolean;
	enviarCorreo: boolean;
}

export interface TicketDetalle extends TicketResumen {
	descripcion: string;
	referenciaTexto: string | null;
	ticketRelacionado: { id: number; codigo: string; titulo: string } | null;
	tipoRelacion: string | null;
	fechaResolucion: string | null;
	fechaCierre: string | null;
	resolucion: string | null;
	motivoCierre: string | null;
	motivoReapertura: string | null;
	validadoEn: string | null;
	validadoPor: { id: string; nombre: string } | null;
	espera: {
		area: { id: number; nombre: string } | null;
		usuario: { id: string; nombre: string } | null;
		detalle: string | null;
	} | null;
	mensajes: MensajeTicket[];
	eventos: EventoTicket[];
	correos: CorreoTicket[];
	permisos: PermisosTicket;
}

export interface CatalogosTickets {
	areas: AreaTicket[];
	usuarios: UsuarioTicket[];
	categorias: { id: number; nombre: string; orden: number }[];
}

export interface ServicioBuscadoTicket {
	id: number;
	nombre: string;
	nombreFantasia: string | null;
	numeracion: string | null;
	cliente: string;
}

export interface NotificacionTicket {
	id: number;
	ticketId: number;
	codigo: string;
	tituloTicket: string;
	tipo: string;
	titulo: string;
	detalle: string | null;
	leido: boolean;
	creadoEn: string;
}

export interface NotificacionesTickets {
	items: NotificacionTicket[];
	noLeidas: number;
}

export interface NuevoTicketDatos {
	tipoOrigen: TipoOrigenTicket;
	titulo: string;
	descripcion: string;
	categoriaId?: number | null;
	prioridad: PrioridadTicket;
	areaResponsableId: number;
	usuarioAsignadoId?: string | null;
	areaSolicitanteId?: number | null;
	fechaLimite?: string | null;
	servicioId?: number | null;
	periodoCobranzaId?: number | null;
	facturaCobranzaIds?: number[];
	referenciaTexto?: string | null;
	ticketRelacionadoId?: number | null;
	tipoRelacion?: TipoRelacionTicket | null;
	areasInvolucradas?: number[];
	usuariosInvolucrados?: string[];
}

export interface ActualizarTicketDatos {
	version: number;
	titulo?: string;
	prioridad?: PrioridadTicket;
	estado?: EstadoTicket;
	areaResponsableId?: number;
	usuarioAsignadoId?: string | null;
	fechaLimite?: string | null;
	motivoFechaLimite?: string | null;
	resolucion?: string;
	motivoCierre?: string;
	motivoReapertura?: string;
	esperaDeAreaId?: number | null;
	esperaDeUsuarioId?: string | null;
	esperaDetalle?: string | null;
	ticketRelacionadoId?: number | null;
	tipoRelacion?: TipoRelacionTicket | null;
	accion?: 'VALIDAR';
}

export interface MensajeTicketDatos {
	contenido: string;
	enviarCorreo?: boolean;
	paraInvolucrados?: boolean;
	soloInterno?: boolean;
	para?: string[];
	cc?: string[];
	asunto?: string;
	cuentaId?: number;
	aliasId?: number | null;
	cuentaGmailId?: number;
}

export type ParticipanteTicketDatos =
	| { tipo: 'AREA'; areaId: number }
	| { tipo: 'USUARIO'; usuarioId: string };

export interface ResultadoMensajeTicket {
	ticket: TicketDetalle;
	correo: { messageId: string; threadId: string } | null;
	correoError: string | null;
}

export interface CorreoTicketDatos {
	para: string[];
	cc?: string[];
	asunto: string;
	cuerpo: string;
	cuentaId?: number;
	aliasId?: number | null;
	cuentaGmailId?: number;
	guardarEnHistorial?: boolean;
}

export class ErrorApiTickets extends Error {
	constructor(
		mensaje: string,
		readonly codigo?: string,
		readonly actual?: Record<string, unknown>
	) {
		super(mensaje);
		this.name = 'ErrorApiTickets';
	}
}

async function pedir<T>(url: string, init?: RequestInit): Promise<T> {
	const respuesta = await fetch(url, { cache: 'no-store', ...init });
	const datos = (await respuesta.json().catch(() => ({}))) as Record<string, unknown>;
	if (!respuesta.ok) {
		throw new ErrorApiTickets(
			typeof datos.error === 'string' ? datos.error : 'No se pudo completar la operación',
			typeof datos.codigo === 'string' ? datos.codigo : undefined,
			(datos.actual as Record<string, unknown> | undefined) ?? undefined
		);
	}
	return datos as T;
}

export async function listarTickets(): Promise<TicketResumen[]> {
	const datos = await pedir<{ tickets: TicketResumen[] }>('/api/tickets');
	return datos.tickets;
}

export async function obtenerTicket(id: number): Promise<TicketDetalle> {
	const datos = await pedir<{ ticket: TicketDetalle }>(`/api/tickets/${id}`);
	return datos.ticket;
}

export async function crearTicket(datos: NuevoTicketDatos): Promise<TicketDetalle> {
	const respuesta = await pedir<{ ticket: TicketDetalle }>('/api/tickets', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(datos)
	});
	return respuesta.ticket;
}

export async function actualizarTicket(
	id: number,
	datos: ActualizarTicketDatos
): Promise<TicketDetalle> {
	const respuesta = await pedir<{ ticket: TicketDetalle }>(`/api/tickets/${id}`, {
		method: 'PATCH',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(datos)
	});
	return respuesta.ticket;
}

export async function enviarMensaje(
	id: number,
	datos: MensajeTicketDatos
): Promise<ResultadoMensajeTicket> {
	return await pedir<ResultadoMensajeTicket>(`/api/tickets/${id}/mensajes`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(datos)
	});
}

export async function agregarParticipante(
	id: number,
	datos: ParticipanteTicketDatos
): Promise<TicketDetalle> {
	const respuesta = await pedir<{ ticket: TicketDetalle }>(`/api/tickets/${id}/participantes`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(datos)
	});
	return respuesta.ticket;
}

export async function quitarParticipante(
	id: number,
	participanteId: number
): Promise<TicketDetalle> {
	const respuesta = await pedir<{ ticket: TicketDetalle }>(
		`/api/tickets/${id}/participantes/${participanteId}`,
		{ method: 'DELETE' }
	);
	return respuesta.ticket;
}

export async function listarCatalogosTickets(): Promise<CatalogosTickets> {
	return await pedir<CatalogosTickets>('/api/tickets/catalogos');
}

export async function buscarServiciosTickets(q: string): Promise<ServicioBuscadoTicket[]> {
	const datos = await pedir<{ servicios: ServicioBuscadoTicket[] }>(
		`/api/tickets/servicios?q=${encodeURIComponent(q)}`
	);
	return datos.servicios;
}

export async function listarNotificacionesTickets(): Promise<NotificacionesTickets> {
	return await pedir<NotificacionesTickets>('/api/tickets/notificaciones');
}

export async function marcarNotificacionesLeidas(): Promise<number> {
	const datos = await pedir<{ actualizadas: number }>('/api/tickets/notificaciones/leidas', {
		method: 'POST'
	});
	return datos.actualizadas;
}

export async function enviarCorreoTicket(
	id: number,
	datos: CorreoTicketDatos
): Promise<TicketDetalle> {
	const respuesta = await pedir<{ ticket: TicketDetalle }>(`/api/tickets/${id}/correo`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(datos)
	});
	return respuesta.ticket;
}
