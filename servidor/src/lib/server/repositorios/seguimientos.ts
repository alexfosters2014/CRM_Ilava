import { and, asc, desc, eq, inArray, isNull, ne, or, sql } from 'drizzle-orm';
import {
	areas,
	comprobantesCobranza,
	periodosCobranza,
	db,
	gmailCuentas,
	seguimientos,
	seguimientosCorreos,
	seguimientosEventos,
	seguimientosFacturas,
	seguimientosLecturas,
	seguimientosNotificaciones,
	seguimientosParticipantes,
	seguimientosPromesas,
	seguimientosTareas,
	seguimientosTickets,
	servicios,
	serviciosEmails,
	tickets,
	user
} from '../base-datos/index.ts';
import { puede, type UsuarioSesion } from '../permisos/reglas.ts';
import { crearTicket, agregarMensaje, obtenerTicket } from './tickets.ts';
import type { DatosMensajeTicket } from '../validaciones/tickets.ts';
import type {
	DatosAvance,
	DatosPromesaActualizar,
	DatosPromesaNueva,
	DatosSeguimientoActualizar,
	DatosSeguimientoNuevo,
	DatosTareaActualizar,
	DatosTareaNueva,
	DatosTicketSeguimiento,
	EstadoSeguimiento,
	EstadoTarea,
	PrioridadSeguimiento
} from '../validaciones/seguimientos.ts';
import { ESTADOS_CERRADOS } from '../validaciones/seguimientos.ts';

/**
 * Capa: Repositorios — Centro de seguimiento de cobranza.
 *
 * Reglas de negocio:
 * - Ver: cualquier usuario con la pantalla `seguimientos`.
 * - Editar: ADMIN, área TODOS o un usuario del área del caso. Los observadores
 *   de otras áreas ven el caso en solo lectura.
 * - Concurrencia optimista por `version` en el caso, tareas y promesas.
 * - Nada se borra: estados, retiros y correcciones generan eventos.
 * - Cerrar exige motivo y no admite tickets bloqueantes abiertos.
 * - El saldo de las facturas es dinámico: se resuelve contra el último período
 *   importado para la misma clave de comprobante.
 */

export type CodigoErrorSeguimientos =
	| 'NO_ENCONTRADO'
	| 'SIN_PERMISO'
	| 'DATOS_INVALIDOS'
	| 'CONFLICTO_VERSION'
	| 'TICKETS_BLOQUEANTES'
	| 'TAREAS_PENDIENTES'
	| 'ESTADO_INVALIDO'
	| 'SERVICIO_INVALIDO'
	| 'FACTURA_INVALIDA'
	| 'WHATSAPP_DESCONECTADO'
	| 'SIN_TELEFONO';

export class ErrorSeguimientos extends Error {
	constructor(
		readonly codigo: CodigoErrorSeguimientos,
		mensaje: string,
		readonly datos?: Record<string, unknown>
	) {
		super(mensaje);
		this.name = 'ErrorSeguimientos';
	}
}

export function estadoHttpSeguimientos(codigo: CodigoErrorSeguimientos): number {
	switch (codigo) {
		case 'NO_ENCONTRADO':
			return 404;
		case 'SIN_PERMISO':
			return 403;
		case 'CONFLICTO_VERSION':
		case 'TICKETS_BLOQUEANTES':
		case 'TAREAS_PENDIENTES':
		case 'WHATSAPP_DESCONECTADO':
			return 409;
		case 'SIN_TELEFONO':
			return 400;
		default:
			return 400;
	}
}

type Transaccion = Parameters<Parameters<typeof db.transaction>[0]>[0];

export interface SeguimientoServicioVista {
	id: number;
	nombre: string;
	nombreFantasia: string | null;
	numeracion: string | null;
	cliente: string;
	diasVencimiento: number;
}

export interface SeguimientoUsuarioVista {
	id: string;
	nombre: string;
	email: string;
	areaId: number | null;
	areaNombre: string | null;
}

export interface SeguimientoAreaVista {
	id: number;
	nombre: string;
}

export interface SeguimientoFacturaVista {
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

export interface SeguimientoTareaVista {
	id: number;
	tipoAccion: string;
	titulo: string;
	nota: string | null;
	fechaHora: string;
	responsable: SeguimientoUsuarioVista | null;
	recordatorioMinutos: number;
	canalPrevisto: string | null;
	estado: EstadoTarea | 'VENCIDA';
	estadoBase: EstadoTarea;
	resultado: string | null;
	fechaCompletada: string | null;
	motivoCancelacion: string | null;
	version: number;
}

export interface SeguimientoPromesaVista {
	id: number;
	fechaPrometida: string;
	importe: string;
	moneda: string;
	comprobanteIds: number[];
	medioPago: string | null;
	confirmadoPorContacto: string | null;
	canal: string | null;
	observaciones: string | null;
	estado: string;
	resultadoDetalle: string | null;
	confirmadoPor: SeguimientoUsuarioVista | null;
	fechaConfirmacion: string | null;
	version: number;
}

export interface SeguimientoTicketVista {
	id: number;
	codigo: string;
	titulo: string;
	estado: string;
	prioridad: string;
	areaResponsable: SeguimientoAreaVista | null;
	usuarioAsignado: SeguimientoUsuarioVista | null;
	bloqueante: boolean;
	motivoBloqueo: string | null;
	fechaCreacion: string;
	fechaActualizacion: string;
	abierto: boolean;
}

export interface SeguimientoEventoVista {
	id: number;
	tipo: string;
	canal: string;
	direccion: string;
	contenido: string;
	autor: SeguimientoUsuarioVista | null;
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
	servicio: SeguimientoServicioVista;
	area: SeguimientoAreaVista;
	responsable: SeguimientoUsuarioVista;
	observadores: SeguimientoUsuarioVista[];
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
	proximaGestion: SeguimientoTareaVista | null;
	promesa: SeguimientoPromesaVista | null;
	tickets: { abiertos: number; bloqueantes: number };
	noLeidos: number;
	version: number;
}

export interface SeguimientoDetalle extends SeguimientoResumen {
	eventos: SeguimientoEventoVista[];
	facturasDetalle: SeguimientoFacturaVista[];
	tareas: SeguimientoTareaVista[];
	promesas: SeguimientoPromesaVista[];
	ticketsDetalle: SeguimientoTicketVista[];
	permisos: SeguimientoPermisos;
}

export interface CorreoSinVincularVista {
	id: number;
	de: string | null;
	para: string | null;
	asunto: string | null;
	cuerpo: string | null;
	fechaHora: string;
	servicio: SeguimientoServicioVista | null;
	estadoVinculacion: string;
	proveedor: string;
}

// ------------------------------------------------------------------ Helpers

const asignado = user;

function iso(fecha: Date | string | null | undefined): string | null {
	if (!fecha) return null;
	return fecha instanceof Date ? fecha.toISOString() : new Date(fecha).toISOString();
}

function formatearCodigo(numero: number, fecha = new Date()): string {
	return `SEG-${fecha.getFullYear()}-${String(numero).padStart(6, '0')}`;
}

function diasDesde(fecha: string | null): number {
	if (!fecha) return 0;
	const inicio = new Date(`${fecha.slice(0, 10)}T00:00:00Z`).getTime();
	const hoy = new Date();
	const hoyUtc = Date.UTC(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
	return Math.max(0, Math.floor((hoyUtc - inicio) / 86400000));
}

function hoyIso(): string {
	const hoy = new Date();
	return `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`;
}

function etiquetaCanal(canal: string): string {
	const etiquetas: Record<string, string> = {
		NOTA: 'Nota interna',
		CORREO: 'Correo',
		CORREO_MANUAL: 'Correo manual',
		WHATSAPP: 'WhatsApp',
		WHATSAPP_MANUAL: 'WhatsApp manual',
		TELEFONO: 'Llamada',
		REUNION: 'Reunión',
		OTRO: 'Otro'
	};
	return etiquetas[canal] ?? canal;
}

function tipoDeCanal(canal: string): string {
	if (canal === 'TELEFONO') return 'LLAMADA';
	if (canal === 'CORREO') return 'CORREO';
	if (canal === 'CORREO_MANUAL') return 'CORREO';
	if (canal === 'WHATSAPP') return 'WHATSAPP';
	if (canal === 'WHATSAPP_MANUAL') return 'WHATSAPP';
	if (canal === 'REUNION') return 'REUNION';
	if (canal === 'NOTA') return 'NOTA';
	return 'NOTA';
}

async function siguienteCodigo(tx: Transaccion): Promise<string> {
	const resultado = (await tx.execute(
		sql`select nextval('seguimiento_codigo_seq') as numero`
	)) as unknown as { rows?: { numero: string }[] };
	const numero = Number(resultado.rows?.[0]?.numero ?? 0);
	if (!numero) throw new Error('No se pudo generar el código del seguimiento');
	return formatearCodigo(numero);
}

async function mapaUsuarios(): Promise<Map<string, SeguimientoUsuarioVista>> {
	const filas = await db
		.select({
			id: user.id,
			nombre: user.name,
			email: user.email,
			areaId: areas.id,
			areaNombre: areas.nombre
		})
		.from(user)
		.leftJoin(areas, eq(areas.id, user.areaId));
	return new Map(
		filas.map((fila) => [
			fila.id,
			{
				id: fila.id,
				nombre: fila.nombre ?? fila.email ?? 'Usuario',
				email: fila.email ?? '',
				areaId: fila.areaId,
				areaNombre: fila.areaNombre
			}
		])
	);
}

async function ultimaCotizacion(): Promise<number | null> {
	const filas = await db
		.select({ cotizacion: periodosCobranza.cotizacionUsd })
		.from(periodosCobranza)
		.orderBy(desc(periodosCobranza.periodo))
		.limit(1);
	const valor = filas[0]?.cotizacion;
	return valor ? Number(valor) : null;
}

/**
 * Saldos actuales: por cada comprobante asociado se busca su última aparición
 * en la cartera (misma clave de origen). Si ya no figura en el último período,
 * o figura inactivo/eliminado, el saldo actual es cero.
 */
async function resolverSaldos(
	claves: { servicioId: number; claveOrigen: string }[]
): Promise<
	Map<
		string,
		{
			saldo: number;
			importe: number;
			moneda: string;
			emision: string;
			vencimiento: string | null;
			estado: 'PENDIENTE' | 'PARCIAL' | 'PAGADA' | 'ANULADA';
		}
	>
> {
	const resultado = new Map<
		string,
		{
			saldo: number;
			importe: number;
			moneda: string;
			emision: string;
			vencimiento: string | null;
			estado: 'PENDIENTE' | 'PARCIAL' | 'PAGADA' | 'ANULADA';
		}
	>();
	if (claves.length === 0) return resultado;

	const servicioIds = [...new Set(claves.map((clave) => clave.servicioId))];
	const clavesOrigen = [...new Set(claves.map((clave) => clave.claveOrigen))];

	const filas = await db
		.select({
			servicioId: comprobantesCobranza.servicioId,
			claveOrigen: comprobantesCobranza.claveOrigen,
			moneda: comprobantesCobranza.moneda,
			importe: comprobantesCobranza.importe,
			saldo: comprobantesCobranza.saldoPendiente,
			fechaEmision: comprobantesCobranza.fechaEmision,
			fechaVencimiento: comprobantesCobranza.fechaVencimiento,
			activo: comprobantesCobranza.activo,
			eliminadoEn: comprobantesCobranza.eliminadoEn,
			periodo: periodosCobranza.periodo
		})
		.from(comprobantesCobranza)
		.innerJoin(periodosCobranza, eq(periodosCobranza.id, comprobantesCobranza.periodoId))
		.where(
			and(
				inArray(comprobantesCobranza.servicioId, servicioIds),
				inArray(comprobantesCobranza.claveOrigen, clavesOrigen)
			)
		)
		.orderBy(asc(periodosCobranza.periodo));

	const pedidas = new Set(claves.map((clave) => `${clave.servicioId}|${clave.claveOrigen}`));
	const ultimas = new Map<string, (typeof filas)[number]>();
	for (const fila of filas) {
		const clave = `${fila.servicioId}|${fila.claveOrigen}`;
		if (!pedidas.has(clave)) continue;
		ultimas.set(clave, fila);
	}

	for (const [clave, fila] of ultimas) {
		const anulada = Boolean(fila.eliminadoEn);
		const sinSaldo = anulada || !fila.activo || Number(fila.saldo) <= 0;
		const saldo = sinSaldo ? 0 : Number(fila.saldo);
		const importe = Number(fila.importe);
		const estado: 'PENDIENTE' | 'PARCIAL' | 'PAGADA' | 'ANULADA' = anulada
			? 'ANULADA'
			: saldo <= 0
				? 'PAGADA'
				: saldo < importe
					? 'PARCIAL'
					: 'PENDIENTE';
		resultado.set(clave, {
			saldo,
			importe,
			moneda: fila.moneda,
			emision: fila.fechaEmision,
			vencimiento: fila.fechaVencimiento,
			estado
		});
	}

	return resultado;
}

async function facturasDe(
	seguimientoIds: number[]
): Promise<Map<number, SeguimientoFacturaVista[]>> {
	const resultado = new Map<number, SeguimientoFacturaVista[]>();
	if (seguimientoIds.length === 0) return resultado;

	const filas = await db
		.select({
			id: seguimientosFacturas.id,
			seguimientoId: seguimientosFacturas.seguimientoId,
			comprobanteId: seguimientosFacturas.comprobanteId,
			claveOrigen: seguimientosFacturas.claveOrigen,
			saldoAlAsociar: seguimientosFacturas.saldoAlAsociar,
			activa: seguimientosFacturas.activa,
			motivoRetiro: seguimientosFacturas.motivoRetiro,
			fechaAsociacion: seguimientosFacturas.fechaAsociacion,
			asociadaPor: seguimientosFacturas.asociadaPor,
			servicioId: comprobantesCobranza.servicioId,
			tipoComprobante: comprobantesCobranza.tipoComprobante,
			serie: comprobantesCobranza.serie,
			numero: comprobantesCobranza.numero,
			periodo: periodosCobranza.periodo,
			plazoDias: servicios.cantidadDiasVencimiento
		})
		.from(seguimientosFacturas)
		.innerJoin(comprobantesCobranza, eq(comprobantesCobranza.id, seguimientosFacturas.comprobanteId))
		.innerJoin(periodosCobranza, eq(periodosCobranza.id, comprobantesCobranza.periodoId))
		.innerJoin(servicios, eq(servicios.id, comprobantesCobranza.servicioId))
		.where(
			and(
				inArray(seguimientosFacturas.seguimientoId, seguimientoIds),
				eq(seguimientosFacturas.activa, true)
			)
		);

	const saldos = await resolverSaldos(
		filas.map((fila) => ({ servicioId: fila.servicioId, claveOrigen: fila.claveOrigen }))
	);

	for (const fila of filas) {
		const actual = saldos.get(`${fila.servicioId}|${fila.claveOrigen}`);
		const fechaEmision = actual?.emision ?? fila.periodo;
		const vencimiento = actual?.vencimiento ?? null;
		const saldo = actual?.saldo ?? 0;
		const vencida = vencimiento ? vencimiento < hoyIso() && saldo > 0 : false;
		const vista: SeguimientoFacturaVista = {
			id: fila.id,
			comprobanteId: fila.comprobanteId,
			tipoComprobante: fila.tipoComprobante,
			serie: fila.serie,
			numero: fila.numero,
			fechaEmision,
			fechaVencimiento: vencimiento,
			plazoDias: fila.plazoDias,
			moneda: actual?.moneda ?? 'UYU',
			importe: String(actual?.importe ?? 0),
			saldo: String(saldo),
			saldoAlAsociar: fila.saldoAlAsociar,
			diasAging: diasDesde(fechaEmision),
			vencida,
			estado: actual?.estado ?? 'PAGADA',
			activa: fila.activa,
			motivoRetiro: fila.motivoRetiro,
			fechaAsociacion: iso(fila.fechaAsociacion) ?? '',
			asociadaPor: fila.asociadaPor,
			periodo: fila.periodo
		};
		const lista = resultado.get(fila.seguimientoId) ?? [];
		lista.push(vista);
		resultado.set(fila.seguimientoId, lista);
	}

	return resultado;
}

async function pendientesDe(seguimientoIds: number[]): Promise<{
	tareas: Map<number, SeguimientoTareaVista[]>;
	promesas: Map<number, SeguimientoPromesaVista[]>;
	usuarios: Map<string, SeguimientoUsuarioVista>;
}> {
	const tareas = new Map<number, SeguimientoTareaVista[]>();
	const promesas = new Map<number, SeguimientoPromesaVista[]>();
	const usuarios = await mapaUsuarios();
	if (seguimientoIds.length === 0) return { tareas, promesas, usuarios };

	const filasTareas = await db
		.select()
		.from(seguimientosTareas)
		.where(inArray(seguimientosTareas.seguimientoId, seguimientoIds))
		.orderBy(asc(seguimientosTareas.fechaHora));

	for (const fila of filasTareas) {
		const vista: SeguimientoTareaVista = {
			id: fila.id,
			tipoAccion: fila.tipoAccion,
			titulo: fila.titulo,
			nota: fila.nota,
			fechaHora: iso(fila.fechaHora) ?? '',
			responsable: usuarios.get(fila.responsableUsuarioId) ?? null,
			recordatorioMinutos: fila.recordatorioMinutos,
			canalPrevisto: fila.canalPrevisto,
			estadoBase: fila.estado as EstadoTarea,
			estado:
				fila.estado === 'PENDIENTE' && new Date(fila.fechaHora).getTime() < Date.now()
					? 'VENCIDA'
					: (fila.estado as EstadoTarea),
			resultado: fila.resultado,
			fechaCompletada: iso(fila.fechaCompletada),
			motivoCancelacion: fila.motivoCancelacion,
			version: fila.version
		};
		const lista = tareas.get(fila.seguimientoId) ?? [];
		lista.push(vista);
		tareas.set(fila.seguimientoId, lista);
	}

	const filasPromesas = await db
		.select()
		.from(seguimientosPromesas)
		.where(inArray(seguimientosPromesas.seguimientoId, seguimientoIds))
		.orderBy(desc(seguimientosPromesas.fechaPrometida));

	for (const fila of filasPromesas) {
		const vigenteVencida =
			fila.estado === 'VIGENTE' && new Date(fila.fechaPrometida).getTime() < Date.now();
		const vista: SeguimientoPromesaVista = {
			id: fila.id,
			fechaPrometida: iso(fila.fechaPrometida) ?? '',
			importe: fila.importe,
			moneda: fila.moneda,
			comprobanteIds: fila.comprobanteIds,
			medioPago: fila.medioPago,
			confirmadoPorContacto: fila.confirmadoPorContacto,
			canal: fila.canal,
			observaciones: fila.observaciones,
			estado: vigenteVencida ? 'INCUMPLIDA' : fila.estado,
			resultadoDetalle: fila.resultadoDetalle,
			confirmadoPor: fila.confirmadoPorUsuarioId
				? (usuarios.get(fila.confirmadoPorUsuarioId) ?? null)
				: null,
			fechaConfirmacion: iso(fila.fechaConfirmacion),
			version: fila.version
		};
		const lista = promesas.get(fila.seguimientoId) ?? [];
		lista.push(vista);
		promesas.set(fila.seguimientoId, lista);
	}

	return { tareas, promesas, usuarios };
}

async function ticketsDe(
	seguimientoIds: number[]
): Promise<Map<number, SeguimientoTicketVista[]>> {
	const resultado = new Map<number, SeguimientoTicketVista[]>();
	if (seguimientoIds.length === 0) return resultado;

	const filas = await db
		.select({
			seguimientoId: seguimientosTickets.seguimientoId,
			bloqueante: seguimientosTickets.bloqueante,
			motivoBloqueo: seguimientosTickets.motivoBloqueo,
			ticketId: tickets.id,
			codigo: tickets.codigoVisible,
			titulo: tickets.titulo,
			estado: tickets.estado,
			prioridad: tickets.prioridad,
			areaId: areas.id,
			areaNombre: areas.nombre,
			asignadoId: asignado.id,
			asignadoNombre: asignado.name,
			asignadoEmail: asignado.email,
			asignadoAreaId: areas.id,
			asignadoAreaNombre: areas.nombre,
			fechaCreacion: tickets.fechaCreacion,
			fechaActualizacion: tickets.fechaActualizacion
		})
		.from(seguimientosTickets)
		.innerJoin(tickets, eq(tickets.id, seguimientosTickets.ticketId))
		.innerJoin(areas, eq(areas.id, tickets.areaResponsableId))
		.leftJoin(asignado, eq(asignado.id, tickets.usuarioAsignadoId))
		.where(inArray(seguimientosTickets.seguimientoId, seguimientoIds))
		.orderBy(desc(tickets.fechaActualizacion));

	for (const fila of filas) {
		const vista: SeguimientoTicketVista = {
			id: fila.ticketId,
			codigo: fila.codigo,
			titulo: fila.titulo,
			estado: fila.estado,
			prioridad: fila.prioridad,
			areaResponsable: { id: fila.areaId, nombre: fila.areaNombre },
			usuarioAsignado: fila.asignadoId
				? {
						id: fila.asignadoId,
						nombre: fila.asignadoNombre ?? '',
						email: fila.asignadoEmail ?? '',
						areaId: fila.asignadoAreaId,
						areaNombre: fila.asignadoAreaNombre
					}
				: null,
			bloqueante: fila.bloqueante,
			motivoBloqueo: fila.motivoBloqueo,
			fechaCreacion: iso(fila.fechaCreacion) ?? '',
			fechaActualizacion: iso(fila.fechaActualizacion) ?? '',
			abierto: fila.estado !== 'CERRADO' && fila.estado !== 'CANCELADO'
		};
		const lista = resultado.get(fila.seguimientoId) ?? [];
		lista.push(vista);
		resultado.set(fila.seguimientoId, lista);
	}

	return resultado;
}

function calcularPermisos(usuario: UsuarioSesion, areaId: number): SeguimientoPermisos {	const mismaArea = usuario.areaId === areaId || usuario.areaNombre === 'TODOS';
	const editar = usuario.admin || mismaArea;
	return {
		ver: true,
		editar,
		cerrar: editar,
		reabrir: editar,
		crearTicket: editar && puede(usuario, 'tickets')
	};
}

function exigirAbierto(estado: string) {
	if (ESTADOS_CERRADOS.includes(estado as EstadoSeguimiento)) {
		throw new ErrorSeguimientos(
			'ESTADO_INVALIDO',
			'El seguimiento está cerrado: reabrilo para registrar movimientos'
		);
	}
}

async function cargarFilaSeguimiento(id: number) {
	const filas = await db
		.select({
			id: seguimientos.id,
			codigo: seguimientos.codigoVisible,
			titulo: seguimientos.titulo,
			motivo: seguimientos.motivo,
			estado: seguimientos.estado,
			prioridad: seguimientos.prioridad,
			servicioId: servicios.id,
			servicioNombre: servicios.contactoFacturacion,
			servicioFantasia: servicios.nombreFantasia,
			servicioNumeracion: servicios.numeracion,
			diasVencimiento: servicios.cantidadDiasVencimiento,
			areaId: seguimientos.areaId,
			areaNombre: areas.nombre,
			responsableId: seguimientos.responsableUsuarioId,
			responsableNombre: user.name,
			responsableEmail: user.email,
			responsableAreaId: areas.id,
			responsableAreaNombre: areas.nombre,
			canalPreferido: seguimientos.canalPreferido,
			telefonoWhatsapp: seguimientos.telefonoWhatsapp,
			telefonoWhatsappVerificadoEn: seguimientos.telefonoWhatsappVerificadoEn,
			fechaApertura: seguimientos.fechaApertura,
			fechaCierre: seguimientos.fechaCierre,
			motivoCierre: seguimientos.motivoCierre,
			ultimaActividad: seguimientos.ultimaActividad,
			ultimoContactoEn: seguimientos.ultimoContactoEn,
			ultimoCanal: seguimientos.ultimoCanal,
			version: seguimientos.version
		})
		.from(seguimientos)
		.innerJoin(servicios, eq(servicios.id, seguimientos.servicioId))
		.innerJoin(areas, eq(areas.id, seguimientos.areaId))
		.innerJoin(user, eq(user.id, seguimientos.responsableUsuarioId))
		.where(eq(seguimientos.id, id))
		.limit(1);
	return filas[0] ?? null;
}

async function observadoresDe(seguimientoIds: number[]) {
	const resultado = new Map<number, SeguimientoUsuarioVista[]>();
	if (seguimientoIds.length === 0) return resultado;
	const filas = await db
		.select({
			seguimientoId: seguimientosParticipantes.seguimientoId,
			usuarioId: user.id,
			nombre: user.name,
			email: user.email,
			areaId: areas.id,
			areaNombre: areas.nombre
		})
		.from(seguimientosParticipantes)
		.innerJoin(user, eq(user.id, seguimientosParticipantes.usuarioId))
		.leftJoin(areas, eq(areas.id, user.areaId))
		.where(
			and(
				inArray(seguimientosParticipantes.seguimientoId, seguimientoIds),
				eq(seguimientosParticipantes.rol, 'OBSERVADOR'),
				eq(seguimientosParticipantes.activo, true)
			)
		);
	for (const fila of filas) {
		const lista = resultado.get(fila.seguimientoId) ?? [];
		lista.push({
			id: fila.usuarioId,
			nombre: fila.nombre ?? fila.email ?? '',
			email: fila.email ?? '',
			areaId: fila.areaId,
			areaNombre: fila.areaNombre
		});
		resultado.set(fila.seguimientoId, lista);
	}
	return resultado;
}

async function noLeidosDe(seguimientoIds: number[], usuarioId: string) {
	const resultado = new Map<number, number>();
	if (seguimientoIds.length === 0) return resultado;
	const filas = await db
		.select({
			seguimientoId: seguimientosEventos.seguimientoId,
			total: sql<number>`count(*)::int`
		})
		.from(seguimientosEventos)
		.innerJoin(seguimientos, eq(seguimientos.id, seguimientosEventos.seguimientoId))
		.leftJoin(
			seguimientosLecturas,
			and(
				eq(seguimientosLecturas.seguimientoId, seguimientosEventos.seguimientoId),
				eq(seguimientosLecturas.usuarioId, usuarioId)
			)
		)
		.where(
			and(
				inArray(seguimientosEventos.seguimientoId, seguimientoIds),
				or(
					isNull(seguimientosEventos.autorUsuarioId),
					ne(seguimientosEventos.autorUsuarioId, usuarioId)
				),
				sql`${seguimientosEventos.fechaHora} > coalesce(${seguimientosLecturas.ultimaLectura}, ${seguimientos.fechaApertura})`
			)
		)
		.groupBy(seguimientosEventos.seguimientoId);
	for (const fila of filas) resultado.set(fila.seguimientoId, Number(fila.total));
	return resultado;
}

function armarResumen(
	fila: NonNullable<Awaited<ReturnType<typeof cargarFilaSeguimiento>>>,
	facturas: SeguimientoFacturaVista[],
	tareas: SeguimientoTareaVista[],
	promesas: SeguimientoPromesaVista[],
	ticketLista: SeguimientoTicketVista[],
	observadores: SeguimientoUsuarioVista[],
	noLeidos: number,
	cotizacion: number | null
): SeguimientoResumen {
	const activas = facturas.filter((factura) => factura.activa);
	const saldos = { UYU: 0, USD: 0 };
	let mayorAtraso = 0;
	let vencidas = 0;
	for (const factura of activas) {
		const saldo = Number(factura.saldo);
		if (factura.moneda === 'USD') saldos.USD += saldo;
		else saldos.UYU += saldo;
		if (factura.vencida && saldo > 0) {
			vencidas++;
			mayorAtraso = Math.max(mayorAtraso, factura.diasAging);
		}
	}
	const equivalente = cotizacion ? saldos.UYU + saldos.USD * cotizacion : null;

	return {
		id: fila.id,
		codigo: fila.codigo,
		titulo: fila.titulo,
		motivo: fila.motivo,
		estado: fila.estado as EstadoSeguimiento,
		prioridad: fila.prioridad as PrioridadSeguimiento,
		servicio: {
			id: fila.servicioId,
			nombre: fila.servicioNombre,
			nombreFantasia: fila.servicioFantasia,
			numeracion: fila.servicioNumeracion,
			cliente: fila.servicioFantasia || fila.servicioNombre,
			diasVencimiento: fila.diasVencimiento
		},
		area: { id: fila.areaId, nombre: fila.areaNombre },
		responsable: {
			id: fila.responsableId,
			nombre: fila.responsableNombre ?? fila.responsableEmail ?? '',
			email: fila.responsableEmail ?? '',
			areaId: fila.responsableAreaId,
			areaNombre: fila.responsableAreaNombre
		},
		observadores,
		fechaApertura: iso(fila.fechaApertura) ?? '',
		fechaCierre: iso(fila.fechaCierre),
		motivoCierre: fila.motivoCierre,
		ultimaActividad: iso(fila.ultimaActividad) ?? '',
		ultimoContactoEn: iso(fila.ultimoContactoEn),
		ultimoCanal: fila.ultimoCanal,
		canalPreferido: fila.canalPreferido,
		telefonoWhatsapp: fila.telefonoWhatsapp ?? null,
		telefonoWhatsappVerificadoEn: iso(fila.telefonoWhatsappVerificadoEn),
		saldos: {
			UYU: saldos.UYU.toFixed(2),
			USD: saldos.USD.toFixed(2),
			equivalenteUYU: equivalente === null ? null : equivalente.toFixed(2),
			cotizacion
		},
		facturas: {
			total: activas.length,
			vencidas,
			mayorAtraso,
			numeros: activas.map((factura) =>
				[factura.tipoComprobante, factura.serie, factura.numero].filter(Boolean).join(' ')
			),
			ids: activas.map((factura) => factura.comprobanteId)
		},
		proximaGestion:
			tareas.find((tarea) => tarea.estadoBase === 'PENDIENTE') ?? null,
		promesa:
			promesas.find((promesa) =>
				['VIGENTE', 'INCUMPLIDA', 'REPROGRAMADA'].includes(promesa.estado)
			) ?? null,
		tickets: {
			abiertos: ticketLista.filter((ticket) => ticket.abierto).length,
			bloqueantes: ticketLista.filter((ticket) => ticket.abierto && ticket.bloqueante).length
		},
		noLeidos,
		version: fila.version
	};
}

// ------------------------------------------------------------------ Lectura

export async function listarSeguimientos(
	usuario: UsuarioSesion,
	filtros: { servicioId?: number; incluirCerrados?: boolean } = {}
): Promise<SeguimientoResumen[]> {
	const condiciones = [];
	if (filtros.servicioId) condiciones.push(eq(seguimientos.servicioId, filtros.servicioId));
	if (!filtros.incluirCerrados) {
		condiciones.push(
			sql`${seguimientos.estado} not in ('CERRADO_PAGADO','CERRADO_ACUERDO','CERRADO_LEGAL','CERRADO_INCOBRABLE')`
		);
	}

	const filas = await db
		.select({
			id: seguimientos.id,
			codigo: seguimientos.codigoVisible,
			titulo: seguimientos.titulo,
			motivo: seguimientos.motivo,
			estado: seguimientos.estado,
			prioridad: seguimientos.prioridad,
			servicioId: servicios.id,
			servicioNombre: servicios.contactoFacturacion,
			servicioFantasia: servicios.nombreFantasia,
			servicioNumeracion: servicios.numeracion,
			diasVencimiento: servicios.cantidadDiasVencimiento,
			areaId: seguimientos.areaId,
			areaNombre: areas.nombre,
			responsableId: seguimientos.responsableUsuarioId,
			responsableNombre: user.name,
			responsableEmail: user.email,
			responsableAreaId: areas.id,
			responsableAreaNombre: areas.nombre,
			canalPreferido: seguimientos.canalPreferido,
			telefonoWhatsapp: seguimientos.telefonoWhatsapp,
			telefonoWhatsappVerificadoEn: seguimientos.telefonoWhatsappVerificadoEn,
			fechaApertura: seguimientos.fechaApertura,
			fechaCierre: seguimientos.fechaCierre,
			motivoCierre: seguimientos.motivoCierre,
			ultimaActividad: seguimientos.ultimaActividad,
			ultimoContactoEn: seguimientos.ultimoContactoEn,
			ultimoCanal: seguimientos.ultimoCanal,
			version: seguimientos.version
		})
		.from(seguimientos)
		.innerJoin(servicios, eq(servicios.id, seguimientos.servicioId))
		.innerJoin(areas, eq(areas.id, seguimientos.areaId))
		.innerJoin(user, eq(user.id, seguimientos.responsableUsuarioId))
		.where(condiciones.length > 0 ? and(...condiciones) : undefined)
		.orderBy(desc(seguimientos.ultimaActividad))
		.limit(500);

	const ids = filas.map((fila) => fila.id);
	const [facturas, pendientes, ticketMap, observadores, noLeidos, cotizacion] = await Promise.all([
		facturasDe(ids),
		pendientesDe(ids),
		ticketsDe(ids),
		observadoresDe(ids),
		noLeidosDe(ids, usuario.id),
		ultimaCotizacion()
	]);

	return filas.map((fila) =>
		armarResumen(
			fila,
			facturas.get(fila.id) ?? [],
			pendientes.tareas.get(fila.id) ?? [],
			pendientes.promesas.get(fila.id) ?? [],
			ticketMap.get(fila.id) ?? [],
			observadores.get(fila.id) ?? [],
			noLeidos.get(fila.id) ?? 0,
			cotizacion
		)
	);
}

export async function obtenerSeguimiento(
	usuario: UsuarioSesion,
	id: number,
	marcarLeido = true
): Promise<SeguimientoDetalle> {
	const fila = await cargarFilaSeguimiento(id);
	if (!fila) throw new ErrorSeguimientos('NO_ENCONTRADO', 'El seguimiento no existe');

	const [facturas, pendientes, ticketLista, observadores, noLeidos, eventos, cotizacion] =
		await Promise.all([
			facturasDe([id]),
			pendientesDe([id]),
			ticketsDe([id]),
			observadoresDe([id]),
			noLeidosDe([id], usuario.id),
			db
				.select({
					id: seguimientosEventos.id,
					tipo: seguimientosEventos.tipo,
					canal: seguimientosEventos.canal,
					direccion: seguimientosEventos.direccion,
					contenido: seguimientosEventos.contenido,
					autorUsuarioId: seguimientosEventos.autorUsuarioId,
					autorNombre: seguimientosEventos.autorNombre,
					contacto: seguimientosEventos.contacto,
					fechaHora: seguimientosEventos.fechaHora,
					adjuntos: seguimientosEventos.adjuntos,
					metadatos: seguimientosEventos.metadatos,
					visibleCliente: seguimientosEventos.visibleCliente,
					estadoEntrega: seguimientosEventos.estadoEntrega,
					correoId: seguimientosEventos.correoId,
					tareaId: seguimientosEventos.tareaId,
					promesaId: seguimientosEventos.promesaId,
					ticketId: seguimientosEventos.ticketId,
					editado: seguimientosEventos.editado
				})
				.from(seguimientosEventos)
				.where(eq(seguimientosEventos.seguimientoId, id))
				.orderBy(asc(seguimientosEventos.fechaHora), asc(seguimientosEventos.id)),
			ultimaCotizacion()
		]);

	if (marcarLeido) {
		await db
			.insert(seguimientosLecturas)
			.values({ seguimientoId: id, usuarioId: usuario.id, ultimaLectura: new Date() })
			.onConflictDoUpdate({
				target: [seguimientosLecturas.seguimientoId, seguimientosLecturas.usuarioId],
				set: { ultimaLectura: new Date() }
			});
	}

	const facturaLista = facturas.get(id) ?? [];
	const tareas = pendientes.tareas.get(id) ?? [];
	const promesas = pendientes.promesas.get(id) ?? [];
	const resumen = armarResumen(
		fila,
		facturaLista,
		tareas,
		promesas,
		ticketLista.get(id) ?? [],
		observadores.get(id) ?? [],
		noLeidos.get(id) ?? 0,
		cotizacion
	);

	return {
		...resumen,
		eventos: eventos.map((evento) => ({
			id: evento.id,
			tipo: evento.tipo,
			canal: evento.canal,
			direccion: evento.direccion,
			contenido: evento.contenido,
			autor: evento.autorUsuarioId
				? (pendientes.usuarios.get(evento.autorUsuarioId) ?? null)
				: null,
			autorNombre: evento.autorNombre,
			contacto: evento.contacto,
			fechaHora: iso(evento.fechaHora) ?? '',
			adjuntos: evento.adjuntos ?? [],
			metadatos: (evento.metadatos as Record<string, unknown> | null) ?? null,
			visibleCliente: evento.visibleCliente,
			estadoEntrega: evento.estadoEntrega,
			correoId: evento.correoId,
			tareaId: evento.tareaId,
			promesaId: evento.promesaId,
			ticketId: evento.ticketId,
			editado: evento.editado
		})),
		facturasDetalle: facturaLista,
		tareas,
		promesas,
		ticketsDetalle: ticketLista.get(id) ?? [],
		permisos: calcularPermisos(usuario, fila.areaId)
	};
}

/**
 * Guarda el resultado de onWhatsApp sobre el teléfono del caso.
 * `null` borra la marca (el número no existe o cambió).
 */
export async function marcarWhatsAppVerificado(
	seguimientoId: number,
	fecha: Date | null
): Promise<void> {
	await db
		.update(seguimientos)
		.set({ telefonoWhatsappVerificadoEn: fecha })
		.where(eq(seguimientos.id, seguimientoId));
}

// ------------------------------------------------------------------ Crear

export async function crearSeguimiento(
	usuario: UsuarioSesion,
	datos: DatosSeguimientoNuevo
): Promise<SeguimientoDetalle> {
	const id = await db.transaction(async (tx) => {
		const [servicio] = await tx
			.select({ id: servicios.id, celular: servicios.celular })
			.from(servicios)
			.where(and(eq(servicios.id, datos.servicioId), isNull(servicios.eliminadoEn)))
			.limit(1);
		if (!servicio) {
			throw new ErrorSeguimientos('SERVICIO_INVALIDO', 'El servicio no existe o está dado de baja');
		}

		let responsableId = datos.responsableUsuarioId ?? usuario.id;
		const [responsable] = await tx
			.select({ id: user.id, areaId: user.areaId, activo: user.activo, eliminadoEn: user.eliminadoEn })
			.from(user)
			.where(eq(user.id, responsableId))
			.limit(1);
		if (!responsable || !responsable.activo || responsable.eliminadoEn) {
			throw new ErrorSeguimientos('DATOS_INVALIDOS', 'El responsable no es un usuario activo');
		}

		const areaId = responsable.areaId ?? usuario.areaId;
		if (!areaId) {
			throw new ErrorSeguimientos('DATOS_INVALIDOS', 'El responsable no tiene área asignada');
		}

		const facturas = await tx
			.select({
				id: comprobantesCobranza.id,
				claveOrigen: comprobantesCobranza.claveOrigen,
				saldo: comprobantesCobranza.saldoPendiente
			})
			.from(comprobantesCobranza)
			.where(
				and(
					inArray(comprobantesCobranza.id, datos.facturaIds),
					eq(comprobantesCobranza.servicioId, datos.servicioId),
					eq(comprobantesCobranza.activo, true),
					isNull(comprobantesCobranza.eliminadoEn)
				)
			);
		if (facturas.length !== new Set(datos.facturaIds).size) {
			throw new ErrorSeguimientos(
				'FACTURA_INVALIDA',
				'Alguna factura no pertenece al servicio o ya no está pendiente'
			);
		}

		const codigo = await siguienteCodigo(tx);
		const [creado] = await tx
			.insert(seguimientos)
			.values({
				codigoVisible: codigo,
				servicioId: datos.servicioId,
				areaId,
				titulo: datos.titulo,
				motivo: datos.motivo ?? null,
				estado: datos.estado,
				prioridad: datos.prioridad,
				responsableUsuarioId: responsableId,
				canalPreferido: datos.canalPreferido ?? null,
				// Snapshot: si no se indicó uno, se copia el celular del servicio.
				telefonoWhatsapp:
					datos.telefonoWhatsapp === undefined
						? (servicio.celular ?? null)
						: datos.telefonoWhatsapp,
				creadoPorUsuarioId: usuario.id,
				actualizadoPorUsuarioId: usuario.id
			})
			.returning({ id: seguimientos.id });

		await tx.insert(seguimientosParticipantes).values({
			seguimientoId: creado.id,
			usuarioId: responsableId,
			rol: 'RESPONSABLE',
			incorporadoPor: usuario.id
		});
		for (const observador of datos.observadores) {
			if (observador === responsableId) continue;
			const [existe] = await tx
				.select({ id: user.id })
				.from(user)
				.where(eq(user.id, observador))
				.limit(1);
			if (!existe) continue;
			await tx
				.insert(seguimientosParticipantes)
				.values({
					seguimientoId: creado.id,
					usuarioId: observador,
					rol: 'OBSERVADOR',
					incorporadoPor: usuario.id
				})
				.onConflictDoNothing();
		}

		await tx.insert(seguimientosFacturas).values(
			facturas.map((factura) => ({
				seguimientoId: creado.id,
				comprobanteId: factura.id,
				claveOrigen: factura.claveOrigen,
				saldoAlAsociar: factura.saldo,
				asociadaPor: usuario.id
			}))
		);

		await tx.insert(seguimientosEventos).values({
			seguimientoId: creado.id,
			tipo: 'CREACION',
			canal: 'SISTEMA',
			direccion: 'INTERNA',
			contenido: `Se abrió el seguimiento con ${facturas.length} comprobante${facturas.length === 1 ? '' : 's'}.`,
			autorUsuarioId: usuario.id,
			autorNombre: usuario.nombre,
			metadatos: {
				facturas: facturas.map((factura) => factura.id),
				envioId: datos.envioId ?? null
			}
		});

		if (datos.nota) {
			await tx.insert(seguimientosEventos).values({
				seguimientoId: creado.id,
				tipo: 'NOTA',
				canal: 'NOTA',
				direccion: 'INTERNA',
				contenido: datos.nota,
				autorUsuarioId: usuario.id,
				autorNombre: usuario.nombre
			});
		}

		if (datos.proximaAccion) {
			const [tarea] = await tx
				.insert(seguimientosTareas)
				.values({
					seguimientoId: creado.id,
					tipoAccion: datos.proximaAccion.tipoAccion,
					titulo: datos.proximaAccion.titulo,
					nota: datos.proximaAccion.nota ?? null,
					fechaHora: new Date(datos.proximaAccion.fechaHora),
					responsableUsuarioId: datos.proximaAccion.responsableUsuarioId ?? responsableId,
					recordatorioMinutos: datos.proximaAccion.recordatorioMinutos,
					canalPrevisto: datos.proximaAccion.canalPrevisto ?? null,
					creadoPor: usuario.id
				})
				.returning({ id: seguimientosTareas.id });
			await tx.insert(seguimientosEventos).values({
				seguimientoId: creado.id,
				tipo: 'TAREA',
				canal: 'SISTEMA',
				direccion: 'INTERNA',
				contenido: `Próxima gestión programada: ${datos.proximaAccion.titulo}.`,
				autorUsuarioId: usuario.id,
				autorNombre: usuario.nombre,
				tareaId: tarea.id
			});
		}

		await notificarTx(tx, {
			seguimientoId: creado.id,
			usuarioIds: [responsableId, ...datos.observadores],
			actorUsuarioId: usuario.id,
			tipo: 'SEGUIMIENTO_CREADO',
			titulo: `Nuevo seguimiento ${codigo}`,
			detalle: datos.titulo,
			claveEvento: `creado:${creado.id}`
		});

		return creado.id;
	});

	return obtenerSeguimiento(usuario, id, false);
}

// ------------------------------------------------------------- Actualizar

export async function actualizarSeguimiento(
	usuario: UsuarioSesion,
	id: number,
	datos: DatosSeguimientoActualizar
): Promise<SeguimientoDetalle> {
	await db.transaction(async (tx) => {
		const base = await cargarFilaSeguimiento(id);
		if (!base) throw new ErrorSeguimientos('NO_ENCONTRADO', 'El seguimiento no existe');
		if (!calcularPermisos(usuario, base.areaId).editar) {
			throw new ErrorSeguimientos('SIN_PERMISO', 'No podés modificar este seguimiento');
		}
		if (datos.version !== base.version) {
			throw new ErrorSeguimientos('CONFLICTO_VERSION', 'Otro usuario modificó el caso', {
				version: base.version,
				estado: base.estado,
				prioridad: base.prioridad
			});
		}

		const cerrando = datos.estado && ESTADOS_CERRADOS.includes(datos.estado);
		if (cerrando) {
			if (!datos.motivoCierre || datos.motivoCierre.trim().length < 3) {
				throw new ErrorSeguimientos(
					'ESTADO_INVALIDO',
					'Para cerrar el seguimiento indicá el motivo'
				);
			}
			const [bloqueante] = await tx
				.select({ id: tickets.id, codigo: tickets.codigoVisible })
				.from(seguimientosTickets)
				.innerJoin(tickets, eq(tickets.id, seguimientosTickets.ticketId))
				.where(
					and(
						eq(seguimientosTickets.seguimientoId, id),
						eq(seguimientosTickets.bloqueante, true),
						sql`${tickets.estado} not in ('CERRADO','CANCELADO')`
					)
				)
				.limit(1);
			if (bloqueante) {
				throw new ErrorSeguimientos(
					'TICKETS_BLOQUEANTES',
					`El ticket ${bloqueante.codigo} sigue bloqueando el cierre`,
					{ ticket: bloqueante.codigo }
				);
			}
			const [pendiente] = await tx
				.select({ id: seguimientosTareas.id, titulo: seguimientosTareas.titulo })
				.from(seguimientosTareas)
				.where(
					and(
						eq(seguimientosTareas.seguimientoId, id),
						eq(seguimientosTareas.estado, 'PENDIENTE')
					)
				)
				.limit(1);
			if (pendiente) {
				throw new ErrorSeguimientos(
					'TAREAS_PENDIENTES',
					`Hay gestiones pendientes (${pendiente.titulo}). Completalas o cancelalas antes de cerrar.`,
					{ tarea: pendiente.titulo }
				);
			}
		}

		const cambios: Record<string, unknown> = {
			ultimaActividad: new Date(),
			actualizadoPorUsuarioId: usuario.id,
			version: base.version + 1
		};
		if (datos.titulo !== undefined) cambios.titulo = datos.titulo;
		if (datos.motivo !== undefined) cambios.motivo = datos.motivo;
		if (datos.prioridad !== undefined) cambios.prioridad = datos.prioridad;
		if (datos.canalPreferido !== undefined) cambios.canalPreferido = datos.canalPreferido;
		if (datos.telefonoWhatsapp !== undefined) {
			cambios.telefonoWhatsapp = datos.telefonoWhatsapp;
			// Si cambia el número, la verificación anterior deja de valer.
			if (datos.telefonoWhatsapp !== (base.telefonoWhatsapp ?? null)) {
				cambios.telefonoWhatsappVerificadoEn = null;
			}
		}
		if (datos.estado !== undefined) {
			cambios.estado = datos.estado;
			if (ESTADOS_CERRADOS.includes(datos.estado)) {
				cambios.fechaCierre = new Date();
				cambios.motivoCierre = datos.motivoCierre;
			} else if (ESTADOS_CERRADOS.includes(base.estado as EstadoSeguimiento)) {
				cambios.fechaCierre = null;
				cambios.motivoCierre = null;
			}
		}

		if (datos.responsableUsuarioId && datos.responsableUsuarioId !== base.responsableId) {
			const [nuevo] = await tx
				.select({ id: user.id, areaId: user.areaId, activo: user.activo, eliminadoEn: user.eliminadoEn })
				.from(user)
				.where(eq(user.id, datos.responsableUsuarioId))
				.limit(1);
			if (!nuevo || !nuevo.activo || nuevo.eliminadoEn) {
				throw new ErrorSeguimientos('DATOS_INVALIDOS', 'El responsable no es un usuario activo');
			}
			cambios.responsableUsuarioId = datos.responsableUsuarioId;
			await tx
				.update(seguimientosParticipantes)
				.set({ rol: 'OBSERVADOR' })
				.where(
					and(
						eq(seguimientosParticipantes.seguimientoId, id),
						eq(seguimientosParticipantes.rol, 'RESPONSABLE')
					)
				);
			await tx
				.insert(seguimientosParticipantes)
				.values({
					seguimientoId: id,
					usuarioId: datos.responsableUsuarioId,
					rol: 'RESPONSABLE',
					incorporadoPor: usuario.id
				})
				.onConflictDoUpdate({
					target: [seguimientosParticipantes.seguimientoId, seguimientosParticipantes.usuarioId],
					set: { rol: 'RESPONSABLE', activo: true }
				});
		}

		const [actualizado] = await tx
			.update(seguimientos)
			.set(cambios)
			.where(and(eq(seguimientos.id, id), eq(seguimientos.version, base.version)))
			.returning({ id: seguimientos.id });
		if (!actualizado) {
			throw new ErrorSeguimientos('CONFLICTO_VERSION', 'Otro usuario modificó el caso');
		}

		const eventos: (typeof seguimientosEventos.$inferInsert)[] = [];
		if (datos.estado && datos.estado !== base.estado) {
			eventos.push({
				seguimientoId: id,
				tipo: ESTADOS_CERRADOS.includes(datos.estado) ? 'CIERRE' : 'ESTADO',
				canal: 'SISTEMA',
				direccion: 'INTERNA',
				contenido: ESTADOS_CERRADOS.includes(datos.estado)
					? `Cerró el seguimiento como ${datos.estado}. Motivo: ${datos.motivoCierre}`
					: `Cambió el estado de ${base.estado} a ${datos.estado}.`,
				autorUsuarioId: usuario.id,
				autorNombre: usuario.nombre,
				metadatos: { anterior: base.estado, nuevo: datos.estado }
			});
		}
		if (datos.prioridad && datos.prioridad !== base.prioridad) {
			eventos.push({
				seguimientoId: id,
				tipo: 'PRIORIDAD',
				canal: 'SISTEMA',
				direccion: 'INTERNA',
				contenido: `Cambió la prioridad de ${base.prioridad} a ${datos.prioridad}.`,
				autorUsuarioId: usuario.id,
				autorNombre: usuario.nombre
			});
		}
		if (datos.responsableUsuarioId && datos.responsableUsuarioId !== base.responsableId) {
			eventos.push({
				seguimientoId: id,
				tipo: 'RESPONSABLE',
				canal: 'SISTEMA',
				direccion: 'INTERNA',
				contenido: `Reasignó el seguimiento a ${datos.responsableUsuarioId}.`,
				autorUsuarioId: usuario.id,
				autorNombre: usuario.nombre,
				metadatos: { anterior: base.responsableId, nuevo: datos.responsableUsuarioId }
			});
		}
		if (eventos.length > 0) await tx.insert(seguimientosEventos).values(eventos);

		if (datos.responsableUsuarioId && datos.responsableUsuarioId !== base.responsableId) {
			await notificarTx(tx, {
				seguimientoId: id,
				usuarioIds: [datos.responsableUsuarioId],
				actorUsuarioId: usuario.id,
				tipo: 'SEGUIMIENTO_ASIGNADO',
				titulo: `Te asignaron el seguimiento ${base.codigo}`,
				detalle: base.titulo,
				claveEvento: `asignado:${base.version + 1}`
			});
		}
	});

	return obtenerSeguimiento(usuario, id, false);
}

// ------------------------------------------------------------------ Avance

export async function registrarAvance(
	usuario: UsuarioSesion,
	id: number,
	datos: DatosAvance
): Promise<SeguimientoDetalle> {
	await db.transaction(async (tx) => {
		const base = await cargarFilaSeguimiento(id);
		if (!base) throw new ErrorSeguimientos('NO_ENCONTRADO', 'El seguimiento no existe');
		if (!calcularPermisos(usuario, base.areaId).editar) {
			throw new ErrorSeguimientos('SIN_PERMISO', 'No podés registrar avances en este caso');
		}
		exigirAbierto(base.estado);

		const contacto = datos.canal === 'NOTA' ? false : true;
		const esManual = datos.canal === 'CORREO_MANUAL' || datos.canal === 'WHATSAPP_MANUAL';
		const metadatos: Record<string, unknown> = {};
		if (datos.resultado) metadatos.resultado = datos.resultado;
		if (datos.duracionMinutos !== undefined) metadatos.duracionMinutos = datos.duracionMinutos;
		if (datos.asunto) metadatos.asunto = datos.asunto;
		if (datos.destinatarios) metadatos.destinatarios = datos.destinatarios;

		const [evento] = await tx
			.insert(seguimientosEventos)
			.values({
				seguimientoId: id,
				tipo: tipoDeCanal(datos.canal),
				canal: datos.canal,
				direccion: datos.canal === 'NOTA' ? 'INTERNA' : datos.direccion,
				contenido: datos.contenido,
				autorUsuarioId: usuario.id,
				autorNombre: usuario.nombre,
				contacto:
					datos.contacto ??
					(datos.canal === 'WHATSAPP_MANUAL' ? (base.telefonoWhatsapp ?? null) : null),
				visibleCliente: datos.direccion === 'SALIENTE' || datos.direccion === 'ENTRANTE',
				// Los canales manuales nunca verifican entrega: quedan registrados.
				estadoEntrega:
					datos.estadoEntrega ?? (esManual || datos.canal === 'CORREO' ? 'REGISTRADO' : null),
				metadatos: Object.keys(metadatos).length > 0 ? metadatos : null
			})
			.returning({ id: seguimientosEventos.id });

		const cambios: Record<string, unknown> = {
			ultimaActividad: new Date(),
			actualizadoPorUsuarioId: usuario.id,
			version: base.version + 1
		};
		if (contacto) {
			cambios.ultimoContactoEn = new Date();
			cambios.ultimoCanal = datos.canal;
		}
		// Un avance saliente reabre un caso pausado o en espera.
		if (
			datos.direccion === 'SALIENTE' &&
			['ESPERANDO_CLIENTE', 'PAUSADO'].includes(base.estado)
		) {
			cambios.estado = 'EN_SEGUIMIENTO';
		}
		await tx.update(seguimientos).set(cambios).where(eq(seguimientos.id, id));

		if (datos.programarProxima) {
			const [tarea] = await tx
				.insert(seguimientosTareas)
				.values({
					seguimientoId: id,
					tipoAccion: datos.programarProxima.tipoAccion,
					titulo: datos.programarProxima.titulo,
					nota: datos.programarProxima.nota ?? null,
					fechaHora: new Date(datos.programarProxima.fechaHora),
					responsableUsuarioId: datos.programarProxima.responsableUsuarioId ?? usuario.id,
					recordatorioMinutos: datos.programarProxima.recordatorioMinutos,
					canalPrevisto: datos.programarProxima.canalPrevisto ?? null,
					creadoPor: usuario.id
				})
				.returning({ id: seguimientosTareas.id });
			await tx.insert(seguimientosEventos).values({
				seguimientoId: id,
				tipo: 'TAREA',
				canal: 'SISTEMA',
				direccion: 'INTERNA',
				contenido: `Programó la próxima gestión: ${datos.programarProxima.titulo}.`,
				autorUsuarioId: usuario.id,
				autorNombre: usuario.nombre,
				tareaId: tarea.id
			});
		}

		await notificarTx(tx, {
			seguimientoId: id,
			usuarioIds: [base.responsableId],
			actorUsuarioId: usuario.id,
			tipo: `AVANCE_${etiquetaCanal(datos.canal).toUpperCase().replace(/\s/g, '_')}`,
			titulo: `Nueva gestión en ${base.codigo}`,
			detalle: etiquetaCanal(datos.canal),
			claveEvento: `evento:${evento.id}`
		});
	});

	return obtenerSeguimiento(usuario, id, false);
}

// ------------------------------------------------------------------ Tareas

export async function crearTarea(
	usuario: UsuarioSesion,
	id: number,
	datos: DatosTareaNueva
): Promise<SeguimientoDetalle> {
	await db.transaction(async (tx) => {
		const base = await cargarFilaSeguimiento(id);
		if (!base) throw new ErrorSeguimientos('NO_ENCONTRADO', 'El seguimiento no existe');
		if (!calcularPermisos(usuario, base.areaId).editar) {
			throw new ErrorSeguimientos('SIN_PERMISO', 'No podés programar gestiones en este caso');
		}
		exigirAbierto(base.estado);
		const responsableId = datos.responsableUsuarioId ?? base.responsableId;
		const [tarea] = await tx
			.insert(seguimientosTareas)
			.values({
				seguimientoId: id,
				tipoAccion: datos.tipoAccion,
				titulo: datos.titulo,
				nota: datos.nota ?? null,
				fechaHora: new Date(datos.fechaHora),
				responsableUsuarioId: responsableId,
				recordatorioMinutos: datos.recordatorioMinutos,
				canalPrevisto: datos.canalPrevisto ?? null,
				creadoPor: usuario.id
			})
			.returning({ id: seguimientosTareas.id });

		await tx.insert(seguimientosEventos).values({
			seguimientoId: id,
			tipo: 'TAREA',
			canal: 'SISTEMA',
			direccion: 'INTERNA',
			contenido: `Programó la próxima gestión: ${datos.titulo}.`,
			autorUsuarioId: usuario.id,
			autorNombre: usuario.nombre,
			tareaId: tarea.id
		});
		await tx
			.update(seguimientos)
			.set({ ultimaActividad: new Date(), version: base.version + 1 })
			.where(eq(seguimientos.id, id));

		await notificarTx(tx, {
			seguimientoId: id,
			usuarioIds: [responsableId],
			actorUsuarioId: usuario.id,
			tipo: 'TAREA_PROGRAMADA',
			titulo: `Próxima gestión en ${base.codigo}`,
			detalle: datos.titulo,
			claveEvento: `tarea:${tarea.id}`
		});
	});

	return obtenerSeguimiento(usuario, id, false);
}

export async function actualizarTarea(
	usuario: UsuarioSesion,
	id: number,
	tareaId: number,
	datos: DatosTareaActualizar
): Promise<SeguimientoDetalle> {
	await db.transaction(async (tx) => {
		const base = await cargarFilaSeguimiento(id);
		if (!base) throw new ErrorSeguimientos('NO_ENCONTRADO', 'El seguimiento no existe');
		if (!calcularPermisos(usuario, base.areaId).editar) {
			throw new ErrorSeguimientos('SIN_PERMISO', 'No podés modificar gestiones en este caso');
		}
		exigirAbierto(base.estado);
		const [tarea] = await tx
			.select()
			.from(seguimientosTareas)
			.where(
				and(eq(seguimientosTareas.id, tareaId), eq(seguimientosTareas.seguimientoId, id))
			)
			.limit(1);
		if (!tarea) throw new ErrorSeguimientos('NO_ENCONTRADO', 'La gestión no existe');
		if (datos.version !== tarea.version) {
			throw new ErrorSeguimientos('CONFLICTO_VERSION', 'Otro usuario modificó la gestión', {
				version: tarea.version,
				estado: tarea.estado
			});
		}
		if (tarea.estado !== 'PENDIENTE') {
			throw new ErrorSeguimientos('ESTADO_INVALIDO', 'La gestión ya no está pendiente');
		}

		if (datos.accion === 'COMPLETAR') {
			await tx
				.update(seguimientosTareas)
				.set({
					estado: 'COMPLETADA',
					resultado: datos.resultado ?? null,
					fechaCompletada: new Date(),
					completadaPor: usuario.id,
					version: tarea.version + 1
				})
				.where(eq(seguimientosTareas.id, tareaId));
			await tx.insert(seguimientosEventos).values({
				seguimientoId: id,
				tipo: 'TAREA',
				canal: 'SISTEMA',
				direccion: 'INTERNA',
				contenido: `Completó la gestión "${tarea.titulo}".${datos.resultado ? ` Resultado: ${datos.resultado}` : ''}`,
				autorUsuarioId: usuario.id,
				autorNombre: usuario.nombre,
				tareaId
			});
		} else if (datos.accion === 'REPROGRAMAR' && datos.fechaHora) {
			await tx
				.update(seguimientosTareas)
				.set({ estado: 'REPROGRAMADA', version: tarea.version + 1 })
				.where(eq(seguimientosTareas.id, tareaId));
			const [nueva] = await tx
				.insert(seguimientosTareas)
				.values({
					seguimientoId: id,
					tipoAccion: tarea.tipoAccion,
					titulo: tarea.titulo,
					nota: tarea.nota,
					fechaHora: new Date(datos.fechaHora),
					responsableUsuarioId: tarea.responsableUsuarioId,
					recordatorioMinutos: tarea.recordatorioMinutos,
					canalPrevisto: tarea.canalPrevisto,
					reprogramadaDeId: tarea.id,
					creadoPor: usuario.id
				})
				.returning({ id: seguimientosTareas.id });
			await tx.insert(seguimientosEventos).values({
				seguimientoId: id,
				tipo: 'TAREA',
				canal: 'SISTEMA',
				direccion: 'INTERNA',
				contenido: `Reprogramó "${tarea.titulo}" para el ${datos.fechaHora.slice(0, 10)}.${datos.motivo ? ` Motivo: ${datos.motivo}` : ''}`,
				autorUsuarioId: usuario.id,
				autorNombre: usuario.nombre,
				tareaId: nueva.id
			});
		} else if (datos.accion === 'CANCELAR') {
			await tx
				.update(seguimientosTareas)
				.set({
					estado: 'CANCELADA',
					motivoCancelacion: datos.motivo ?? null,
					version: tarea.version + 1
				})
				.where(eq(seguimientosTareas.id, tareaId));
			await tx.insert(seguimientosEventos).values({
				seguimientoId: id,
				tipo: 'TAREA',
				canal: 'SISTEMA',
				direccion: 'INTERNA',
				contenido: `Canceló la gestión "${tarea.titulo}". Motivo: ${datos.motivo}`,
				autorUsuarioId: usuario.id,
				autorNombre: usuario.nombre,
				tareaId
			});
		} else if (datos.accion === 'TRANSFERIR' && datos.responsableUsuarioId) {
			await tx
				.update(seguimientosTareas)
				.set({
					responsableUsuarioId: datos.responsableUsuarioId,
					version: tarea.version + 1
				})
				.where(eq(seguimientosTareas.id, tareaId));
			await tx.insert(seguimientosEventos).values({
				seguimientoId: id,
				tipo: 'TAREA',
				canal: 'SISTEMA',
				direccion: 'INTERNA',
				contenido: `Transfirió la gestión "${tarea.titulo}".`,
				autorUsuarioId: usuario.id,
				autorNombre: usuario.nombre,
				tareaId
			});
			await notificarTx(tx, {
				seguimientoId: id,
				usuarioIds: [datos.responsableUsuarioId],
				actorUsuarioId: usuario.id,
				tipo: 'TAREA_ASIGNADA',
				titulo: `Te transfirieron una gestión en ${base.codigo}`,
				detalle: tarea.titulo,
				claveEvento: `tarea-transferida:${tareaId}:${tarea.version + 1}`
			});
		}

		await tx
			.update(seguimientos)
			.set({ ultimaActividad: new Date(), version: base.version + 1 })
			.where(eq(seguimientos.id, id));
	});

	return obtenerSeguimiento(usuario, id, false);
}

// ----------------------------------------------------------------- Promesas

export async function crearPromesa(
	usuario: UsuarioSesion,
	id: number,
	datos: DatosPromesaNueva
): Promise<SeguimientoDetalle> {
	await db.transaction(async (tx) => {
		const base = await cargarFilaSeguimiento(id);
		if (!base) throw new ErrorSeguimientos('NO_ENCONTRADO', 'El seguimiento no existe');
		if (!calcularPermisos(usuario, base.areaId).editar) {
			throw new ErrorSeguimientos('SIN_PERMISO', 'No podés registrar promesas en este caso');
		}
		exigirAbierto(base.estado);

		if (datos.comprobanteIds.length > 0) {
			const activas = await tx
				.select({ comprobanteId: seguimientosFacturas.comprobanteId })
				.from(seguimientosFacturas)
				.where(
					and(
						eq(seguimientosFacturas.seguimientoId, id),
						eq(seguimientosFacturas.activa, true),
						inArray(seguimientosFacturas.comprobanteId, datos.comprobanteIds)
					)
				);
			if (activas.length !== new Set(datos.comprobanteIds).size) {
				throw new ErrorSeguimientos(
					'FACTURA_INVALIDA',
					'Alguna factura de la promesa no pertenece al seguimiento'
				);
			}
		}

		const [promesa] = await tx
			.insert(seguimientosPromesas)
			.values({
				seguimientoId: id,
				fechaPrometida: new Date(datos.fechaPrometida),
				importe: String(datos.importe),
				moneda: datos.moneda,
				comprobanteIds: datos.comprobanteIds,
				medioPago: datos.medioPago ?? null,
				confirmadoPorContacto: datos.confirmadoPorContacto ?? null,
				canal: datos.canal ?? null,
				observaciones: datos.observaciones ?? null,
				creadoPor: usuario.id
			})
			.returning({ id: seguimientosPromesas.id });

		await tx.insert(seguimientosEventos).values({
			seguimientoId: id,
			tipo: 'PROMESA',
			canal: datos.canal ?? 'SISTEMA',
			direccion: 'ENTRANTE',
			contenido: `Promesa de pago por ${datos.moneda} ${Number(datos.importe).toFixed(2)} para el ${datos.fechaPrometida.slice(0, 10)}.`,
			autorUsuarioId: usuario.id,
			autorNombre: usuario.nombre,
			contacto: datos.confirmadoPorContacto ?? null,
			promesaId: promesa.id
		});

		const cambios: Record<string, unknown> = {
			ultimaActividad: new Date(),
			version: base.version + 1
		};
		if (!ESTADOS_CERRADOS.includes(base.estado as EstadoSeguimiento) && base.estado !== 'BLOQUEADO_TICKET') {
			cambios.estado = 'PROMESA_PAGO';
		}
		await tx.update(seguimientos).set(cambios).where(eq(seguimientos.id, id));

		await notificarTx(tx, {
			seguimientoId: id,
			usuarioIds: [base.responsableId],
			actorUsuarioId: usuario.id,
			tipo: 'PROMESA_REGISTRADA',
			titulo: `Promesa de pago en ${base.codigo}`,
			detalle: `${datos.moneda} ${datos.importe}`,
			claveEvento: `promesa:${promesa.id}`
		});
	});

	return obtenerSeguimiento(usuario, id, false);
}

export async function actualizarPromesa(
	usuario: UsuarioSesion,
	id: number,
	promesaId: number,
	datos: DatosPromesaActualizar
): Promise<SeguimientoDetalle> {
	await db.transaction(async (tx) => {
		const base = await cargarFilaSeguimiento(id);
		if (!base) throw new ErrorSeguimientos('NO_ENCONTRADO', 'El seguimiento no existe');
		if (!calcularPermisos(usuario, base.areaId).editar) {
			throw new ErrorSeguimientos('SIN_PERMISO', 'No podés modificar promesas en este caso');
		}
		const [promesa] = await tx
			.select()
			.from(seguimientosPromesas)
			.where(
				and(eq(seguimientosPromesas.id, promesaId), eq(seguimientosPromesas.seguimientoId, id))
			)
			.limit(1);
		if (!promesa) throw new ErrorSeguimientos('NO_ENCONTRADO', 'La promesa no existe');
		if (datos.version !== promesa.version) {
			throw new ErrorSeguimientos('CONFLICTO_VERSION', 'Otro usuario modificó la promesa', {
				version: promesa.version,
				estado: promesa.estado
			});
		}

		await tx
			.update(seguimientosPromesas)
			.set({
				estado: datos.estado,
				resultadoDetalle: datos.detalle ?? null,
				confirmadoPorUsuarioId: usuario.id,
				fechaConfirmacion: new Date(),
				version: promesa.version + 1
			})
			.where(eq(seguimientosPromesas.id, promesaId));

		await tx.insert(seguimientosEventos).values({
			seguimientoId: id,
			tipo: 'PROMESA',
			canal: 'SISTEMA',
			direccion: 'INTERNA',
			contenido: `Marcó la promesa de ${promesa.moneda} ${Number(promesa.importe).toFixed(2)} como ${datos.estado}.${datos.detalle ? ` ${datos.detalle}` : ''}`,
			autorUsuarioId: usuario.id,
			autorNombre: usuario.nombre,
			promesaId
		});

		const cambios: Record<string, unknown> = {
			ultimaActividad: new Date(),
			version: base.version + 1
		};
		if (
			['CUMPLIDA', 'CUMPLIDA_PARCIAL', 'INCUMPLIDA', 'CANCELADA'].includes(datos.estado) &&
			base.estado === 'PROMESA_PAGO'
		) {
			cambios.estado = 'EN_SEGUIMIENTO';
		}
		await tx.update(seguimientos).set(cambios).where(eq(seguimientos.id, id));
	});

	return obtenerSeguimiento(usuario, id, false);
}

// ----------------------------------------------------------------- Facturas

export async function agregarFacturas(
	usuario: UsuarioSesion,
	id: number,
	comprobanteIds: number[]
): Promise<SeguimientoDetalle> {
	await db.transaction(async (tx) => {
		const base = await cargarFilaSeguimiento(id);
		if (!base) throw new ErrorSeguimientos('NO_ENCONTRADO', 'El seguimiento no existe');
		if (!calcularPermisos(usuario, base.areaId).editar) {
			throw new ErrorSeguimientos('SIN_PERMISO', 'No podés modificar las facturas del caso');
		}
		if (ESTADOS_CERRADOS.includes(base.estado as EstadoSeguimiento)) {
			throw new ErrorSeguimientos('ESTADO_INVALIDO', 'El seguimiento está cerrado');
		}
		const facturas = await tx
			.select({
				id: comprobantesCobranza.id,
				claveOrigen: comprobantesCobranza.claveOrigen,
				saldo: comprobantesCobranza.saldoPendiente
			})
			.from(comprobantesCobranza)
			.where(
				and(
					inArray(comprobantesCobranza.id, comprobanteIds),
					eq(comprobantesCobranza.servicioId, base.servicioId),
					eq(comprobantesCobranza.activo, true),
					isNull(comprobantesCobranza.eliminadoEn)
				)
			);
		if (facturas.length !== new Set(comprobanteIds).size) {
			throw new ErrorSeguimientos('FACTURA_INVALIDA', 'Alguna factura no pertenece al servicio');
		}

		const yaActivas = await tx
			.select({ comprobanteId: seguimientosFacturas.comprobanteId })
			.from(seguimientosFacturas)
			.where(
				and(
					eq(seguimientosFacturas.seguimientoId, id),
					eq(seguimientosFacturas.activa, true),
					inArray(seguimientosFacturas.comprobanteId, comprobanteIds)
				)
			);
		const existentes = new Set(yaActivas.map((fila) => fila.comprobanteId));

		for (const factura of facturas) {
			if (existentes.has(factura.id)) continue;
			await tx.insert(seguimientosFacturas).values({
				seguimientoId: id,
				comprobanteId: factura.id,
				claveOrigen: factura.claveOrigen,
				saldoAlAsociar: factura.saldo,
				asociadaPor: usuario.id
			});
		}

		await tx.insert(seguimientosEventos).values({
			seguimientoId: id,
			tipo: 'FACTURA',
			canal: 'SISTEMA',
			direccion: 'INTERNA',
			contenido: `Agregó ${facturas.length - existentes.size} comprobante(s) al seguimiento.`,
			autorUsuarioId: usuario.id,
			autorNombre: usuario.nombre,
			metadatos: { facturas: facturas.map((factura) => factura.id) }
		});

		await tx
			.update(seguimientos)
			.set({ ultimaActividad: new Date(), version: base.version + 1 })
			.where(eq(seguimientos.id, id));
	});

	return obtenerSeguimiento(usuario, id, false);
}

export async function retirarFactura(
	usuario: UsuarioSesion,
	id: number,
	facturaId: number,
	motivo: string
): Promise<SeguimientoDetalle> {
	await db.transaction(async (tx) => {
		const base = await cargarFilaSeguimiento(id);
		if (!base) throw new ErrorSeguimientos('NO_ENCONTRADO', 'El seguimiento no existe');
		if (!calcularPermisos(usuario, base.areaId).editar) {
			throw new ErrorSeguimientos('SIN_PERMISO', 'No podés retirar facturas de este caso');
		}
		const [factura] = await tx
			.select()
			.from(seguimientosFacturas)
			.where(
				and(
					eq(seguimientosFacturas.id, facturaId),
					eq(seguimientosFacturas.seguimientoId, id),
					eq(seguimientosFacturas.activa, true)
				)
			)
			.limit(1);
		if (!factura) throw new ErrorSeguimientos('NO_ENCONTRADO', 'La factura no está activa');
		if (motivo.trim().length < 3) {
			throw new ErrorSeguimientos('DATOS_INVALIDOS', 'El motivo del retiro es obligatorio');
		}

		await tx
			.update(seguimientosFacturas)
			.set({
				activa: false,
				fechaRetiro: new Date(),
				retiradaPor: usuario.id,
				motivoRetiro: motivo
			})
			.where(eq(seguimientosFacturas.id, facturaId));

		await tx.insert(seguimientosEventos).values({
			seguimientoId: id,
			tipo: 'FACTURA',
			canal: 'SISTEMA',
			direccion: 'INTERNA',
			contenido: `Retiró el comprobante ${factura.comprobanteId} del seguimiento. Motivo: ${motivo}`,
			autorUsuarioId: usuario.id,
			autorNombre: usuario.nombre,
			metadatos: { comprobanteId: factura.comprobanteId, motivo }
		});
		await tx
			.update(seguimientos)
			.set({ ultimaActividad: new Date(), version: base.version + 1 })
			.where(eq(seguimientos.id, id));
	});

	return obtenerSeguimiento(usuario, id, false);
}

// ------------------------------------------------------------------ Tickets

export async function crearTicketVinculado(
	usuario: UsuarioSesion,
	id: number,
	datos: DatosTicketSeguimiento
): Promise<{ ticketId: number; codigo: string }> {
	const base = await cargarFilaSeguimiento(id);
	if (!base) throw new ErrorSeguimientos('NO_ENCONTRADO', 'El seguimiento no existe');
	const permisos = calcularPermisos(usuario, base.areaId);
	if (!permisos.editar) {
		throw new ErrorSeguimientos('SIN_PERMISO', 'No podés crear tickets desde este caso');
	}
	if (!permisos.crearTicket) {
		throw new ErrorSeguimientos('SIN_PERMISO', 'No tenés la pantalla de Tickets habilitada');
	}
	exigirAbierto(base.estado);
	if (datos.bloqueante && !(datos.motivoBloqueo ?? '').trim()) {
		throw new ErrorSeguimientos(
			'DATOS_INVALIDOS',
			'Indicá el motivo por el que el ticket bloquea la cobranza'
		);
	}

	// Las facturas del ticket se guardan como comprobantes de la cartera: se
	// valida que existan y pertenezcan al servicio del caso.
	if (datos.facturaIds.length > 0) {
		const facturas = await db
			.select({ id: comprobantesCobranza.id })
			.from(comprobantesCobranza)
			.where(
				and(
					inArray(comprobantesCobranza.id, datos.facturaIds),
					eq(comprobantesCobranza.servicioId, base.servicioId),
					eq(comprobantesCobranza.activo, true),
					isNull(comprobantesCobranza.eliminadoEn)
				)
			);
		if (facturas.length !== new Set(datos.facturaIds).size) {
			throw new ErrorSeguimientos(
				'FACTURA_INVALIDA',
				'Alguna factura del ticket no existe o no pertenece al servicio'
			);
		}
	}

	const ticket = await crearTicket(usuario, {
		tipoOrigen: 'SERVICIO',
		titulo: datos.titulo,
		descripcion: datos.descripcion,
		prioridad: datos.prioridad,
		areaResponsableId: datos.areaResponsableId,
		usuarioAsignadoId: datos.usuarioAsignadoId ?? null,
		servicioId: base.servicioId,
		facturaCobranzaIds: datos.facturaIds,
		referenciaTexto: `${base.codigo} · ${base.titulo}`,
		areasInvolucradas: [],
		usuariosInvolucrados: []
	});

	await db.transaction(async (tx) => {
		await tx.insert(seguimientosTickets).values({
			seguimientoId: id,
			ticketId: ticket.id,
			bloqueante: datos.bloqueante,
			motivoBloqueo: datos.motivoBloqueo ?? null,
			creadoPor: usuario.id
		});

		const estadoCambio: Record<string, unknown> = {
			ultimaActividad: new Date(),
			actualizadoPorUsuarioId: usuario.id
		};
		// El evento de ticket se registra siempre (bloquee o no): es el que el
		// historial usa para mostrar la tarjeta del ticket vinculado.
		await tx.insert(seguimientosEventos).values({
			seguimientoId: id,
			tipo: 'TICKET',
			canal: 'SISTEMA',
			direccion: 'INTERNA',
			contenido: `Vinculó el ticket ${ticket.codigo} al seguimiento.`,
			autorUsuarioId: usuario.id,
			autorNombre: usuario.nombre,
			ticketId: ticket.id,
			metadatos: {
				codigo: ticket.codigo,
				titulo: datos.titulo,
				bloqueante: datos.bloqueante,
				motivoBloqueo: datos.bloqueante ? (datos.motivoBloqueo ?? null) : null
			}
		});
		if (datos.bloqueante) {
			estadoCambio.estado = 'BLOQUEADO_TICKET';
			await tx.insert(seguimientosEventos).values({
				seguimientoId: id,
				tipo: 'ESTADO',
				canal: 'SISTEMA',
				direccion: 'INTERNA',
				contenido: `Bloqueó el seguimiento por el ticket ${ticket.codigo}.`,
				autorUsuarioId: usuario.id,
				autorNombre: usuario.nombre,
				ticketId: ticket.id,
				// Permite restaurar el estado cuando el ticket deje de bloquear.
				metadatos: { anterior: base.estado, nuevo: 'BLOQUEADO_TICKET' }
			});
		}

		// Concurrencia optimista: si otro usuario movió el caso, no se pisa.
		const [actualizado] = await tx
			.update(seguimientos)
			.set({
				...estadoCambio,
				version: sql`version + 1`
			})
			.where(and(eq(seguimientos.id, id), eq(seguimientos.version, base.version)))
			.returning({ id: seguimientos.id });
		if (!actualizado) {
			throw new ErrorSeguimientos('CONFLICTO_VERSION', 'Otro usuario modificó el seguimiento', {
				version: base.version
			});
		}
	});

	// Aviso al responsable y observadores (el creador del ticket ya fue notificado
	// por el módulo de tickets; acá se evita el duplicado).
	const [caso] = await db
		.select({ responsable: seguimientos.responsableUsuarioId, codigo: seguimientos.codigoVisible })
		.from(seguimientos)
		.where(eq(seguimientos.id, id))
		.limit(1);
	if (caso && caso.responsable !== usuario.id) {
		await db
			.insert(seguimientosNotificaciones)
			.values({
				seguimientoId: id,
				usuarioId: caso.responsable,
				tipo: 'TICKET_VINCULADO',
				titulo: `Ticket ${ticket.codigo} vinculado a ${caso.codigo}`,
				detalle: datos.titulo,
				actorUsuarioId: usuario.id,
				claveEvento: `ticket-vinculado:${ticket.id}`
			})
			.onConflictDoNothing();
	}

	return { ticketId: ticket.id, codigo: ticket.codigo };
}

/** Verifica que el ticket esté vinculado al seguimiento. */
async function verificarVinculoTicket(id: number, ticketId: number) {
	const base = await cargarFilaSeguimiento(id);
	if (!base) throw new ErrorSeguimientos('NO_ENCONTRADO', 'El seguimiento no existe');
	const [vinculo] = await db
		.select({ id: seguimientosTickets.id, bloqueante: seguimientosTickets.bloqueante })
		.from(seguimientosTickets)
		.where(
			and(
				eq(seguimientosTickets.seguimientoId, id),
				eq(seguimientosTickets.ticketId, ticketId)
			)
		)
		.limit(1);
	if (!vinculo) throw new ErrorSeguimientos('NO_ENCONTRADO', 'El ticket no está vinculado');
	return vinculo;
}

/**
 * Ficha + conversación del ticket vinculado. El detalle y los permisos los
 * resuelve el repositorio de tickets (participación, estado y menciones).
 */
export async function obtenerTicketVinculado(
	usuario: UsuarioSesion,
	id: number,
	ticketId: number
) {
	const vinculo = await verificarVinculoTicket(id, ticketId);
	// No marca leído: la lectura del ticket se administra desde su pantalla.
	const ticket = await obtenerTicket(usuario, ticketId, false);
	return { ...ticket, bloqueante: vinculo.bloqueante };
}

/** Responde el ticket vinculado sin salir del seguimiento. */
export async function agregarMensajeVinculado(
	usuario: UsuarioSesion,
	id: number,
	ticketId: number,
	datos: DatosMensajeTicket
) {
	await verificarVinculoTicket(id, ticketId);
	return await agregarMensaje(usuario, ticketId, datos);
}

// -------------------------------------------------------------- Catálogos

export async function listarCatalogosSeguimientos(usuario: UsuarioSesion) {
	const [areasFilas, usuariosFilas] = await Promise.all([
		db
			.select({ id: areas.id, nombre: areas.nombre })
			.from(areas)
			.where(and(eq(areas.activo, true), isNull(areas.eliminadoEn)))
			.orderBy(asc(areas.nombre)),
		db
			.select({
				id: user.id,
				nombre: user.name,
				email: user.email,
				areaId: areas.id,
				areaNombre: areas.nombre
			})
			.from(user)
			.leftJoin(areas, eq(areas.id, user.areaId))
			.where(and(eq(user.activo, true), isNull(user.eliminadoEn)))
			.orderBy(asc(user.name))
	]);

	return {
		areas: areasFilas,
		usuarios: usuariosFilas.map((fila) => ({
			id: fila.id,
			nombre: fila.nombre ?? fila.email ?? '',
			email: fila.email ?? '',
			areaId: fila.areaId,
			areaNombre: fila.areaNombre
		})),
		puedeCrearTicket: puede(usuario, 'tickets'),
		areaUsuario: usuario.areaId
	};
}

export async function buscarServiciosSeguimiento(q: string) {
	const texto = q.trim();
	if (texto.length < 2) return [];
	const patron = `%${texto}%`;
	const filas = await db
		.select({
			id: servicios.id,
			nombre: servicios.contactoFacturacion,
			nombreFantasia: servicios.nombreFantasia,
			numeracion: servicios.numeracion,
			celular: servicios.celular
		})
		.from(servicios)
		.where(
			and(
				isNull(servicios.eliminadoEn),
				eq(servicios.habilitado, true),
				or(
					sql`${servicios.contactoFacturacion} ilike ${patron}`,
					sql`coalesce(${servicios.nombreFantasia}, '') ilike ${patron}`,
					sql`coalesce(${servicios.numeracion}, '') ilike ${patron}`
				)
			)
		)
		.orderBy(asc(servicios.contactoFacturacion))
		.limit(20);

	if (filas.length === 0) return [];
	const ids = filas.map((fila) => fila.id);
	const [activos, facturas] = await Promise.all([
		db
			.select({
				servicioId: seguimientos.servicioId,
				id: seguimientos.id,
				codigo: seguimientos.codigoVisible,
				titulo: seguimientos.titulo,
				estado: seguimientos.estado
			})
			.from(seguimientos)
			.where(
				and(
					inArray(seguimientos.servicioId, ids),
					sql`${seguimientos.estado} not in ('CERRADO_PAGADO','CERRADO_ACUERDO','CERRADO_LEGAL','CERRADO_INCOBRABLE')`
				)
			),
		db
			.select({
				servicioId: comprobantesCobranza.servicioId,
				moneda: comprobantesCobranza.moneda,
				saldo: comprobantesCobranza.saldoPendiente
			})
			.from(comprobantesCobranza)
			.where(
				and(
					inArray(comprobantesCobranza.servicioId, ids),
					eq(comprobantesCobranza.activo, true),
					isNull(comprobantesCobranza.eliminadoEn),
					sql`${comprobantesCobranza.periodoId} = (select id from periodos_cobranza order by periodo desc limit 1)`
				)
			)
	]);

	return filas.map((fila) => {
		const propias = facturas.filter((factura) => factura.servicioId === fila.id);
		return {
			id: fila.id,
			nombre: fila.nombre,
			nombreFantasia: fila.nombreFantasia,
			numeracion: fila.numeracion,
			celular: fila.celular,
			deudaUYU: propias
				.filter((factura) => factura.moneda !== 'USD')
				.reduce((total, factura) => total + Number(factura.saldo), 0)
				.toFixed(2),
			deudaUSD: propias
				.filter((factura) => factura.moneda === 'USD')
				.reduce((total, factura) => total + Number(factura.saldo), 0)
				.toFixed(2),
			seguimientosActivos: activos
				.filter((seguimiento) => seguimiento.servicioId === fila.id)
				.map(({ servicioId: _servicioId, ...resto }) => resto)
		};
	});
}

/**
 * Mails activos registrados del servicio. El correo automático del seguimiento
 * los usa como destinatarios por defecto.
 */
export async function emailsDelServicio(servicioId: number) {
	return await db
		.select({
			id: serviciosEmails.id,
			email: serviciosEmails.email,
			uso: serviciosEmails.uso
		})
		.from(serviciosEmails)
		.where(and(eq(serviciosEmails.servicioId, servicioId), eq(serviciosEmails.activo, true)))
		.orderBy(asc(serviciosEmails.email));
}

export async function comprobantesDeServicio(servicioId: number) {
	const filas = await db
		.select({
			id: comprobantesCobranza.id,
			tipoComprobante: comprobantesCobranza.tipoComprobante,
			serie: comprobantesCobranza.serie,
			numero: comprobantesCobranza.numero,
			fechaEmision: comprobantesCobranza.fechaEmision,
			fechaVencimiento: comprobantesCobranza.fechaVencimiento,
			moneda: comprobantesCobranza.moneda,
			importe: comprobantesCobranza.importe,
			saldoPendiente: comprobantesCobranza.saldoPendiente,
			periodo: periodosCobranza.periodo
		})
		.from(comprobantesCobranza)
		.innerJoin(periodosCobranza, eq(periodosCobranza.id, comprobantesCobranza.periodoId))
		.where(
			and(
				eq(comprobantesCobranza.servicioId, servicioId),
				eq(comprobantesCobranza.activo, true),
				isNull(comprobantesCobranza.eliminadoEn),
				sql`${comprobantesCobranza.periodoId} = (select id from periodos_cobranza order by periodo desc limit 1)`
			)
		)
		.orderBy(asc(comprobantesCobranza.fechaVencimiento));

	return filas.map((fila) => ({
		id: fila.id,
		tipoComprobante: fila.tipoComprobante,
		serie: fila.serie,
		numero: fila.numero,
		fechaEmision: fila.fechaEmision,
		fechaVencimiento: fila.fechaVencimiento,
		moneda: fila.moneda,
		importe: fila.importe,
		saldo: fila.saldoPendiente,
		diasAging: diasDesde(fila.fechaEmision),
		vencida: fila.fechaVencimiento ? fila.fechaVencimiento < hoyIso() : false,
		periodo: fila.periodo
	}));
}

// ---------------------------------------------------------------- Correos

export async function listarCorreosSinVincular(
	usuario: UsuarioSesion
): Promise<CorreoSinVincularVista[]> {
	const condicionCuenta =
		usuario.admin || usuario.areaNombre === 'TODOS'
			? undefined
			: or(
					isNull(seguimientosCorreos.cuentaId),
					eq(gmailCuentas.areaId, usuario.areaId ?? -1)
				);
	const filas = await db
		.select({
			id: seguimientosCorreos.id,
			de: seguimientosCorreos.de,
			para: seguimientosCorreos.para,
			asunto: seguimientosCorreos.asunto,
			cuerpo: seguimientosCorreos.cuerpo,
			fechaHora: seguimientosCorreos.fechaHora,
			estadoVinculacion: seguimientosCorreos.estadoVinculacion,
			proveedor: seguimientosCorreos.proveedor,
			servicioId: servicios.id,
			servicioNombre: servicios.contactoFacturacion,
			servicioFantasia: servicios.nombreFantasia,
			servicioNumeracion: servicios.numeracion,
			diasVencimiento: servicios.cantidadDiasVencimiento
		})
		.from(seguimientosCorreos)
		.leftJoin(servicios, eq(servicios.id, seguimientosCorreos.servicioId))
		.leftJoin(gmailCuentas, eq(gmailCuentas.id, seguimientosCorreos.cuentaId))
		.where(
			and(eq(seguimientosCorreos.estadoVinculacion, 'PENDIENTE'), condicionCuenta)
		)
		.orderBy(desc(seguimientosCorreos.fechaHora))
		.limit(100);

	return filas.map((fila) => ({
		id: fila.id,
		de: fila.de,
		para: fila.para,
		asunto: fila.asunto,
		cuerpo: fila.cuerpo,
		fechaHora: iso(fila.fechaHora) ?? '',
		estadoVinculacion: fila.estadoVinculacion,
		proveedor: fila.proveedor,
		servicio: fila.servicioId
			? {
					id: fila.servicioId,
					nombre: fila.servicioNombre ?? '',
					nombreFantasia: fila.servicioFantasia,
					numeracion: fila.servicioNumeracion,
					cliente: fila.servicioFantasia || fila.servicioNombre || '',
					diasVencimiento: fila.diasVencimiento ?? 30
				}
			: null
	}));
}

export async function vincularCorreo(
	usuario: UsuarioSesion,
	correoId: number,
	seguimientoId: number
): Promise<SeguimientoDetalle> {
	const base = await cargarFilaSeguimiento(seguimientoId);
	if (!base) throw new ErrorSeguimientos('NO_ENCONTRADO', 'El seguimiento no existe');
	if (!calcularPermisos(usuario, base.areaId).editar) {
		throw new ErrorSeguimientos('SIN_PERMISO', 'No podés vincular correos a este caso');
	}

	await db.transaction(async (tx) => {
		const [correo] = await tx
			.select({
				id: seguimientosCorreos.id,
				seguimientoId: seguimientosCorreos.seguimientoId,
				cuentaId: seguimientosCorreos.cuentaId,
				direccion: seguimientosCorreos.direccion,
				cuerpo: seguimientosCorreos.cuerpo,
				asunto: seguimientosCorreos.asunto,
				para: seguimientosCorreos.para,
				de: seguimientosCorreos.de,
				areaCuenta: gmailCuentas.areaId
			})
			.from(seguimientosCorreos)
			.leftJoin(gmailCuentas, eq(gmailCuentas.id, seguimientosCorreos.cuentaId))
			.where(eq(seguimientosCorreos.id, correoId))
			.limit(1);
		if (!correo) throw new ErrorSeguimientos('NO_ENCONTRADO', 'El correo no existe');
		if (correo.seguimientoId) {
			throw new ErrorSeguimientos('DATOS_INVALIDOS', 'El correo ya está vinculado');
		}
		// Una casilla Gmail de otra área no se vincula desde acá.
		if (
			correo.areaCuenta !== null &&
			!usuario.admin &&
			usuario.areaNombre !== 'TODOS' &&
			correo.areaCuenta !== usuario.areaId
		) {
			throw new ErrorSeguimientos(
				'SIN_PERMISO',
				'Ese correo pertenece a una casilla de otra área'
			);
		}

		await tx
			.update(seguimientosCorreos)
			.set({
				seguimientoId,
				estadoVinculacion: 'MANUAL',
				vinculadoPor: usuario.id,
				vinculadoEn: new Date()
			})
			.where(eq(seguimientosCorreos.id, correoId));

		await tx.insert(seguimientosEventos).values({
			seguimientoId,
			tipo: 'CORREO',
			canal: 'CORREO',
			direccion: correo.direccion,
			contenido: correo.cuerpo || correo.asunto || 'Correo vinculado manualmente.',
			autorUsuarioId: usuario.id,
			autorNombre: correo.de ?? usuario.nombre,
			contacto: correo.de,
			estadoEntrega: correo.direccion === 'ENTRANTE' ? 'RECIBIDO' : 'REGISTRADO',
			correoId,
			metadatos: {
				asunto: correo.asunto,
				para: correo.para,
				vinculacion: 'MANUAL'
			}
		});

		const cambios: Record<string, unknown> = {
			ultimaActividad: new Date(),
			actualizadoPorUsuarioId: usuario.id
		};
		if (correo.direccion === 'ENTRANTE') {
			cambios.ultimoContactoEn = new Date();
			cambios.ultimoCanal = 'CORREO';
		}
		const [actualizado] = await tx
			.update(seguimientos)
			.set({ ...cambios, version: sql`version + 1` })
			.where(and(eq(seguimientos.id, seguimientoId), eq(seguimientos.version, base.version)))
			.returning({ id: seguimientos.id });
		if (!actualizado) {
			throw new ErrorSeguimientos('CONFLICTO_VERSION', 'Otro usuario modificó el seguimiento', {
				version: base.version
			});
		}
	});

	return obtenerSeguimiento(usuario, seguimientoId, false);
}

// ----------------------------------------------------------- Notificaciones

async function notificarTx(
	tx: Transaccion,
	datos: {
		seguimientoId: number;
		usuarioIds: string[];
		actorUsuarioId: string;
		tipo: string;
		titulo: string;
		detalle?: string;
		claveEvento: string;
	}
) {
	const destinatarios = [...new Set(datos.usuarioIds)].filter(
		(usuarioId) => usuarioId && usuarioId !== datos.actorUsuarioId
	);
	if (destinatarios.length === 0) return;
	await tx
		.insert(seguimientosNotificaciones)
		.values(
			destinatarios.map((usuarioId) => ({
				seguimientoId: datos.seguimientoId,
				usuarioId,
				tipo: datos.tipo,
				titulo: datos.titulo,
				detalle: datos.detalle ?? null,
				actorUsuarioId: datos.actorUsuarioId,
				claveEvento: datos.claveEvento
			}))
		)
		.onConflictDoNothing();
}

export async function listarNotificacionesSeguimientos(usuario: UsuarioSesion) {
	const filas = await db
		.select({
			id: seguimientosNotificaciones.id,
			tipo: seguimientosNotificaciones.tipo,
			titulo: seguimientosNotificaciones.titulo,
			detalle: seguimientosNotificaciones.detalle,
			leidoEn: seguimientosNotificaciones.leidoEn,
			creadoEn: seguimientosNotificaciones.creadoEn,
			seguimientoId: seguimientosNotificaciones.seguimientoId,
			codigo: seguimientos.codigoVisible,
			tituloSeguimiento: seguimientos.titulo
		})
		.from(seguimientosNotificaciones)
		.innerJoin(seguimientos, eq(seguimientos.id, seguimientosNotificaciones.seguimientoId))
		.where(eq(seguimientosNotificaciones.usuarioId, usuario.id))
		.orderBy(desc(seguimientosNotificaciones.creadoEn))
		.limit(50);

	return {
		items: filas.map((fila) => ({
			id: fila.id,
			tipo: fila.tipo,
			titulo: fila.titulo,
			detalle: fila.detalle,
			leido: Boolean(fila.leidoEn),
			creadoEn: iso(fila.creadoEn) ?? '',
			seguimientoId: fila.seguimientoId,
			codigo: fila.codigo,
			tituloSeguimiento: fila.tituloSeguimiento
		})),
		noLeidas: filas.filter((fila) => !fila.leidoEn).length
	};
}

export async function marcarNotificacionesLeidas(usuario: UsuarioSesion): Promise<number> {
	const actualizadas = await db
		.update(seguimientosNotificaciones)
		.set({ leidoEn: new Date() })
		.where(
			and(
				eq(seguimientosNotificaciones.usuarioId, usuario.id),
				isNull(seguimientosNotificaciones.leidoEn)
			)
		)
		.returning({ id: seguimientosNotificaciones.id });
	return actualizadas.length;
}
