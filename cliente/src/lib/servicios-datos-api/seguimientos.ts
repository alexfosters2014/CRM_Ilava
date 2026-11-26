/**
 * Capa: ServiciosDatosAPI — Centro de seguimiento de cobranza.
 *
 * Espejo tipado de las respuestas del módulo. El backend aplica permisos por
 * área y concurrencia; este módulo solo transporta.
 */

import type { MensajeTicketDatos, ResultadoMensajeTicket, TicketDetalle } from './tickets.ts';

export type EstadoSeguimiento =
	| 'EN_SEGUIMIENTO'
	| 'ESPERANDO_CLIENTE'
	| 'PROMESA_PAGO'
	| 'BLOQUEADO_TICKET'
	| 'PAUSADO'
	| 'CERRADO_PAGADO'
	| 'CERRADO_ACUERDO'
	| 'CERRADO_LEGAL'
	| 'CERRADO_INCOBRABLE';

export type PrioridadSeguimiento = 'BAJA' | 'NORMAL' | 'ALTA' | 'URGENTE';
export type CanalAvance =
	| 'NOTA'
	| 'CORREO'
	| 'CORREO_MANUAL'
	| 'WHATSAPP'
	| 'WHATSAPP_MANUAL'
	| 'TELEFONO'
	| 'REUNION'
	| 'OTRO';
export type TipoAccion =
	| 'CORREO'
	| 'WHATSAPP'
	| 'LLAMADA'
	| 'CONFIRMAR_PAGO'
	| 'VALIDAR_COMPROBANTE'
	| 'VERIFICAR_ACREDITACION'
	| 'REVISAR_TICKET'
	| 'OTRA';

export interface SeguimientoServicio {
	id: number;
	nombre: string;
	nombreFantasia: string | null;
	numeracion: string | null;
	cliente: string;
	diasVencimiento: number;
}

export interface SeguimientoUsuario {
	id: string;
	nombre: string;
	email: string;
	areaId: number | null;
	areaNombre: string | null;
}

export interface SeguimientoFactura {
	id: number;
	comprobanteId: number;
	tipoComprobante: string;
	serie: string;
	numero: string;
	fechaEmision: string;
	fechaVencimiento: string | null;
	plazoDias: number;
	moneda: string;
	importe: string;
	saldo: string;
	saldoAlAsociar: string;
	diasAging: number;
	vencida: boolean;
	estado: 'PENDIENTE' | 'PARCIAL' | 'PAGADA' | 'ANULADA' | 'BLOQUEADA';
	activa: boolean;
	motivoRetiro: string | null;
	fechaAsociacion: string;
	asociadaPor: string | null;
	periodo: string;
}

export interface SeguimientoTarea {
	id: number;
	tipoAccion: TipoAccion;
	titulo: string;
	nota: string | null;
	fechaHora: string;
	responsable: SeguimientoUsuario | null;
	recordatorioMinutos: number;
	canalPrevisto: CanalAvance | null;
	estado: 'PENDIENTE' | 'COMPLETADA' | 'REPROGRAMADA' | 'CANCELADA' | 'VENCIDA';
	estadoBase: 'PENDIENTE' | 'COMPLETADA' | 'REPROGRAMADA' | 'CANCELADA';
	resultado: string | null;
	fechaCompletada: string | null;
	motivoCancelacion: string | null;
	version: number;
}

export interface SeguimientoPromesa {
	id: number;
	fechaPrometida: string;
	importe: string;
	moneda: string;
	comprobanteIds: number[];
	medioPago: string | null;
	confirmadoPorContacto: string | null;
	canal: string | null;
	observaciones: string | null;
	estado: 'VIGENTE' | 'CUMPLIDA' | 'CUMPLIDA_PARCIAL' | 'INCUMPLIDA' | 'REPROGRAMADA' | 'CANCELADA';
	resultadoDetalle: string | null;
	confirmadoPor: SeguimientoUsuario | null;
	fechaConfirmacion: string | null;
	version: number;
}

export interface SeguimientoTicket {
	id: number;
	codigo: string;
	titulo: string;
	estado: string;
	prioridad: string;
	areaResponsable: { id: number; nombre: string } | null;
	usuarioAsignado: SeguimientoUsuario | null;
	bloqueante: boolean;
	motivoBloqueo: string | null;
	fechaCreacion: string;
	fechaActualizacion: string;
	abierto: boolean;
}

export interface SeguimientoEvento {
	id: number;
	tipo: string;
	canal: string;
	direccion: string;
	contenido: string;
	autor: SeguimientoUsuario | null;
	autorNombre: string | null;
	contacto: string | null;
	fechaHora: string;
	adjuntos: unknown[];
	metadatos: Record<string, unknown> | null;
	visibleCliente: boolean;
	estadoEntrega: string | null;
	correoId: number | null;
	tareaId: number | null;
	promesaId: number | null;
	ticketId: number | null;
	editado: boolean;
}

export interface SeguimientoPermisos {
	ver: boolean;
	editar: boolean;
	cerrar: boolean;
	reabrir: boolean;
	crearTicket: boolean;
}

export interface SeguimientoResumen {
	id: number;
	codigo: string;
	titulo: string;
	motivo: string | null;
	estado: EstadoSeguimiento;
	prioridad: PrioridadSeguimiento;
	servicio: SeguimientoServicio;
	area: { id: number; nombre: string };
	responsable: SeguimientoUsuario;
	observadores: SeguimientoUsuario[];
	fechaApertura: string;
	fechaCierre: string | null;
	motivoCierre: string | null;
	ultimaActividad: string;
	ultimoContactoEn: string | null;
	ultimoCanal: string | null;
	canalPreferido: string | null;
	/** Celular de WhatsApp del caso (E.164 sin '+'), snapshot editable. */
	telefonoWhatsapp: string | null;
	/** Se completa cuando onWhatsApp confirma que el número existe. */
	telefonoWhatsappVerificadoEn: string | null;
	saldos: { UYU: string; USD: string; equivalenteUYU: string | null; cotizacion: number | null };
	facturas: { total: number; vencidas: number; mayorAtraso: number; numeros: string[]; ids: number[] };
	proximaGestion: SeguimientoTarea | null;
	promesa: SeguimientoPromesa | null;
	tickets: { abiertos: number; bloqueantes: number };
	noLeidos: number;
	version: number;
}

export interface SeguimientoDetalle extends SeguimientoResumen {
	eventos: SeguimientoEvento[];
	facturasDetalle: SeguimientoFactura[];
	tareas: SeguimientoTarea[];
	promesas: SeguimientoPromesa[];
	ticketsDetalle: SeguimientoTicket[];
	permisos: SeguimientoPermisos;
}

export interface CatalogosSeguimientos {
	areas: { id: number; nombre: string }[];
	usuarios: SeguimientoUsuario[];
	puedeCrearTicket: boolean;
	areaUsuario: number | null;
}

export interface ServicioBuscadoSeguimiento {
	id: number;
	nombre: string;
	nombreFantasia: string | null;
	numeracion: string | null;
	/** Celular del servicio para prefill del caso (598 + 8 dígitos). */
	celular: string | null;
	deudaUYU: string;
	deudaUSD: string;
	seguimientosActivos: { id: number; codigo: string; titulo: string; estado: EstadoSeguimiento }[];
}

export interface EmailServicioSeguimiento {
	id: number;
	email: string;
	uso: 'COBRANZA' | 'FACTURACION' | 'COMPARTIDO';
}

/** Mails activos del servicio para precargar el correo automático. */
export async function listarEmailsServicioSeguimiento(
	servicioId: number
): Promise<EmailServicioSeguimiento[]> {
	const datos = await pedir<{ emails: EmailServicioSeguimiento[] }>(
		`/api/seguimientos/servicios/${servicioId}/emails`
	);
	return datos.emails;
}

export interface ComprobanteServicio {
	id: number;
	tipoComprobante: string;
	serie: string;
	numero: string;
	fechaEmision: string;
	fechaVencimiento: string | null;
	moneda: string;
	importe: string;
	saldo: string;
	diasAging: number;
	vencida: boolean;
	periodo: string;
}

export interface CorreoSinVincular {
	id: number;
	de: string | null;
	para: string | null;
	asunto: string | null;
	cuerpo: string | null;
	fechaHora: string;
	servicio: SeguimientoServicio | null;
	estadoVinculacion: string;
	proveedor: string;
}

export interface NotificacionesSeguimientos {
	items: {
		id: number;
		tipo: string;
		titulo: string;
		detalle: string | null;
		leido: boolean;
		creadoEn: string;
		seguimientoId: number;
		codigo: string;
		tituloSeguimiento: string;
	}[];
	noLeidas: number;
}

export interface ProximaAccionDatos {
	tipoAccion: TipoAccion;
	titulo: string;
	fechaHora: string;
	responsableUsuarioId?: string;
	recordatorioMinutos?: number;
	nota?: string | null;
	canalPrevisto?: CanalAvance | null;
}

export interface NuevoSeguimientoDatos {
	servicioId: number;
	titulo: string;
	motivo?: string | null;
	estado?: EstadoSeguimiento;
	prioridad?: PrioridadSeguimiento;
	responsableUsuarioId?: string;
	canalPreferido?: CanalAvance | null;
	/** Si se omite, el backend copia el celular del servicio. */
	telefonoWhatsapp?: string | null;
	facturaIds: number[];
	nota?: string;
	observadores?: string[];
	proximaAccion?: ProximaAccionDatos;
	envioId?: number | null;
}

export class ErrorApiSeguimientos extends Error {
	constructor(
		mensaje: string,
		readonly codigo?: string,
		readonly actual?: Record<string, unknown>
	) {
		super(mensaje);
		this.name = 'ErrorApiSeguimientos';
	}
}

async function pedir<T>(url: string, init?: RequestInit): Promise<T> {
	const respuesta = await fetch(url, { cache: 'no-store', ...init });
	const datos = (await respuesta.json().catch(() => ({}))) as Record<string, unknown>;
	if (!respuesta.ok) {
		throw new ErrorApiSeguimientos(
			typeof datos.error === 'string' ? datos.error : 'No se pudo completar la operación',
			typeof datos.codigo === 'string' ? datos.codigo : undefined,
			(datos.actual as Record<string, unknown> | undefined) ?? undefined
		);
	}
	return datos as T;
}

export async function listarSeguimientos(incluirCerrados = false): Promise<SeguimientoResumen[]> {
	const datos = await pedir<{ seguimientos: SeguimientoResumen[] }>(
		incluirCerrados ? '/api/seguimientos?cerrados=1' : '/api/seguimientos'
	);
	return datos.seguimientos;
}

export async function obtenerSeguimiento(id: number): Promise<SeguimientoDetalle> {
	const datos = await pedir<{ seguimiento: SeguimientoDetalle }>(`/api/seguimientos/${id}`);
	return datos.seguimiento;
}

export async function crearSeguimiento(datos: NuevoSeguimientoDatos): Promise<SeguimientoDetalle> {
	const respuesta = await pedir<{ seguimiento: SeguimientoDetalle }>('/api/seguimientos', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(datos)
	});
	return respuesta.seguimiento;
}

export async function actualizarSeguimiento(
	id: number,
	datos: Record<string, unknown>
): Promise<SeguimientoDetalle> {
	const respuesta = await pedir<{ seguimiento: SeguimientoDetalle }>(`/api/seguimientos/${id}`, {
		method: 'PATCH',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(datos)
	});
	return respuesta.seguimiento;
}

export interface EstadoWhatsAppSeguimientos {
	conectado: boolean;
	estado: string;
	numeroTelefono: string | null;
}

export async function obtenerEstadoWhatsAppSeguimientos(): Promise<EstadoWhatsAppSeguimientos> {
	return await pedir('/api/seguimientos/whatsapp/estado');
}

export async function enviarWhatsAppSeguimiento(
	id: number,
	texto: string
): Promise<SeguimientoDetalle> {
	const respuesta = await pedir<{ seguimiento: SeguimientoDetalle }>(
		`/api/seguimientos/${id}/whatsapp/enviar`,
		{
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ texto })
		}
	);
	return respuesta.seguimiento;
}

export async function desvincularMensajeWhatsApp(
	id: number,
	mensajeId: number
): Promise<void> {
	await pedir(`/api/seguimientos/${id}/whatsapp/mensajes/${mensajeId}`, { method: 'DELETE' });
}

export interface VerificacionWhatsAppSeguimiento {
	/** ¿Se pudo consultar? false si la sesión de WhatsApp está caída. */
	consultado: boolean;
	existe: boolean;
	jid: string | null;
	motivo: string | null;
	telefonoWhatsapp: string;
	verificadoEn: string | null;
}

export async function verificarWhatsAppSeguimiento(
	id: number
): Promise<VerificacionWhatsAppSeguimiento> {
	return await pedir(`/api/seguimientos/${id}/whatsapp/verificar`, { method: 'POST' });
}

export async function registrarAvance(
	id: number,
	datos: {
		canal: CanalAvance;
		direccion?: 'ENTRANTE' | 'SALIENTE' | 'INTERNA';
		contenido: string;
		contacto?: string;
		resultado?: string;
		duracionMinutos?: number;
		asunto?: string;
		destinatarios?: string[];
		estadoEntrega?: 'REGISTRADO' | 'ENVIADO' | 'RECIBIDO' | 'FALLIDO';
		programarProxima?: ProximaAccionDatos;
	}
): Promise<SeguimientoDetalle> {
	const respuesta = await pedir<{ seguimiento: SeguimientoDetalle }>(
		`/api/seguimientos/${id}/eventos`,
		{
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(datos)
		}
	);
	return respuesta.seguimiento;
}

export async function crearTarea(
	id: number,
	datos: {
		tipoAccion: TipoAccion;
		titulo: string;
		nota?: string | null;
		fechaHora: string;
		responsableUsuarioId?: string;
		recordatorioMinutos?: number;
		canalPrevisto?: CanalAvance | null;
	}
): Promise<SeguimientoDetalle> {
	const respuesta = await pedir<{ seguimiento: SeguimientoDetalle }>(
		`/api/seguimientos/${id}/tareas`,
		{
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(datos)
		}
	);
	return respuesta.seguimiento;
}

export async function actualizarTarea(
	id: number,
	tareaId: number,
	datos: {
		version: number;
		accion: 'COMPLETAR' | 'REPROGRAMAR' | 'CANCELAR' | 'TRANSFERIR';
		resultado?: string;
		fechaHora?: string;
		responsableUsuarioId?: string;
		motivo?: string;
	}
): Promise<SeguimientoDetalle> {
	const respuesta = await pedir<{ seguimiento: SeguimientoDetalle }>(
		`/api/seguimientos/${id}/tareas/${tareaId}`,
		{
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(datos)
		}
	);
	return respuesta.seguimiento;
}

export async function crearPromesa(
	id: number,
	datos: {
		fechaPrometida: string;
		importe: number;
		moneda: 'UYU' | 'USD';
		comprobanteIds?: number[];
		medioPago?: string;
		confirmadoPorContacto?: string;
		canal?: CanalAvance;
		observaciones?: string | null;
	}
): Promise<SeguimientoDetalle> {
	const respuesta = await pedir<{ seguimiento: SeguimientoDetalle }>(
		`/api/seguimientos/${id}/promesas`,
		{
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(datos)
		}
	);
	return respuesta.seguimiento;
}

export async function actualizarPromesa(
	id: number,
	promesaId: number,
	datos: { version: number; estado: string; detalle?: string }
): Promise<SeguimientoDetalle> {
	const respuesta = await pedir<{ seguimiento: SeguimientoDetalle }>(
		`/api/seguimientos/${id}/promesas/${promesaId}`,
		{
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(datos)
		}
	);
	return respuesta.seguimiento;
}

export async function agregarFacturas(
	id: number,
	comprobanteIds: number[]
): Promise<SeguimientoDetalle> {
	const respuesta = await pedir<{ seguimiento: SeguimientoDetalle }>(
		`/api/seguimientos/${id}/facturas`,
		{
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ comprobanteIds })
		}
	);
	return respuesta.seguimiento;
}

export async function retirarFactura(
	id: number,
	facturaId: number,
	motivo: string
): Promise<SeguimientoDetalle> {
	const respuesta = await pedir<{ seguimiento: SeguimientoDetalle }>(
		`/api/seguimientos/${id}/facturas/${facturaId}/retirar`,
		{
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ motivo })
		}
	);
	return respuesta.seguimiento;
}

export async function crearTicketSeguimiento(
	id: number,
	datos: {
		titulo: string;
		descripcion: string;
		prioridad: 'BAJA' | 'NORMAL' | 'ALTA' | 'URGENTE';
		areaResponsableId: number;
		usuarioAsignadoId?: string | null;
		bloqueante?: boolean;
		motivoBloqueo?: string | null;
		facturaIds?: number[];
	}
): Promise<{ ticketId: number; codigo: string }> {
	return await pedir<{ ticketId: number; codigo: string }>(`/api/seguimientos/${id}/tickets`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(datos)
	});
}

/** Ficha + conversación del ticket que se abre como modal en el seguimiento. */
export type TicketVinculado = TicketDetalle & { bloqueante: boolean };

export async function obtenerTicketVinculado(
	id: number,
	ticketId: number
): Promise<TicketVinculado> {
	return await pedir<TicketVinculado>(`/api/seguimientos/${id}/tickets/${ticketId}`);
}

/** Responde el ticket vinculado sin salir del seguimiento. */
export async function responderTicketVinculado(
	id: number,
	ticketId: number,
	datos: MensajeTicketDatos
): Promise<ResultadoMensajeTicket> {
	return await pedir<ResultadoMensajeTicket>(
		`/api/seguimientos/${id}/tickets/${ticketId}/mensajes`,
		{
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(datos)
		}
	);
}

export async function listarCatalogosSeguimientos(): Promise<CatalogosSeguimientos> {
	return await pedir<CatalogosSeguimientos>('/api/seguimientos/catalogos');
}

export async function buscarServiciosSeguimiento(
	q: string
): Promise<ServicioBuscadoSeguimiento[]> {
	const datos = await pedir<{ servicios: ServicioBuscadoSeguimiento[] }>(
		`/api/seguimientos/servicios?q=${encodeURIComponent(q)}`
	);
	return datos.servicios;
}

export async function comprobantesDeServicio(servicioId: number): Promise<ComprobanteServicio[]> {
	const datos = await pedir<{ comprobantes: ComprobanteServicio[] }>(
		`/api/seguimientos/servicios/${servicioId}/comprobantes`
	);
	return datos.comprobantes;
}

export async function listarCorreosSinVincular(): Promise<CorreoSinVincular[]> {
	const datos = await pedir<{ correos: CorreoSinVincular[] }>('/api/seguimientos/correos');
	return datos.correos;
}

export async function vincularCorreo(id: number, seguimientoId: number): Promise<SeguimientoDetalle> {
	const respuesta = await pedir<{ seguimiento: SeguimientoDetalle }>(
		`/api/seguimientos/correos/${id}/vincular`,
		{
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ seguimientoId })
		}
	);
	return respuesta.seguimiento;
}

export async function listarNotificacionesSeguimientos(): Promise<NotificacionesSeguimientos> {
	return await pedir<NotificacionesSeguimientos>('/api/seguimientos/notificaciones');
}

export async function marcarNotificacionesSeguimientosLeidas(): Promise<number> {
	const respuesta = await pedir<{ actualizadas: number }>(
		'/api/seguimientos/notificaciones/leidas',
		{ method: 'POST' }
	);
	return respuesta.actualizadas;
}
