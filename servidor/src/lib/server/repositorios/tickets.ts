import { randomUUID } from 'node:crypto';
import { and, asc, desc, eq, exists, ilike, inArray, isNull, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import {
	areas,
	comprobantesCobranza,
	cuentasCorreo,
	db,
	gmailCuentas,
	periodosCobranza,
	servicios,
	seguimientos,
	seguimientosTickets,
	ticketCategorias,
	ticketCorreos,
	ticketCorreoEnvios,
	ticketEventos,
	ticketLecturas,
	ticketMensajes,
	ticketNotificaciones,
	ticketParticipantes,
	tickets,
	user
} from '../base-datos/index.ts';
import type { UsuarioSesion } from '../permisos/reglas.ts';
import { ErrorEnvioCorreo, enviarConCuenta } from './correo.ts';
import { crearEnlacePublico, construirUrlPortal } from './tickets-portal.ts';
import { sincronizarTicketEnSeguimientos } from './tickets-seguimiento.ts';
import { cifrarCredencial, descifrarCredencial } from '../autenticacion/cifrado.ts';
import {
	construirReplyTo,
	enviarMensaje,
	refrescarToken,
	type MensajeAEnviar
} from '../servicios/gmail.ts';
import { limpiarRespuestaCorreo } from '../servicios/gmail-texto.ts';
import type {
	DatosCorreoEntrante,
	DatosCorreoTicket,
	DatosMensajeTicket,
	DatosParticipanteTicket,
	DatosTicketActualizar,
	DatosTicketNuevo,
	EstadoTicket,
	PrioridadTicket,
	TipoOrigenTicket
} from '../validaciones/tickets.ts';

/**
 * Repositorio: tickets.
 *
 * Concentra las reglas de negocio que necesitan base de datos y sesión:
 * visibilidad por participación, transiciones de estado, cierre exclusivo del
 * creador, concurrencia optimista, menciones, notificaciones y correo.
 *
 * El ticket es transversal: no depende de Cobranza. Cuando se vincula a un
 * servicio conserva la referencia aunque el seguimiento se cierre.
 */

export type CodigoErrorTickets =
	| 'NO_ENCONTRADO'
	| 'SIN_PERMISO'
	| 'DATOS_INVALIDOS'
	| 'CONFLICTO_VERSION'
	| 'TRANSICION_INVALIDA'
	| 'RESOLUCION_REQUERIDA'
	| 'MOTIVO_REQUERIDO'
	| 'ESPERA_REQUERIDA'
	| 'SOLO_CREADOR_CIERRA'
	| 'TICKET_CERRADO'
	| 'AREA_INVALIDA'
	| 'USUARIO_INVALIDO'
	| 'CATEGORIA_INVALIDA'
	| 'SERVICIO_INVALIDO'
	| 'PARTICIPANTE_INVALIDO'
	| 'SIN_CUENTA_CORREO'
	| 'CORREO_FALLIDO';

export class ErrorTickets extends Error {
	constructor(
		readonly codigo: CodigoErrorTickets,
		mensaje: string,
		readonly datos?: Record<string, unknown>
	) {
		super(mensaje);
		this.name = 'ErrorTickets';
	}
}

export function estadoHttpTickets(codigo: CodigoErrorTickets): number {
	switch (codigo) {
		case 'NO_ENCONTRADO':
			return 404;
		case 'SIN_PERMISO':
			return 403;
		case 'CONFLICTO_VERSION':
			return 409;
		case 'SIN_CUENTA_CORREO':
			return 409;
		case 'CORREO_FALLIDO':
			return 502;
		default:
			return 400;
	}
}

type Transaccion = Parameters<Parameters<typeof db.transaction>[0]>[0];

export const ETIQUETAS_ESTADO: Record<EstadoTicket, string> = {
	NUEVO: 'Nuevo',
	ABIERTO: 'Abierto',
	EN_PROCESO: 'En proceso',
	ESPERANDO_RESPUESTA: 'Esperando respuesta',
	RESUELTO: 'Resuelto',
	CERRADO: 'Cerrado',
	CANCELADO: 'Cancelado'
};

export const ETIQUETAS_PRIORIDAD: Record<PrioridadTicket, string> = {
	BAJA: 'Baja',
	NORMAL: 'Normal',
	ALTA: 'Alta',
	URGENTE: 'Urgente'
};

const ESTADOS_TERMINALES: EstadoTicket[] = ['CERRADO', 'CANCELADO'];

const TRANSICIONES: Record<EstadoTicket, EstadoTicket[]> = {
	NUEVO: ['ABIERTO', 'EN_PROCESO', 'CANCELADO'],
	ABIERTO: ['EN_PROCESO', 'ESPERANDO_RESPUESTA', 'RESUELTO', 'CANCELADO'],
	EN_PROCESO: ['ESPERANDO_RESPUESTA', 'RESUELTO', 'CANCELADO'],
	ESPERANDO_RESPUESTA: ['EN_PROCESO', 'RESUELTO', 'CANCELADO'],
	RESUELTO: ['CERRADO', 'EN_PROCESO', 'CANCELADO'],
	CERRADO: [],
	CANCELADO: []
};

const ORDEN_ORIGEN: Record<string, number> = {
	RESPONSABLE: 0,
	ASIGNADO: 1,
	CREADOR: 2,
	MENCION: 3
};

const PRIORIDAD_ORIGEN: Record<string, number> = {
	RESPONSABLE: 4,
	ASIGNADO: 3,
	CREADOR: 2,
	MENCION: 1
};

// Alias de tablas para no repetir joins con user/areas.
const asignado = alias(user, 'ticket_asignado');
const creador = alias(user, 'ticket_creador');
const solicitante = alias(areas, 'ticket_area_solicitante');
const autorMensaje = alias(user, 'ticket_autor_mensaje');
const areaAutorMensaje = alias(areas, 'ticket_area_autor');

interface FilaTicketBase {
	id: number;
	codigoVisible: string;
	tipoOrigen: string;
	titulo: string;
	descripcion: string;
	categoriaId: number | null;
	categoriaNombre: string | null;
	estado: string;
	prioridad: string;
	areaResponsableId: number;
	areaResponsableNombre: string;
	usuarioAsignadoId: string | null;
	asignadoNombre: string | null;
	asignadoEmail: string | null;
	areaSolicitanteId: number | null;
	areaSolicitanteNombre: string | null;
	servicioId: number | null;
	servicioNombre: string | null;
	servicioFantasia: string | null;
	servicioNumeracion: string | null;
	periodoCobranzaId: number | null;
	periodo: string | null;
	facturaCobranzaIds: number[];
	referenciaTexto: string | null;
	ticketRelacionadoId: number | null;
	tipoRelacion: string | null;
	fechaCreacion: Date;
	fechaActualizacion: Date;
	fechaLimite: Date | null;
	fechaResolucion: Date | null;
	fechaCierre: Date | null;
	resolucion: string | null;
	motivoCierre: string | null;
	motivoReapertura: string | null;
	validadoEn: Date | null;
	validadoPorUsuarioId: string | null;
	esperaDeAreaId: number | null;
	esperaDeUsuarioId: string | null;
	esperaDetalle: string | null;
	creadoPorUsuarioId: string;
	creadorNombre: string;
	version: number;
}

export interface TicketAreaVista {
	id: number;
	nombre: string;
	protegida?: boolean;
}

export interface TicketUsuarioVista {
	id: string;
	nombre: string;
	email: string;
	areaId: number | null;
	areaNombre: string | null;
}

export interface TicketParticipanteVista {
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

export interface TicketFacturaVista {
	id: number;
	tipoComprobante: string;
	serie: string;
	numero: string;
	moneda: string;
	saldoPendiente: string;
	fechaVencimiento: string | null;
}

export interface TicketResumen {
	id: number;
	codigo: string;
	titulo: string;
	tipoOrigen: TipoOrigenTicket;
	estado: EstadoTicket;
	prioridad: PrioridadTicket;
	areaResponsable: TicketAreaVista;
	areaSolicitante: TicketAreaVista | null;
	usuarioAsignado: (TicketUsuarioVista & { areaNombre: string | null }) | null;
	categoria: { id: number; nombre: string } | null;
	servicio: {
		id: number;
		nombre: string;
		nombreFantasia: string | null;
		numeracion: string | null;
		cliente: string;
	} | null;
	periodo: { id: number; periodo: string } | null;
	/** Caso de cobranza vinculado desde el Centro de seguimiento. */
	seguimiento: { id: number; codigo: string; titulo: string } | null;
	facturas: TicketFacturaVista[];
	creadoPor: { id: string; nombre: string };
	fechaCreacion: string;
	fechaActualizacion: string;
	fechaLimite: string | null;
	version: number;
	nuevasRespuestas: number;
	totalMensajes: number;
	participantes: TicketParticipanteVista[];
}

export interface TicketMensajeVista {
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

export interface TicketEventoVista {
	id: number;
	tipoEvento: string;
	usuarioId: string | null;
	usuarioNombre: string | null;
	fechaHora: string;
	valorAnterior: string | null;
	valorNuevo: string | null;
	detalle: string | null;
}

export interface TicketCorreoVista {
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
	mensajes: TicketMensajeVista[];
	eventos: TicketEventoVista[];
	correos: TicketCorreoVista[];
	permisos: PermisosTicket;
}

interface MapaUsuarios {
	[id: string]: {
		id: string;
		nombre: string;
		email: string;
		areaId: number | null;
		areaNombre: string | null;
		activo: boolean;
	};
}

interface MapaAreas {
	[id: number]: { id: number; nombre: string; activo: boolean; protegida: boolean };
}

function normalizarMencion(valor: string): string {
	return valor
		.normalize('NFD')
		.replace(/\p{Diacritic}/gu, '')
		.toLowerCase()
		.replace(/[^a-z0-9]/g, '');
}

function formatearCodigo(numero: number): string {
	return `TCK-${String(numero).padStart(6, '0')}`;
}

function iso(fecha: Date | null): string | null {
	return fecha ? fecha.toISOString() : null;
}

async function mapaUsuarios(): Promise<MapaUsuarios> {
	const filas = await db
		.select({
			id: user.id,
			nombre: user.name,
			email: user.email,
			areaId: areas.id,
			areaNombre: areas.nombre,
			activo: user.activo,
			eliminadoEn: user.eliminadoEn
		})
		.from(user)
		.leftJoin(areas, eq(areas.id, user.areaId));

	return Object.fromEntries(
		filas.map((fila) => [
			fila.id,
			{
				id: fila.id,
				nombre: fila.nombre,
				email: fila.email,
				areaId: fila.areaId,
				areaNombre: fila.areaNombre,
				activo: fila.activo && !fila.eliminadoEn
			}
		])
	);
}

async function mapaAreas(): Promise<MapaAreas> {
	const filas = await db
		.select({
			id: areas.id,
			nombre: areas.nombre,
			activo: areas.activo,
			protegida: areas.protegida,
			eliminadoEn: areas.eliminadoEn
		})
		.from(areas);

	return Object.fromEntries(
		filas.map((fila) => [
			fila.id,
			{
				id: fila.id,
				nombre: fila.nombre,
				activo: fila.activo && !fila.eliminadoEn,
				protegida: fila.protegida
			}
		])
	);
}

async function cargarFilaTicket(id: number): Promise<FilaTicketBase | null> {
	const filas = await db
		.select({
			id: tickets.id,
			codigoVisible: tickets.codigoVisible,
			tipoOrigen: tickets.tipoOrigen,
			titulo: tickets.titulo,
			descripcion: tickets.descripcion,
			categoriaId: tickets.categoriaId,
			categoriaNombre: ticketCategorias.nombre,
			estado: tickets.estado,
			prioridad: tickets.prioridad,
			areaResponsableId: tickets.areaResponsableId,
			areaResponsableNombre: areas.nombre,
			usuarioAsignadoId: tickets.usuarioAsignadoId,
			asignadoNombre: asignado.name,
			asignadoEmail: asignado.email,
			areaSolicitanteId: tickets.areaSolicitanteId,
			areaSolicitanteNombre: solicitante.nombre,
			servicioId: tickets.servicioId,
			servicioNombre: servicios.contactoFacturacion,
			servicioFantasia: servicios.nombreFantasia,
			servicioNumeracion: servicios.numeracion,
			periodoCobranzaId: tickets.periodoCobranzaId,
			periodo: periodosCobranza.periodo,
			facturaCobranzaIds: tickets.facturaCobranzaIds,
			referenciaTexto: tickets.referenciaTexto,
			ticketRelacionadoId: tickets.ticketRelacionadoId,
			tipoRelacion: tickets.tipoRelacion,
			fechaCreacion: tickets.fechaCreacion,
			fechaActualizacion: tickets.fechaActualizacion,
			fechaLimite: tickets.fechaLimite,
			fechaResolucion: tickets.fechaResolucion,
			fechaCierre: tickets.fechaCierre,
			resolucion: tickets.resolucion,
			motivoCierre: tickets.motivoCierre,
			motivoReapertura: tickets.motivoReapertura,
			validadoEn: tickets.validadoEn,
			validadoPorUsuarioId: tickets.validadoPorUsuarioId,
			esperaDeAreaId: tickets.esperaDeAreaId,
			esperaDeUsuarioId: tickets.esperaDeUsuarioId,
			esperaDetalle: tickets.esperaDetalle,
			creadoPorUsuarioId: tickets.creadoPorUsuarioId,
			creadorNombre: creador.name,
			version: tickets.version
		})
		.from(tickets)
		.innerJoin(areas, eq(areas.id, tickets.areaResponsableId))
		.innerJoin(creador, eq(creador.id, tickets.creadoPorUsuarioId))
		.leftJoin(asignado, eq(asignado.id, tickets.usuarioAsignadoId))
		.leftJoin(solicitante, eq(solicitante.id, tickets.areaSolicitanteId))
		.leftJoin(ticketCategorias, eq(ticketCategorias.id, tickets.categoriaId))
		.leftJoin(servicios, eq(servicios.id, tickets.servicioId))
		.leftJoin(periodosCobranza, eq(periodosCobranza.id, tickets.periodoCobranzaId))
		.where(eq(tickets.id, id))
		.limit(1);

	return (filas[0] as FilaTicketBase | undefined) ?? null;
}

async function participantesDe(ticketIds: number[]): Promise<Record<number, TicketParticipanteVista[]>> {
	if (ticketIds.length === 0) return {};
	const [filas, usuarios, mapaAreasActual] = await Promise.all([
		db
			.select()
			.from(ticketParticipantes)
			.where(inArray(ticketParticipantes.ticketId, ticketIds))
			.orderBy(asc(ticketParticipantes.id)),
		mapaUsuarios(),
		mapaAreas()
	]);

	const resultado: Record<number, TicketParticipanteVista[]> = {};
	for (const fila of filas) {
		const usuario = fila.usuarioId ? usuarios[fila.usuarioId] : null;
		const area = fila.areaId ? mapaAreasActual[fila.areaId] : null;
		const participante: TicketParticipanteVista = {
			id: fila.id,
			tipo: fila.tipo === 'AREA' ? 'AREA' : 'USUARIO',
			areaId: fila.areaId,
			usuarioId: fila.usuarioId,
			nombre: fila.tipo === 'AREA' ? (area?.nombre ?? 'Área eliminada') : (usuario?.nombre ?? 'Usuario eliminado'),
			email: usuario?.email ?? null,
			areaNombre: usuario?.areaNombre ?? null,
			origen: fila.origen,
			activo: fila.activo && (fila.tipo === 'AREA' ? Boolean(area?.activo) : Boolean(usuario?.activo))
		};
		resultado[fila.ticketId] ??= [];
		resultado[fila.ticketId].push(participante);
	}

	for (const lista of Object.values(resultado)) {
		lista.sort(
			(a, b) =>
				(ORDEN_ORIGEN[a.origen] ?? 9) - (ORDEN_ORIGEN[b.origen] ?? 9) ||
				a.nombre.localeCompare(b.nombre)
		);
	}

	return resultado;
}

async function contarMensajes(
	ticketIds: number[],
	usuarioId: string
): Promise<Record<number, { total: number; nuevas: number }>> {
	if (ticketIds.length === 0) return {};
	const filas = await db
		.select({
			ticketId: ticketMensajes.ticketId,
			total: sql<number>`count(*)::int`,
			nuevas: sql<number>`(count(*) filter (where ${ticketMensajes.fechaHora} > coalesce(${ticketLecturas.ultimaLectura}, ${tickets.fechaCreacion}) and ${ticketMensajes.autorUsuarioId} is distinct from ${usuarioId}))::int`
		})
		.from(ticketMensajes)
		.innerJoin(tickets, eq(tickets.id, ticketMensajes.ticketId))
		.leftJoin(
			ticketLecturas,
			and(
				eq(ticketLecturas.ticketId, ticketMensajes.ticketId),
				eq(ticketLecturas.usuarioId, usuarioId)
			)
		)
		.where(inArray(ticketMensajes.ticketId, ticketIds))
		.groupBy(ticketMensajes.ticketId);

	return Object.fromEntries(
		filas.map((fila) => [fila.ticketId, { total: fila.total, nuevas: fila.nuevas }])
	);
}

async function facturasDe(ids: number[]): Promise<TicketFacturaVista[]> {
	if (ids.length === 0) return [];
	const filas = await db
		.select({
			id: comprobantesCobranza.id,
			tipoComprobante: comprobantesCobranza.tipoComprobante,
			serie: comprobantesCobranza.serie,
			numero: comprobantesCobranza.numero,
			moneda: comprobantesCobranza.moneda,
			saldoPendiente: comprobantesCobranza.saldoPendiente,
			fechaVencimiento: comprobantesCobranza.fechaVencimiento
		})
		.from(comprobantesCobranza)
		.where(inArray(comprobantesCobranza.id, ids));
	return filas.map((fila) => ({
		id: fila.id,
		tipoComprobante: fila.tipoComprobante,
		serie: fila.serie,
		numero: fila.numero,
		moneda: fila.moneda,
		saldoPendiente: fila.saldoPendiente,
		fechaVencimiento: fila.fechaVencimiento
	}));
}

async function vinculosDe(ticketIds: number[]): Promise<
	Map<number, { id: number; codigo: string; titulo: string }>
> {
	const mapa = new Map<number, { id: number; codigo: string; titulo: string }>();
	if (ticketIds.length === 0) return mapa;
	const filas = await db
		.select({
			ticketId: seguimientosTickets.ticketId,
			id: seguimientos.id,
			codigo: seguimientos.codigoVisible,
			titulo: seguimientos.titulo
		})
		.from(seguimientosTickets)
		.innerJoin(seguimientos, eq(seguimientos.id, seguimientosTickets.seguimientoId))
		.where(inArray(seguimientosTickets.ticketId, ticketIds))
		.orderBy(asc(seguimientosTickets.id));
	for (const fila of filas) {
		if (!mapa.has(fila.ticketId)) {
			mapa.set(fila.ticketId, { id: fila.id, codigo: fila.codigo, titulo: fila.titulo });
		}
	}
	return mapa;
}

function construirResumen(
	base: FilaTicketBase,
	participantes: TicketParticipanteVista[],
	conteo: { total: number; nuevas: number },
	facturas: TicketFacturaVista[],
	seguimiento: { id: number; codigo: string; titulo: string } | null
): TicketResumen {
	const usuarioAsignado = base.usuarioAsignadoId
		? {
				id: base.usuarioAsignadoId,
				nombre: base.asignadoNombre ?? 'Usuario eliminado',
				email: base.asignadoEmail ?? '',
				areaId: null,
				areaNombre: null
			}
		: null;

	return {
		id: base.id,
		codigo: base.codigoVisible,
		titulo: base.titulo,
		tipoOrigen: base.tipoOrigen as TipoOrigenTicket,
		estado: base.estado as EstadoTicket,
		prioridad: base.prioridad as PrioridadTicket,
		areaResponsable: {
			id: base.areaResponsableId,
			nombre: base.areaResponsableNombre
		},
		areaSolicitante:
			base.areaSolicitanteId && base.areaSolicitanteNombre
				? { id: base.areaSolicitanteId, nombre: base.areaSolicitanteNombre }
				: null,
		usuarioAsignado,
		categoria:
			base.categoriaId && base.categoriaNombre
				? { id: base.categoriaId, nombre: base.categoriaNombre }
				: null,
		servicio:
			base.servicioId && base.servicioNombre
				? {
						id: base.servicioId,
						nombre: base.servicioNombre,
						nombreFantasia: base.servicioFantasia,
						numeracion: base.servicioNumeracion,
						cliente: base.servicioNombre
					}
				: null,
		periodo:
			base.periodoCobranzaId && base.periodo
				? { id: base.periodoCobranzaId, periodo: base.periodo }
				: null,
		seguimiento,
		facturas,
		creadoPor: { id: base.creadoPorUsuarioId, nombre: base.creadorNombre },
		fechaCreacion: base.fechaCreacion.toISOString(),
		fechaActualizacion: base.fechaActualizacion.toISOString(),
		fechaLimite: iso(base.fechaLimite),
		version: base.version,
		nuevasRespuestas: conteo.nuevas,
		totalMensajes: conteo.total,
		participantes
	};
}

function usuarioParticipa(
	usuario: UsuarioSesion,
	base: FilaTicketBase,
	participantes: TicketParticipanteVista[]
): boolean {
	if (usuario.admin) return true;
	if (base.creadoPorUsuarioId === usuario.id) return true;
	if (base.usuarioAsignadoId === usuario.id) return true;
	if (usuario.areaId && base.areaResponsableId === usuario.areaId) return true;
	return participantes.some(
		(participante) =>
			participante.activo &&
			((participante.tipo === 'USUARIO' && participante.usuarioId === usuario.id) ||
				(participante.tipo === 'AREA' &&
					usuario.areaId !== null &&
					participante.areaId === usuario.areaId))
	);
}

function permisosDe(
	usuario: UsuarioSesion,
	base: FilaTicketBase,
	participantes: TicketParticipanteVista[]
): PermisosTicket {
	const ver = usuarioParticipa(usuario, base, participantes);
	const terminal = ESTADOS_TERMINALES.includes(base.estado as EstadoTicket);
	const esCreador = base.creadoPorUsuarioId === usuario.id;
	const esAsignado = base.usuarioAsignadoId === usuario.id;
	const activo = ver && !terminal;

	return {
		ver,
		responder: activo,
		cambiarEstado: activo,
		cambiarPrioridad: activo,
		cambiarArea: activo,
		asignar: activo,
		fechaLimite: activo,
		resolver: activo,
		validar: ver && base.estado === 'RESUELTO',
		cerrar: ver && base.estado === 'RESUELTO' && esCreador,
		cancelar: activo && (esCreador || esAsignado || usuario.admin),
		agregarParticipantes: activo,
		enviarCorreo: activo
	};
}

function condicionAcceso(usuario: UsuarioSesion) {
	if (usuario.admin) return undefined;

	const participa = exists(
		db
			.select({ uno: sql`1` })
			.from(ticketParticipantes)
			.where(
				and(
					eq(ticketParticipantes.ticketId, tickets.id),
					eq(ticketParticipantes.activo, true),
					or(
						eq(ticketParticipantes.usuarioId, usuario.id),
						usuario.areaId
							? and(
									eq(ticketParticipantes.tipo, 'AREA'),
									eq(ticketParticipantes.areaId, usuario.areaId)
								)
							: sql`false`
					)
				)
			)
	);

	return or(
		eq(tickets.creadoPorUsuarioId, usuario.id),
		eq(tickets.usuarioAsignadoId, usuario.id),
		usuario.areaId ? eq(tickets.areaResponsableId, usuario.areaId) : sql`false`,
		participa
	);
}

export async function listarTickets(usuario: UsuarioSesion): Promise<TicketResumen[]> {
	const filas = (await db
		.select({
			id: tickets.id,
			codigoVisible: tickets.codigoVisible,
			tipoOrigen: tickets.tipoOrigen,
			titulo: tickets.titulo,
			descripcion: tickets.descripcion,
			categoriaId: tickets.categoriaId,
			categoriaNombre: ticketCategorias.nombre,
			estado: tickets.estado,
			prioridad: tickets.prioridad,
			areaResponsableId: tickets.areaResponsableId,
			areaResponsableNombre: areas.nombre,
			usuarioAsignadoId: tickets.usuarioAsignadoId,
			asignadoNombre: asignado.name,
			asignadoEmail: asignado.email,
			areaSolicitanteId: tickets.areaSolicitanteId,
			areaSolicitanteNombre: solicitante.nombre,
			servicioId: tickets.servicioId,
			servicioNombre: servicios.contactoFacturacion,
			servicioFantasia: servicios.nombreFantasia,
			servicioNumeracion: servicios.numeracion,
			periodoCobranzaId: tickets.periodoCobranzaId,
			periodo: periodosCobranza.periodo,
			facturaCobranzaIds: tickets.facturaCobranzaIds,
			referenciaTexto: tickets.referenciaTexto,
			ticketRelacionadoId: tickets.ticketRelacionadoId,
			tipoRelacion: tickets.tipoRelacion,
			fechaCreacion: tickets.fechaCreacion,
			fechaActualizacion: tickets.fechaActualizacion,
			fechaLimite: tickets.fechaLimite,
			fechaResolucion: tickets.fechaResolucion,
			fechaCierre: tickets.fechaCierre,
			resolucion: tickets.resolucion,
			motivoCierre: tickets.motivoCierre,
			motivoReapertura: tickets.motivoReapertura,
			validadoEn: tickets.validadoEn,
			validadoPorUsuarioId: tickets.validadoPorUsuarioId,
			esperaDeAreaId: tickets.esperaDeAreaId,
			esperaDeUsuarioId: tickets.esperaDeUsuarioId,
			esperaDetalle: tickets.esperaDetalle,
			creadoPorUsuarioId: tickets.creadoPorUsuarioId,
			creadorNombre: creador.name,
			version: tickets.version
		})
		.from(tickets)
		.innerJoin(areas, eq(areas.id, tickets.areaResponsableId))
		.innerJoin(creador, eq(creador.id, tickets.creadoPorUsuarioId))
		.leftJoin(asignado, eq(asignado.id, tickets.usuarioAsignadoId))
		.leftJoin(solicitante, eq(solicitante.id, tickets.areaSolicitanteId))
		.leftJoin(ticketCategorias, eq(ticketCategorias.id, tickets.categoriaId))
		.leftJoin(servicios, eq(servicios.id, tickets.servicioId))
		.leftJoin(periodosCobranza, eq(periodosCobranza.id, tickets.periodoCobranzaId))
		.where(condicionAcceso(usuario))
		.orderBy(desc(tickets.fechaActualizacion))
		.limit(500)) as FilaTicketBase[];

	const ids = filas.map((fila) => fila.id);
	const [participantes, conteos, vinculos] = await Promise.all([
		participantesDe(ids),
		contarMensajes(ids, usuario.id),
		vinculosDe(ids)
	]);

	return filas.map((fila) =>
		construirResumen(
			fila,
			participantes[fila.id] ?? [],
			conteos[fila.id] ?? { total: 0, nuevas: 0 },
			[],
			vinculos.get(fila.id) ?? null
		)
	);
}

export async function obtenerTicket(
	usuario: UsuarioSesion,
	id: number,
	marcarLeido = true
): Promise<TicketDetalle> {
	const base = await cargarFilaTicket(id);
	if (!base) throw new ErrorTickets('NO_ENCONTRADO', 'El ticket no existe');

	const participantesPorTicket = await participantesDe([id]);
	const participantes = participantesPorTicket[id] ?? [];
	const permisos = permisosDe(usuario, base, participantes);
	if (!permisos.ver) throw new ErrorTickets('SIN_PERMISO', 'No tenés acceso a este ticket');

	const [mensajes, eventos, correos, facturas, relacionado, conteos] = await Promise.all([
		db
			.select({
				id: ticketMensajes.id,
				autorUsuarioId: ticketMensajes.autorUsuarioId,
				autorNombre: ticketMensajes.autorNombre,
				autorEmail: ticketMensajes.autorEmail,
				areaNombre: areaAutorMensaje.nombre,
				tipo: ticketMensajes.tipo,
				contenido: ticketMensajes.contenido,
				fechaHora: ticketMensajes.fechaHora,
				editado: ticketMensajes.editado,
				menciones: ticketMensajes.menciones,
				canal: ticketMensajes.canal,
				visibleCliente: ticketMensajes.visibleCliente,
				correoId: ticketMensajes.correoId,
				metadata: ticketMensajes.metadata,
				usuarioNombre: autorMensaje.name,
				usuarioEmail: autorMensaje.email
			})
			.from(ticketMensajes)
			.leftJoin(autorMensaje, eq(autorMensaje.id, ticketMensajes.autorUsuarioId))
			.leftJoin(areaAutorMensaje, eq(areaAutorMensaje.id, autorMensaje.areaId))
			.where(eq(ticketMensajes.ticketId, id))
			.orderBy(asc(ticketMensajes.fechaHora), asc(ticketMensajes.id)),
		db
			.select()
			.from(ticketEventos)
			.where(eq(ticketEventos.ticketId, id))
			.orderBy(asc(ticketEventos.fechaHora), asc(ticketEventos.id)),
		db
			.select()
			.from(ticketCorreos)
			.where(eq(ticketCorreos.ticketId, id))
			.orderBy(asc(ticketCorreos.fecha), asc(ticketCorreos.id)),
		facturasDe(base.facturaCobranzaIds),
		base.ticketRelacionadoId
			? db
					.select({
						id: tickets.id,
						codigo: tickets.codigoVisible,
						titulo: tickets.titulo
					})
					.from(tickets)
					.where(eq(tickets.id, base.ticketRelacionadoId))
					.limit(1)
			: Promise.resolve([]),
		contarMensajes([id], usuario.id)
	]);

	const resumen = construirResumen(
		base,
		participantes,
		{ total: conteos[id]?.total ?? 0, nuevas: 0 },
		facturas,
		(await vinculosDe([id])).get(id) ?? null
	);

	if (marcarLeido) {
		await db
			.insert(ticketLecturas)
			.values({ ticketId: id, usuarioId: usuario.id, ultimaLectura: new Date() })
			.onConflictDoUpdate({
				target: [ticketLecturas.ticketId, ticketLecturas.usuarioId],
				set: { ultimaLectura: new Date() }
			});
	}

	const validadoPor = base.validadoPorUsuarioId
		? (await db
				.select({ id: user.id, nombre: user.name })
				.from(user)
				.where(eq(user.id, base.validadoPorUsuarioId))
				.limit(1))[0] ?? null
		: null;

	const esperaArea = base.esperaDeAreaId
		? { id: base.esperaDeAreaId, nombre: (await db.select({ nombre: areas.nombre }).from(areas).where(eq(areas.id, base.esperaDeAreaId)).limit(1))[0]?.nombre ?? 'Área' }
		: null;
	const esperaUsuario = base.esperaDeUsuarioId
		? { id: base.esperaDeUsuarioId, nombre: (await db.select({ nombre: user.name }).from(user).where(eq(user.id, base.esperaDeUsuarioId)).limit(1))[0]?.nombre ?? 'Usuario' }
		: null;

	return {
		...resumen,
		descripcion: base.descripcion,
		referenciaTexto: base.referenciaTexto,
		ticketRelacionado: relacionado[0]
			? { id: relacionado[0].id, codigo: relacionado[0].codigo, titulo: relacionado[0].titulo }
			: null,
		tipoRelacion: base.tipoRelacion,
		fechaResolucion: iso(base.fechaResolucion),
		fechaCierre: iso(base.fechaCierre),
		resolucion: base.resolucion,
		motivoCierre: base.motivoCierre,
		motivoReapertura: base.motivoReapertura,
		validadoEn: iso(base.validadoEn),
		validadoPor,
		espera:
			esperaArea || esperaUsuario || base.esperaDetalle
				? { area: esperaArea, usuario: esperaUsuario, detalle: base.esperaDetalle }
				: null,
		mensajes: mensajes.map((fila) => ({
			id: fila.id,
			autorUsuarioId: fila.autorUsuarioId,
			autorNombre: fila.usuarioNombre ?? fila.autorNombre,
			autorEmail: fila.usuarioEmail ?? fila.autorEmail,
			areaNombre: fila.areaNombre,
			tipo: fila.tipo,
			contenido:
				fila.canal === 'CORREO' ? limpiarRespuestaCorreo(fila.contenido) : fila.contenido,
			fechaHora: fila.fechaHora.toISOString(),
			editado: fila.editado,
			menciones: fila.menciones,
			canal: fila.canal,
			visibleCliente: fila.visibleCliente,
			correoId: fila.correoId,
			metadata: (fila.metadata as Record<string, unknown> | null) ?? null
		})),
		eventos: eventos.map((fila) => ({
			id: fila.id,
			tipoEvento: fila.tipoEvento,
			usuarioId: fila.usuarioId,
			usuarioNombre: fila.usuarioNombre,
			fechaHora: fila.fechaHora.toISOString(),
			valorAnterior: fila.valorAnterior,
			valorNuevo: fila.valorNuevo,
			detalle: fila.detalle
		})),
		correos: correos.map((fila) => ({
			id: fila.id,
			direccion: fila.direccion,
			threadId: fila.threadId,
			messageId: fila.messageId,
			inReplyTo: fila.inReplyTo,
			de: fila.de,
			para: fila.para,
			cc: fila.cc,
			asunto: fila.asunto,
			cuerpo: fila.cuerpo,
			fecha: fila.fecha.toISOString(),
			estado: fila.estado
		})),
		permisos
	};
}

// --- Helpers transaccionales ------------------------------------------------

async function siguienteCodigo(tx: Transaccion): Promise<string> {
	const resultado = (await tx.execute(sql`select nextval('ticket_codigo_seq') as numero`)) as unknown as {
		rows?: { numero: string }[];
	};
	const numero = Number(resultado.rows?.[0]?.numero ?? 0);
	if (!numero) throw new Error('No se pudo generar el código del ticket');
	return formatearCodigo(numero);
}

async function validarAreaTx(tx: Transaccion, areaId: number) {
	const [fila] = await tx
		.select({ id: areas.id, nombre: areas.nombre })
		.from(areas)
		.where(and(eq(areas.id, areaId), eq(areas.activo, true), isNull(areas.eliminadoEn)))
		.limit(1);
	if (!fila) throw new ErrorTickets('AREA_INVALIDA', 'El área no existe o está inactiva');
	return fila;
}

async function validarUsuarioTx(tx: Transaccion, usuarioId: string) {
	const [fila] = await tx
		.select({ id: user.id, nombre: user.name, email: user.email })
		.from(user)
		.where(
			and(eq(user.id, usuarioId), eq(user.activo, true), isNull(user.eliminadoEn))
		)
		.limit(1);
	if (!fila) throw new ErrorTickets('USUARIO_INVALIDO', 'El usuario no existe o está inactivo');
	return fila;
}

async function validarCategoriaTx(tx: Transaccion, categoriaId: number) {
	const [fila] = await tx
		.select({ id: ticketCategorias.id, nombre: ticketCategorias.nombre })
		.from(ticketCategorias)
		.where(and(eq(ticketCategorias.id, categoriaId), eq(ticketCategorias.activo, true)))
		.limit(1);
	if (!fila) throw new ErrorTickets('CATEGORIA_INVALIDA', 'La categoría no existe o está inactiva');
	return fila;
}

async function validarServicioTx(tx: Transaccion, servicioId: number) {
	const [fila] = await tx
		.select({
			id: servicios.id,
			nombre: servicios.contactoFacturacion,
			nombreFantasia: servicios.nombreFantasia,
			numeracion: servicios.numeracion
		})
		.from(servicios)
		.where(
			and(
				eq(servicios.id, servicioId),
				eq(servicios.habilitado, true),
				isNull(servicios.eliminadoEn)
			)
		)
		.limit(1);
	if (!fila) throw new ErrorTickets('SERVICIO_INVALIDO', 'El servicio no existe o está inhabilitado');
	return fila;
}

async function validarPeriodoTx(tx: Transaccion, periodoId: number) {
	const [fila] = await tx
		.select({ id: periodosCobranza.id, periodo: periodosCobranza.periodo })
		.from(periodosCobranza)
		.where(eq(periodosCobranza.id, periodoId))
		.limit(1);
	if (!fila) throw new ErrorTickets('SERVICIO_INVALIDO', 'El seguimiento de cobranza no existe');
	return fila;
}

async function agregarParticipanteTx(
	tx: Transaccion,
	ticketId: number,
	tipo: 'AREA' | 'USUARIO',
	valorId: number | string,
	origen: 'RESPONSABLE' | 'ASIGNADO' | 'CREADOR' | 'MENCION',
	actorId: string
): Promise<void> {
	const filtro =
		tipo === 'AREA'
			? eq(ticketParticipantes.areaId, valorId as number)
			: eq(ticketParticipantes.usuarioId, valorId as string);

	const [existente] = await tx
		.select()
		.from(ticketParticipantes)
		.where(and(eq(ticketParticipantes.ticketId, ticketId), filtro))
		.limit(1);

	if (existente) {
		const origenFinal =
			(PRIORIDAD_ORIGEN[origen] ?? 0) >= (PRIORIDAD_ORIGEN[existente.origen] ?? 0)
				? origen
				: existente.origen;
		await tx
			.update(ticketParticipantes)
			.set({ activo: true, origen: origenFinal })
			.where(eq(ticketParticipantes.id, existente.id));
		return;
	}

	await tx.insert(ticketParticipantes).values({
		ticketId,
		tipo,
		areaId: tipo === 'AREA' ? (valorId as number) : null,
		usuarioId: tipo === 'USUARIO' ? (valorId as string) : null,
		origen,
		incorporadoPor: actorId
	});
}

interface MencionesResueltas {
	tokens: string[];
	areas: number[];
	usuarios: string[];
}

async function resolverMencionesTx(tx: Transaccion, texto: string): Promise<MencionesResueltas> {
	const tokensDetectados = [...texto.matchAll(/@([\p{L}\p{N}_]+)/gu)].map((match) => match[1]);
	if (tokensDetectados.length === 0) return { tokens: [], areas: [], usuarios: [] };

	const [areasActivas, usuariosActivos] = await Promise.all([
		tx
			.select({ id: areas.id, nombre: areas.nombre })
			.from(areas)
			.where(and(eq(areas.activo, true), isNull(areas.eliminadoEn))),
		tx
			.select({ id: user.id, nombre: user.name, email: user.email })
			.from(user)
			.where(and(eq(user.activo, true), isNull(user.eliminadoEn)))
	]);

	const areasPorNombre = new Map(areasActivas.map((area) => [normalizarMencion(area.nombre), area]));
	const usuariosPorNombre = new Map<string, { id: string; nombre: string; email: string }>();
	for (const usuario of usuariosActivos) {
		usuariosPorNombre.set(normalizarMencion(usuario.nombre), usuario);
		usuariosPorNombre.set(normalizarMencion(usuario.email.split('@')[0]), usuario);
	}

	const tokens = new Set<string>();
	const areasEncontradas = new Set<number>();
	const usuariosEncontrados = new Set<string>();

	for (const token of tokensDetectados) {
		const normalizado = normalizarMencion(token);
		const area = areasPorNombre.get(normalizado);
		if (area) {
			areasEncontradas.add(area.id);
			tokens.add(`@${area.nombre}`);
			continue;
		}
		const usuario = usuariosPorNombre.get(normalizado);
		if (usuario) {
			usuariosEncontrados.add(usuario.id);
			tokens.add(`@${usuario.nombre.replace(/\s+/g, '')}`);
		}
	}

	return {
		tokens: [...tokens],
		areas: [...areasEncontradas],
		usuarios: [...usuariosEncontrados]
	};
}

async function idsParticipantesTx(tx: Transaccion, ticketId: number): Promise<string[]> {
	const [ticket] = await tx
		.select({
			id: tickets.id,
			areaResponsableId: tickets.areaResponsableId,
			usuarioAsignadoId: tickets.usuarioAsignadoId,
			creadoPorUsuarioId: tickets.creadoPorUsuarioId
		})
		.from(tickets)
		.where(eq(tickets.id, ticketId))
		.limit(1);
	if (!ticket) return [];

	const participantes = await tx
		.select()
		.from(ticketParticipantes)
		.where(and(eq(ticketParticipantes.ticketId, ticketId), eq(ticketParticipantes.activo, true)));

	const areaIds = new Set<number>([ticket.areaResponsableId]);
	const usuarioIds = new Set<string>([ticket.creadoPorUsuarioId]);
	if (ticket.usuarioAsignadoId) usuarioIds.add(ticket.usuarioAsignadoId);

	for (const participante of participantes) {
		if (participante.tipo === 'AREA' && participante.areaId) areaIds.add(participante.areaId);
		if (participante.tipo === 'USUARIO' && participante.usuarioId) usuarioIds.add(participante.usuarioId);
	}

	const condiciones = [];
	if (usuarioIds.size > 0) condiciones.push(inArray(user.id, [...usuarioIds]));
	if (areaIds.size > 0) condiciones.push(inArray(user.areaId, [...areaIds]));

	const filas = await tx
		.select({ id: user.id })
		.from(user)
		.where(and(eq(user.activo, true), isNull(user.eliminadoEn), or(...condiciones)));

	return filas.map((fila) => fila.id);
}

async function notificarTx(
	tx: Transaccion,
	datos: {
		ticketId: number;
		usuarioIds: Iterable<string>;
		tipo: string;
		titulo: string;
		detalle?: string | null;
		actorUsuarioId: string | null;
		claveEvento: string;
	}
): Promise<void> {
	const ids = [...new Set(datos.usuarioIds)].filter(
		(id) => id && id !== datos.actorUsuarioId
	);
	if (ids.length === 0) return;

	await tx
		.insert(ticketNotificaciones)
		.values(
			ids.map((usuarioId) => ({
				ticketId: datos.ticketId,
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

async function registrarEventoTx(
	tx: Transaccion,
	datos: {
		ticketId: number;
		tipoEvento: string;
		usuario: UsuarioSesion | null;
		valorAnterior?: string | null;
		valorNuevo?: string | null;
		detalle?: string | null;
		metadata?: Record<string, unknown> | null;
	}
): Promise<void> {
	await tx.insert(ticketEventos).values({
		ticketId: datos.ticketId,
		tipoEvento: datos.tipoEvento,
		usuarioId: datos.usuario?.id ?? null,
		usuarioNombre: datos.usuario?.nombre ?? null,
		valorAnterior: datos.valorAnterior ?? null,
		valorNuevo: datos.valorNuevo ?? null,
		detalle: datos.detalle ?? null,
		metadata: datos.metadata ?? null
	});
}

// --- Crear ------------------------------------------------------------------

export async function crearTicket(
	usuario: UsuarioSesion,
	datos: DatosTicketNuevo
): Promise<TicketDetalle> {
	const ticketId = await db.transaction(async (tx) => {
		const area = await validarAreaTx(tx, datos.areaResponsableId);
		const asignadoFila = datos.usuarioAsignadoId
			? await validarUsuarioTx(tx, datos.usuarioAsignadoId)
			: null;
		if (datos.categoriaId) await validarCategoriaTx(tx, datos.categoriaId);
		const servicioFila = datos.servicioId
			? await validarServicioTx(tx, datos.servicioId)
			: null;
		if (datos.periodoCobranzaId) await validarPeriodoTx(tx, datos.periodoCobranzaId);
		if (datos.ticketRelacionadoId) {
			const [relacionado] = await tx
				.select({ id: tickets.id })
				.from(tickets)
				.where(eq(tickets.id, datos.ticketRelacionadoId))
				.limit(1);
			if (!relacionado) {
				throw new ErrorTickets('NO_ENCONTRADO', 'El ticket relacionado no existe');
			}
		}

		const codigoVisible = await siguienteCodigo(tx);
		const [creado] = await tx
			.insert(tickets)
			.values({
				codigoVisible,
				tipoOrigen: datos.tipoOrigen,
				titulo: datos.titulo,
				descripcion: datos.descripcion,
				categoriaId: datos.categoriaId ?? null,
				prioridad: datos.prioridad,
				areaResponsableId: area.id,
				usuarioAsignadoId: asignadoFila?.id ?? null,
				areaSolicitanteId: datos.areaSolicitanteId ?? null,
				servicioId: datos.servicioId ?? null,
				periodoCobranzaId: datos.periodoCobranzaId ?? null,
				facturaCobranzaIds: datos.facturaCobranzaIds,
				referenciaTexto: datos.referenciaTexto ?? null,
				ticketRelacionadoId: datos.ticketRelacionadoId ?? null,
				tipoRelacion: datos.tipoRelacion ?? null,
				fechaLimite: datos.fechaLimite ? new Date(datos.fechaLimite) : null,
				creadoPorUsuarioId: usuario.id
			})
			.returning({ id: tickets.id });

		await agregarParticipanteTx(tx, creado.id, 'USUARIO', usuario.id, 'CREADOR', usuario.id);
		await agregarParticipanteTx(tx, creado.id, 'AREA', area.id, 'RESPONSABLE', usuario.id);
		if (asignadoFila) {
			await agregarParticipanteTx(tx, creado.id, 'USUARIO', asignadoFila.id, 'ASIGNADO', usuario.id);
		}

		for (const areaId of datos.areasInvolucradas) {
			await validarAreaTx(tx, areaId);
			await agregarParticipanteTx(tx, creado.id, 'AREA', areaId, 'MENCION', usuario.id);
		}
		for (const usuarioId of datos.usuariosInvolucrados) {
			await validarUsuarioTx(tx, usuarioId);
			await agregarParticipanteTx(tx, creado.id, 'USUARIO', usuarioId, 'MENCION', usuario.id);
		}

		const menciones = await resolverMencionesTx(tx, datos.descripcion);
		for (const areaId of menciones.areas) {
			await agregarParticipanteTx(tx, creado.id, 'AREA', areaId, 'MENCION', usuario.id);
		}
		for (const usuarioId of menciones.usuarios) {
			await agregarParticipanteTx(tx, creado.id, 'USUARIO', usuarioId, 'MENCION', usuario.id);
		}

		await tx.insert(ticketMensajes).values({
			ticketId: creado.id,
			autorUsuarioId: usuario.id,
			tipo: 'COMENTARIO',
			contenido: datos.descripcion,
			menciones: menciones.tokens
		});

		await registrarEventoTx(tx, {
			ticketId: creado.id,
			tipoEvento: 'CREACION',
			usuario,
			valorNuevo: 'NUEVO',
			detalle:
				datos.tipoOrigen === 'SERVICIO'
					? `Ticket vinculado al servicio ${servicioFila?.nombre ?? datos.servicioId}`
					: 'Ticket interno' +
						(datos.referenciaTexto ? ` · ${datos.referenciaTexto}` : '')
		});

		await tx.insert(ticketLecturas).values({
			ticketId: creado.id,
			usuarioId: usuario.id,
			ultimaLectura: new Date()
		});

		const destinatarios = await idsParticipantesTx(tx, creado.id);
		await notificarTx(tx, {
			ticketId: creado.id,
			usuarioIds: destinatarios,
			tipo: 'TICKET_CREADO',
			titulo: `Nuevo ticket ${codigoVisible}`,
			detalle: `${datos.titulo} · ${area.nombre}`,
			actorUsuarioId: usuario.id,
			claveEvento: `creado:${creado.id}`
		});

		return creado.id;
	});

	return obtenerTicket(usuario, ticketId, false);
}

// --- Actualizar -------------------------------------------------------------

export async function actualizarTicket(
	usuario: UsuarioSesion,
	id: number,
	datos: DatosTicketActualizar
): Promise<TicketDetalle> {
	const base = await cargarFilaTicket(id);
	if (!base) throw new ErrorTickets('NO_ENCONTRADO', 'El ticket no existe');

	const participantesPorTicket = await participantesDe([id]);
	const participantes = participantesPorTicket[id] ?? [];
	const permisos = permisosDe(usuario, base, participantes);
	if (!permisos.ver) throw new ErrorTickets('SIN_PERMISO', 'No tenés acceso a este ticket');
	if (ESTADOS_TERMINALES.includes(base.estado as EstadoTicket)) {
		throw new ErrorTickets('TICKET_CERRADO', 'El ticket está cerrado y no admite cambios');
	}
	if (datos.version !== base.version) {
		throw new ErrorTickets('CONFLICTO_VERSION', 'Otro usuario actualizó el ticket', {
			version: base.version,
			estado: base.estado,
			prioridad: base.prioridad,
			areaResponsableId: base.areaResponsableId,
			usuarioAsignadoId: base.usuarioAsignadoId
		});
	}

	const eventos: {
		tipoEvento: string;
		valorAnterior?: string | null;
		valorNuevo?: string | null;
		detalle?: string | null;
	}[] = [];

	await db.transaction(async (tx) => {
		const cambios: Partial<typeof tickets.$inferInsert> = {
			version: base.version + 1,
			fechaActualizacion: new Date()
		};
		let estadoNuevo = base.estado as EstadoTicket;
		let nuevaArea = base.areaResponsableId;
		let nuevoAsignado = base.usuarioAsignadoId;

		if (datos.titulo !== undefined && datos.titulo !== base.titulo) {
			cambios.titulo = datos.titulo;
			eventos.push({
				tipoEvento: 'TITULO',
				valorAnterior: base.titulo,
				valorNuevo: datos.titulo
			});
		}

		if (datos.prioridad !== undefined && datos.prioridad !== base.prioridad) {
			if (!permisos.cambiarPrioridad) {
				throw new ErrorTickets('SIN_PERMISO', 'No podés cambiar la prioridad');
			}
			cambios.prioridad = datos.prioridad;
			eventos.push({
				tipoEvento: 'PRIORIDAD',
				valorAnterior: base.prioridad,
				valorNuevo: datos.prioridad
			});
		}

		if (datos.areaResponsableId !== undefined && datos.areaResponsableId !== base.areaResponsableId) {
			if (!permisos.cambiarArea) {
				throw new ErrorTickets('SIN_PERMISO', 'No podés cambiar el área responsable');
			}
			const area = await validarAreaTx(tx, datos.areaResponsableId);
			nuevaArea = area.id;
			cambios.areaResponsableId = area.id;
			eventos.push({
				tipoEvento: 'AREA_RESPONSABLE',
				valorAnterior: base.areaResponsableNombre,
				valorNuevo: area.nombre
			});
		}

		if (
			datos.usuarioAsignadoId !== undefined &&
			datos.usuarioAsignadoId !== base.usuarioAsignadoId
		) {
			if (!permisos.asignar) {
				throw new ErrorTickets('SIN_PERMISO', 'No podés asignar el ticket');
			}
			const asignadoFila = datos.usuarioAsignadoId
				? await validarUsuarioTx(tx, datos.usuarioAsignadoId)
				: null;
			nuevoAsignado = asignadoFila?.id ?? null;
			cambios.usuarioAsignadoId = nuevoAsignado;
			eventos.push({
				tipoEvento: 'ASIGNACION',
				valorAnterior: base.asignadoNombre ?? 'Sin asignar',
				valorNuevo: asignadoFila?.nombre ?? 'Sin asignar'
			});
		}

		if (datos.fechaLimite !== undefined) {
			const anterior = base.fechaLimite ? base.fechaLimite.toISOString() : null;
			const nuevo = datos.fechaLimite ? new Date(datos.fechaLimite).toISOString() : null;
			if (anterior !== nuevo) {
				if (!permisos.fechaLimite) {
					throw new ErrorTickets('SIN_PERMISO', 'No podés cambiar la fecha límite');
				}
				if (base.fechaLimite && base.fechaLimite.getTime() < Date.now() && !datos.motivoFechaLimite) {
					throw new ErrorTickets(
						'MOTIVO_REQUERIDO',
						'Para modificar una fecha límite vencida indicá el motivo'
					);
				}
				cambios.fechaLimite = nuevo ? new Date(nuevo) : null;
				eventos.push({
					tipoEvento: 'FECHA_LIMITE',
					valorAnterior: anterior,
					valorNuevo: nuevo,
					detalle: datos.motivoFechaLimite ?? null
				});
			}
		}

		if (
			datos.ticketRelacionadoId !== undefined ||
			datos.tipoRelacion !== undefined
		) {
			const relacionadoId =
				datos.ticketRelacionadoId !== undefined
					? datos.ticketRelacionadoId
					: base.ticketRelacionadoId;
			if (relacionadoId === id) {
				throw new ErrorTickets('PARTICIPANTE_INVALIDO', 'Un ticket no puede relacionarse consigo mismo');
			}
			if (relacionadoId) {
				const [existe] = await tx
					.select({ id: tickets.id })
					.from(tickets)
					.where(eq(tickets.id, relacionadoId))
					.limit(1);
				if (!existe) throw new ErrorTickets('NO_ENCONTRADO', 'El ticket relacionado no existe');
			}
			cambios.ticketRelacionadoId = relacionadoId ?? null;
			cambios.tipoRelacion = datos.tipoRelacion ?? base.tipoRelacion ?? null;
			eventos.push({
				tipoEvento: 'RELACION',
				valorAnterior: base.ticketRelacionadoId ? String(base.ticketRelacionadoId) : null,
				valorNuevo: relacionadoId ? String(relacionadoId) : null,
				detalle: datos.tipoRelacion ?? base.tipoRelacion ?? null
			});
		}

		if (datos.estado !== undefined && datos.estado !== base.estado) {
			if (!permisos.cambiarEstado) {
				throw new ErrorTickets('SIN_PERMISO', 'No podés cambiar el estado');
			}
			if (!TRANSICIONES[base.estado as EstadoTicket].includes(datos.estado)) {
				throw new ErrorTickets(
					'TRANSICION_INVALIDA',
					`No se puede pasar de ${ETIQUETAS_ESTADO[base.estado as EstadoTicket]} a ${ETIQUETAS_ESTADO[datos.estado]}`
				);
			}
			estadoNuevo = datos.estado;
		}

		if (estadoNuevo !== base.estado) {
			if (estadoNuevo === 'CERRADO') {
				if (base.creadoPorUsuarioId !== usuario.id) {
					throw new ErrorTickets(
						'SOLO_CREADOR_CIERRA',
						'Solo el creador del ticket puede cerrarlo'
					);
				}
				if (!datos.motivoCierre) {
					throw new ErrorTickets('MOTIVO_REQUERIDO', 'Para cerrar indicá un resumen final');
				}
				cambios.fechaCierre = new Date();
				cambios.motivoCierre = datos.motivoCierre;
			}

			if (estadoNuevo === 'CANCELADO') {
				if (!permisos.cancelar) {
					throw new ErrorTickets('SIN_PERMISO', 'No podés cancelar este ticket');
				}
				if (!datos.motivoCierre) {
					throw new ErrorTickets('MOTIVO_REQUERIDO', 'Para cancelar indicá el motivo');
				}
				cambios.fechaCierre = new Date();
				cambios.motivoCierre = datos.motivoCierre;
			}

			if (estadoNuevo === 'RESUELTO') {
				if (!datos.resolucion) {
					throw new ErrorTickets(
						'RESOLUCION_REQUERIDA',
						'Para marcar Resuelto ingresá la resolución'
					);
				}
				cambios.fechaResolucion = new Date();
				cambios.resolucion = datos.resolucion;
			}

			if (estadoNuevo === 'ESPERANDO_RESPUESTA') {
				if (!datos.esperaDeAreaId && !datos.esperaDeUsuarioId) {
					throw new ErrorTickets(
						'ESPERA_REQUERIDA',
						'Indicá de qué área o usuario se espera la respuesta'
					);
				}
				if (!datos.esperaDetalle) {
					throw new ErrorTickets(
						'ESPERA_REQUERIDA',
						'Indicá qué se está esperando'
					);
				}
				cambios.esperaDeAreaId = datos.esperaDeAreaId ?? null;
				cambios.esperaDeUsuarioId = datos.esperaDeUsuarioId ?? null;
				cambios.esperaDetalle = datos.esperaDetalle;
			} else if (base.estado === 'ESPERANDO_RESPUESTA') {
				cambios.esperaDeAreaId = null;
				cambios.esperaDeUsuarioId = null;
				cambios.esperaDetalle = null;
			}

			if (base.estado === 'RESUELTO' && estadoNuevo === 'EN_PROCESO') {
				if (!datos.motivoReapertura) {
					throw new ErrorTickets(
						'MOTIVO_REQUERIDO',
						'Para reabrir un ticket resuelto indicá el motivo'
					);
				}
				cambios.motivoReapertura = datos.motivoReapertura;
			}

			cambios.estado = estadoNuevo;
			eventos.push({
				tipoEvento: 'ESTADO',
				valorAnterior: ETIQUETAS_ESTADO[base.estado as EstadoTicket],
				valorNuevo: ETIQUETAS_ESTADO[estadoNuevo],
				detalle:
					estadoNuevo === 'ESPERANDO_RESPUESTA'
						? datos.esperaDetalle
						: estadoNuevo === 'RESUELTO'
							? datos.resolucion
							: datos.motivoCierre ?? datos.motivoReapertura ?? null
			});
		}

		if (datos.accion === 'VALIDAR') {
			if (!permisos.validar) {
				throw new ErrorTickets('SIN_PERMISO', 'El ticket no está pendiente de validación');
			}
			cambios.validadoEn = new Date();
			cambios.validadoPorUsuarioId = usuario.id;
			eventos.push({
				tipoEvento: 'VALIDACION',
				valorNuevo: 'Validado',
				detalle: 'La solución fue validada por un participante'
			});
		}

		const [actualizado] = await tx
			.update(tickets)
			.set(cambios)
			.where(and(eq(tickets.id, id), eq(tickets.version, base.version)))
			.returning({ id: tickets.id });

		if (!actualizado) {
			throw new ErrorTickets('CONFLICTO_VERSION', 'Otro usuario actualizó el ticket', {
				version: base.version
			});
		}

		if (nuevaArea !== base.areaResponsableId) {
			await tx
				.update(ticketParticipantes)
				.set({ activo: false })
				.where(
					and(
						eq(ticketParticipantes.ticketId, id),
						eq(ticketParticipantes.tipo, 'AREA'),
						eq(ticketParticipantes.areaId, base.areaResponsableId),
						eq(ticketParticipantes.origen, 'RESPONSABLE')
					)
				);
			await agregarParticipanteTx(tx, id, 'AREA', nuevaArea, 'RESPONSABLE', usuario.id);
		}

		if (nuevoAsignado !== base.usuarioAsignadoId) {
			if (base.usuarioAsignadoId && base.usuarioAsignadoId !== base.creadoPorUsuarioId) {
				await tx
					.update(ticketParticipantes)
					.set({ activo: false })
					.where(
						and(
							eq(ticketParticipantes.ticketId, id),
							eq(ticketParticipantes.tipo, 'USUARIO'),
							eq(ticketParticipantes.usuarioId, base.usuarioAsignadoId),
							eq(ticketParticipantes.origen, 'ASIGNADO')
						)
					);
			}
			if (nuevoAsignado) {
				await agregarParticipanteTx(tx, id, 'USUARIO', nuevoAsignado, 'ASIGNADO', usuario.id);
			}
		}

		for (const evento of eventos) {
			await registrarEventoTx(tx, {
				ticketId: id,
				tipoEvento: evento.tipoEvento,
				usuario,
				valorAnterior: evento.valorAnterior ?? null,
				valorNuevo: evento.valorNuevo ?? null,
				detalle: evento.detalle ?? null
			});
		}

		// Una sola notificación por evento y usuario: las específicas van primero
		// y la genérica usa la misma clave, así el índice único descarta duplicados.
		const clave = `cambio:${base.version + 1}`;

		if (nuevoAsignado && nuevoAsignado !== base.usuarioAsignadoId) {
			await notificarTx(tx, {
				ticketId: id,
				usuarioIds: [nuevoAsignado],
				tipo: 'TICKET_ASIGNADO',
				titulo: `Te asignaron ${base.codigoVisible}`,
				detalle: base.titulo,
				actorUsuarioId: usuario.id,
				claveEvento: clave
			});
		}

		if (nuevaArea !== base.areaResponsableId) {
			const usuariosArea = await tx
				.select({ id: user.id })
				.from(user)
				.where(and(eq(user.areaId, nuevaArea), eq(user.activo, true), isNull(user.eliminadoEn)));
			await notificarTx(tx, {
				ticketId: id,
				usuarioIds: usuariosArea.map((fila) => fila.id),
				tipo: 'TICKET_DERIVADO',
				titulo: `Ticket derivado a tu área · ${base.codigoVisible}`,
				detalle: base.titulo,
				actorUsuarioId: usuario.id,
				claveEvento: clave
			});
		}

		if (eventos.length > 0) {
			const destinatarios = await idsParticipantesTx(tx, id);
			const titulo =
				estadoNuevo !== base.estado
					? `${base.codigoVisible} · ${ETIQUETAS_ESTADO[estadoNuevo]}`
					: `${base.codigoVisible} · Ticket actualizado`;
			await notificarTx(tx, {
				ticketId: id,
				usuarioIds: destinatarios,
				tipo: 'TICKET_ACTUALIZADO',
				titulo,
				detalle: base.titulo,
				actorUsuarioId: usuario.id,
				claveEvento: clave
			});
		}
	});

	// Reflejo en los seguimientos vinculados (no rompe el flujo del ticket si falla).
	try {
		const [actual] = await db
			.select({ estado: tickets.estado, usuarioAsignadoId: tickets.usuarioAsignadoId })
			.from(tickets)
			.where(eq(tickets.id, id))
			.limit(1);
		const actor = { id: usuario.id, nombre: usuario.nombre };
		if (actual && actual.estado !== base.estado) {
			await sincronizarTicketEnSeguimientos({
				ticketId: id,
				codigo: base.codigoVisible,
				tipoEvento: 'ESTADO',
				detalle: `cambió el estado a ${ETIQUETAS_ESTADO[actual.estado as EstadoTicket]}`,
				ticketAbierto: !ESTADOS_TERMINALES.includes(actual.estado as EstadoTicket),
				clave: `estado:${base.version + 1}`,
				actor
			});
		}
		if (actual && actual.usuarioAsignadoId !== base.usuarioAsignadoId) {
			await sincronizarTicketEnSeguimientos({
				ticketId: id,
				codigo: base.codigoVisible,
				tipoEvento: 'ASIGNACION',
				detalle: 'reasignó el ticket',
				ticketAbierto: actual ? !ESTADOS_TERMINALES.includes(actual.estado as EstadoTicket) : true,
				clave: `asignacion:${base.version + 1}`,
				actor
			});
		}
		if (datos.resolucion !== undefined || datos.accion === 'VALIDAR') {
			await sincronizarTicketEnSeguimientos({
				ticketId: id,
				codigo: base.codigoVisible,
				tipoEvento: 'RESOLUCION',
				detalle: datos.resolucion
					? `publicó una resolución: ${datos.resolucion.slice(0, 200)}`
					: 'validó la solución',
				ticketAbierto: true,
				clave: `resolucion:${base.version + 1}`,
				actor
			});
		}
	} catch (error) {
		console.error(`[tickets] no se pudo reflejar el cambio en los seguimientos del ticket ${id}:`, error);
	}

	return obtenerTicket(usuario, id, false);
}

// --- Mensajes ---------------------------------------------------------------

export interface ResultadoMensaje {
	ticket: TicketDetalle;
	correo: { messageId: string; threadId: string } | null;
	correoError: string | null;
}

/**
 * Correos registrados de todos los involucrados en el ticket: creador,
 * asignado, área responsable, áreas y usuarios participantes activos.
 * Se excluye el correo de quien responde para no enviarse a sí mismo.
 */
async function emailsInvolucrados(
	base: FilaTicketBase,
	participantes: TicketParticipanteVista[],
	excluirEmail: string
): Promise<string[]> {
	const areaIds = new Set<number>([base.areaResponsableId]);
	const usuarioIds = new Set<string>([base.creadoPorUsuarioId]);
	if (base.usuarioAsignadoId) usuarioIds.add(base.usuarioAsignadoId);

	for (const participante of participantes) {
		if (!participante.activo) continue;
		if (participante.tipo === 'AREA' && participante.areaId) areaIds.add(participante.areaId);
		if (participante.tipo === 'USUARIO' && participante.usuarioId) usuarioIds.add(participante.usuarioId);
	}

	const condiciones = [];
	if (usuarioIds.size > 0) condiciones.push(inArray(user.id, [...usuarioIds]));
	if (areaIds.size > 0) condiciones.push(inArray(user.areaId, [...areaIds]));
	if (condiciones.length === 0) return [];

	const filas = await db
		.select({ email: user.email })
		.from(user)
		.where(and(eq(user.activo, true), isNull(user.eliminadoEn), or(...condiciones)));

	const excluido = excluirEmail.trim().toLowerCase();
	return [
		...new Set(
			filas
				.map((fila) => fila.email?.trim().toLowerCase() ?? '')
				.filter((email) => email.length > 0 && email !== excluido)
		)
	];
}

export async function agregarMensaje(
	usuario: UsuarioSesion,
	id: number,
	datos: DatosMensajeTicket
): Promise<ResultadoMensaje> {
	const base = await cargarFilaTicket(id);
	if (!base) throw new ErrorTickets('NO_ENCONTRADO', 'El ticket no existe');

	const participantesPorTicket = await participantesDe([id]);
	let participantes = participantesPorTicket[id] ?? [];
	const permisos = permisosDe(usuario, base, participantes);
	if (!permisos.ver) throw new ErrorTickets('SIN_PERMISO', 'No tenés acceso a este ticket');
	if (!permisos.responder) {
		throw new ErrorTickets('TICKET_CERRADO', 'El ticket está cerrado y no admite respuestas');
	}

	// Las menciones de esta misma respuesta tienen que contar como involucrados
	// antes de enviar el correo; si no, el mencionado recibe el aviso recién en
	// la respuesta siguiente. Se registran primero y luego se recarga la lista.
	if (datos.enviarCorreo && datos.paraInvolucrados) {
		await db.transaction(async (tx) => {
			const menciones = await resolverMencionesTx(tx, datos.contenido);
			for (const areaId of menciones.areas) {
				await agregarParticipanteTx(tx, id, 'AREA', areaId, 'MENCION', usuario.id);
			}
			for (const usuarioId of menciones.usuarios) {
				await agregarParticipanteTx(tx, id, 'USUARIO', usuarioId, 'MENCION', usuario.id);
			}
		});
		const actualizados = await participantesDe([id]);
		participantes = actualizados[id] ?? participantes;
	}

	let correo: { messageId: string; threadId: string } | null = null;
	let correoError: string | null = null;

	if (datos.enviarCorreo && !datos.soloInterno) {
		const para = datos.paraInvolucrados
			? await emailsInvolucrados(base, participantes, usuario.email)
			: datos.para;
		const cc = datos.paraInvolucrados ? [] : datos.cc;
		if (para.length === 0) {
			correoError = 'El ticket no tiene involucrados con correo registrado.';
		} else {
			try {
				correo = await enviarCorreoBase(usuario, base, participantes, {
					para,
					cc,
					asunto: datos.asunto ?? `[${base.codigoVisible}] ${base.titulo}`,
					cuerpo: datos.contenido,
					cuentaId: datos.cuentaId,
					aliasId: datos.aliasId,
					cuentaGmailId: datos.cuentaGmailId
				});
			} catch (error) {
				correoError =
					error instanceof ErrorTickets
						? error.message
						: error instanceof Error
							? error.message
							: 'No se pudo enviar el correo';
			}
		}
	}

	const mensajeId = await db.transaction(async (tx) => {
		const menciones = await resolverMencionesTx(tx, datos.contenido);
		for (const areaId of menciones.areas) {
			await agregarParticipanteTx(tx, id, 'AREA', areaId, 'MENCION', usuario.id);
		}
		for (const usuarioId of menciones.usuarios) {
			await agregarParticipanteTx(tx, id, 'USUARIO', usuarioId, 'MENCION', usuario.id);
		}

		const [mensaje] = await tx
			.insert(ticketMensajes)
			.values({
				ticketId: id,
				autorUsuarioId: usuario.id,
				tipo: 'COMENTARIO',
				contenido: datos.contenido,
				menciones: menciones.tokens,
				canal: correo ? 'CORREO' : 'APP',
				visibleCliente: !datos.soloInterno,
				metadata: correo
					? {
							asunto: datos.asunto ?? `[${base.codigoVisible}] ${base.titulo}`,
							messageId: correo.messageId,
							threadId: correo.threadId
						}
					: null
			})
			.returning({ id: ticketMensajes.id });

		const estadoAnterior = base.estado as EstadoTicket;
		const nuevoEstado = estadoAnterior === 'NUEVO' ? 'ABIERTO' : estadoAnterior;

		await tx
			.update(tickets)
			.set({
				estado: nuevoEstado,
				fechaActualizacion: new Date(),
				version: base.version + 1
			})
			.where(eq(tickets.id, id));

		await registrarEventoTx(tx, {
			ticketId: id,
			tipoEvento: 'RESPUESTA',
			usuario,
			detalle: correo ? 'Respuesta publicada y enviada por correo' : 'Respuesta publicada en el ticket'
		});

		if (nuevoEstado !== estadoAnterior) {
			await registrarEventoTx(tx, {
				ticketId: id,
				tipoEvento: 'ESTADO',
				usuario,
				valorAnterior: ETIQUETAS_ESTADO[estadoAnterior],
				valorNuevo: ETIQUETAS_ESTADO[nuevoEstado],
				detalle: 'El ticket se abrió al recibir una respuesta'
			});
		}

		if (correo) {
			await registrarEventoTx(tx, {
				ticketId: id,
				tipoEvento: 'CORREO_ENVIADO',
				usuario,
				valorNuevo: correo.threadId,
				detalle: `Message-ID ${correo.messageId}`
			});
		}

		await tx
			.insert(ticketLecturas)
			.values({ ticketId: id, usuarioId: usuario.id, ultimaLectura: new Date() })
			.onConflictDoUpdate({
				target: [ticketLecturas.ticketId, ticketLecturas.usuarioId],
				set: { ultimaLectura: new Date() }
			});

		const destinatarios = await idsParticipantesTx(tx, id);
		await notificarTx(tx, {
			ticketId: id,
			usuarioIds: destinatarios,
			tipo: 'TICKET_RESPUESTA',
			titulo: `Nueva respuesta en ${base.codigoVisible}`,
			detalle: datos.contenido.slice(0, 160),
			actorUsuarioId: usuario.id,
			claveEvento: `mensaje:${mensaje.id}`
		});

		return mensaje.id;
	});

	return {
		ticket: await obtenerTicket(usuario, id, true),
		correo,
		correoError
	};
}

// --- Participantes ----------------------------------------------------------

export async function agregarParticipante(
	usuario: UsuarioSesion,
	id: number,
	datos: DatosParticipanteTicket
): Promise<TicketDetalle> {
	const base = await cargarFilaTicket(id);
	if (!base) throw new ErrorTickets('NO_ENCONTRADO', 'El ticket no existe');
	const participantesPorTicket = await participantesDe([id]);
	const permisos = permisosDe(usuario, base, participantesPorTicket[id] ?? []);
	if (!permisos.ver) throw new ErrorTickets('SIN_PERMISO', 'No tenés acceso a este ticket');
	if (!permisos.agregarParticipantes) {
		throw new ErrorTickets('SIN_PERMISO', 'El ticket está cerrado y no admite participantes');
	}

	await db.transaction(async (tx) => {
		if (datos.tipo === 'AREA') {
			await validarAreaTx(tx, datos.areaId);
			await agregarParticipanteTx(tx, id, 'AREA', datos.areaId, 'MENCION', usuario.id);
			const usuariosArea = await tx
				.select({ id: user.id })
				.from(user)
				.where(
					and(eq(user.areaId, datos.areaId), eq(user.activo, true), isNull(user.eliminadoEn))
				);
			await notificarTx(tx, {
				ticketId: id,
				usuarioIds: usuariosArea.map((fila) => fila.id),
				tipo: 'PARTICIPANTE_AGREGADO',
				titulo: `Te agregaron a ${base.codigoVisible}`,
				detalle: base.titulo,
				actorUsuarioId: usuario.id,
				claveEvento: `participante:${base.version + 1}`
			});
			await registrarEventoTx(tx, {
				ticketId: id,
				tipoEvento: 'AREA_INVOLUCRADA',
				usuario,
				valorNuevo: `Área ${datos.areaId}`,
				detalle: 'Área agregada por mención'
			});
		} else {
			await validarUsuarioTx(tx, datos.usuarioId);
			await agregarParticipanteTx(tx, id, 'USUARIO', datos.usuarioId, 'MENCION', usuario.id);
			await notificarTx(tx, {
				ticketId: id,
				usuarioIds: [datos.usuarioId],
				tipo: 'PARTICIPANTE_AGREGADO',
				titulo: `Te agregaron a ${base.codigoVisible}`,
				detalle: base.titulo,
				actorUsuarioId: usuario.id,
				claveEvento: `participante:${base.version + 1}`
			});
			await registrarEventoTx(tx, {
				ticketId: id,
				tipoEvento: 'USUARIO_INVOLUCRADO',
				usuario,
				valorNuevo: `Usuario ${datos.usuarioId}`,
				detalle: 'Usuario agregado por mención'
			});
		}

		await tx
			.update(tickets)
			.set({ version: base.version + 1, fechaActualizacion: new Date() })
			.where(eq(tickets.id, id));
	});

	return obtenerTicket(usuario, id, false);
}

export async function quitarParticipante(
	usuario: UsuarioSesion,
	id: number,
	participanteId: number
): Promise<TicketDetalle> {
	const base = await cargarFilaTicket(id);
	if (!base) throw new ErrorTickets('NO_ENCONTRADO', 'El ticket no existe');
	const participantesPorTicket = await participantesDe([id]);
	const participantes = participantesPorTicket[id] ?? [];
	const permisos = permisosDe(usuario, base, participantes);
	if (!permisos.ver) throw new ErrorTickets('SIN_PERMISO', 'No tenés acceso a este ticket');
	if (!permisos.agregarParticipantes) {
		throw new ErrorTickets('SIN_PERMISO', 'El ticket está cerrado y no admite cambios de participantes');
	}

	const [participante] = await db
		.select()
		.from(ticketParticipantes)
		.where(and(eq(ticketParticipantes.id, participanteId), eq(ticketParticipantes.ticketId, id)))
		.limit(1);
	if (!participante) throw new ErrorTickets('NO_ENCONTRADO', 'El participante no existe');
	if (participante.tipo === 'AREA' && participante.areaId === base.areaResponsableId) {
		throw new ErrorTickets(
			'PARTICIPANTE_INVALIDO',
			'No se puede quitar el área responsable; cambiala primero'
		);
	}
	if (participante.usuarioId === base.creadoPorUsuarioId) {
		throw new ErrorTickets('PARTICIPANTE_INVALIDO', 'No se puede quitar al creador del ticket');
	}
	if (participante.usuarioId === base.usuarioAsignadoId) {
		throw new ErrorTickets('PARTICIPANTE_INVALIDO', 'No se puede quitar al usuario asignado');
	}

	await db.transaction(async (tx) => {
		await tx
			.update(ticketParticipantes)
			.set({ activo: false })
			.where(eq(ticketParticipantes.id, participanteId));
		await registrarEventoTx(tx, {
			ticketId: id,
			tipoEvento: 'PARTICIPANTE_QUITADO',
			usuario,
			valorAnterior: participante.tipo === 'AREA' ? `Área ${participante.areaId}` : `Usuario ${participante.usuarioId}`,
			detalle: 'Participante dado de baja lógica'
		});
		await tx
			.update(tickets)
			.set({ version: base.version + 1, fechaActualizacion: new Date() })
			.where(eq(tickets.id, id));
	});

	return obtenerTicket(usuario, id, false);
}

// --- Catálogos --------------------------------------------------------------

export async function listarCatalogosTickets(): Promise<{
	areas: TicketAreaVista[];
	usuarios: TicketUsuarioVista[];
	categorias: { id: number; nombre: string; orden: number }[];
}> {
	const [filasAreas, filasUsuarios, filasCategorias] = await Promise.all([
		db
			.select({
				id: areas.id,
				nombre: areas.nombre,
				protegida: areas.protegida
			})
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
			.orderBy(asc(user.name)),
		db
			.select({
				id: ticketCategorias.id,
				nombre: ticketCategorias.nombre,
				orden: ticketCategorias.orden
			})
			.from(ticketCategorias)
			.where(eq(ticketCategorias.activo, true))
			.orderBy(asc(ticketCategorias.orden), asc(ticketCategorias.nombre))
	]);

	return {
		areas: filasAreas,
		usuarios: filasUsuarios,
		categorias: filasCategorias
	};
}

export async function buscarServiciosTickets(q: string) {
	const busqueda = q.trim();
	if (busqueda.length < 2) return [];
	const patron = `%${busqueda}%`;
	const filas = await db
		.select({
			id: servicios.id,
			nombre: servicios.contactoFacturacion,
			nombreFantasia: servicios.nombreFantasia,
			numeracion: servicios.numeracion,
			cliente: servicios.contactoFacturacion
		})
		.from(servicios)
		.where(
			and(
				eq(servicios.habilitado, true),
				isNull(servicios.eliminadoEn),
				or(
					ilike(servicios.contactoFacturacion, patron),
					ilike(servicios.nombreFantasia, patron),
					ilike(servicios.numeracion, patron)
				)
			)
		)
		.orderBy(asc(servicios.contactoFacturacion))
		.limit(20);
	return filas;
}

// --- Notificaciones ---------------------------------------------------------

export async function listarNotificaciones(usuario: UsuarioSesion) {
	const filas = await db
		.select({
			id: ticketNotificaciones.id,
			ticketId: ticketNotificaciones.ticketId,
			codigo: tickets.codigoVisible,
			tituloTicket: tickets.titulo,
			tipo: ticketNotificaciones.tipo,
			titulo: ticketNotificaciones.titulo,
			detalle: ticketNotificaciones.detalle,
			leidoEn: ticketNotificaciones.leidoEn,
			creadoEn: ticketNotificaciones.creadoEn
		})
		.from(ticketNotificaciones)
		.innerJoin(tickets, eq(tickets.id, ticketNotificaciones.ticketId))
		.where(eq(ticketNotificaciones.usuarioId, usuario.id))
		.orderBy(desc(ticketNotificaciones.creadoEn))
		.limit(50);

	return {
		items: filas.map((fila) => ({
			id: fila.id,
			ticketId: fila.ticketId,
			codigo: fila.codigo,
			tituloTicket: fila.tituloTicket,
			tipo: fila.tipo,
			titulo: fila.titulo,
			detalle: fila.detalle,
			leido: Boolean(fila.leidoEn),
			creadoEn: fila.creadoEn.toISOString()
		})),
		noLeidas: filas.filter((fila) => !fila.leidoEn).length
	};
}

export async function marcarNotificacionesLeidas(usuario: UsuarioSesion): Promise<number> {
	const filas = await db
		.update(ticketNotificaciones)
		.set({ leidoEn: new Date() })
		.where(
			and(
				eq(ticketNotificaciones.usuarioId, usuario.id),
				isNull(ticketNotificaciones.leidoEn)
			)
		)
		.returning({ id: ticketNotificaciones.id });
	return filas.length;
}

// --- Correo -----------------------------------------------------------------

function escaparHtml(texto: string): string {
	return texto.replace(
		/[&<>"']/g,
		(caracter) =>
			({
				'&': '&amp;',
				'<': '&lt;',
				'>': '&gt;',
				'"': '&quot;',
				"'": '&#39;'
			})[caracter] ?? caracter
	);
}

function construirLeyenda(
	base: FilaTicketBase,
	participantes: TicketParticipanteVista[]
): string {
	const areas = new Set<string>();
	const usuarios = new Set<string>();

	for (const participante of participantes) {
		if (!participante.activo) continue;
		if (participante.tipo === 'AREA') areas.add(`@${participante.nombre}`);
		else usuarios.add(`@${participante.nombre.replace(/\s+/g, '')}`);
	}

	const menciones = [...areas, ...usuarios];
	if (menciones.length === 0) return '';

	return [
		'',
		'---',
		`Menciones disponibles en este hilo: ${menciones.join(' · ')}`,
		'Respondé manteniendo el asunto. Si escribís una mención, el sistema la detecta y notifica al área o usuario dentro del ticket.'
	].join('\n');
}

async function cuentaPredeterminada() {
	const [cuenta] = await db
		.select()
		.from(cuentasCorreo)
		.where(eq(cuentasCorreo.activo, true))
		.orderBy(desc(cuentasCorreo.predeterminada), asc(cuentasCorreo.id))
		.limit(1);
	if (!cuenta) {
		throw new ErrorTickets(
			'SIN_CUENTA_CORREO',
			'No hay una cuenta de correo activa. Configurala en Configuración › Correo.'
		);
	}
	return cuenta;
}

async function tokenGmailCuenta(cuenta: typeof gmailCuentas.$inferSelect): Promise<string> {
	if (
		cuenta.accessTokenCifrado &&
		cuenta.accessTokenExpiraEn &&
		cuenta.accessTokenExpiraEn.getTime() > Date.now() + 60_000
	) {
		return descifrarCredencial(cuenta.accessTokenCifrado);
	}
	const refresh = descifrarCredencial(cuenta.refreshTokenCifrado);
	const tokens = await refrescarToken(refresh);
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

async function enviarCorreoBase(
	usuario: UsuarioSesion,
	base: FilaTicketBase,
	participantes: TicketParticipanteVista[],
	datos: {
		para: string[];
		cc: string[];
		asunto: string;
		cuerpo: string;
		cuentaId?: number;
		aliasId?: number | null;
		cuentaGmailId?: number;
	}
): Promise<{ correoId: number; messageId: string; threadId: string }> {
	const [ultimo] = await db
		.select({ threadId: ticketCorreos.threadId, messageId: ticketCorreos.messageId })
		.from(ticketCorreos)
		.where(and(eq(ticketCorreos.ticketId, base.id), eq(ticketCorreos.direccion, 'SALIENTE')))
		.orderBy(desc(ticketCorreos.id))
		.limit(1);

	const destinatarios = [
		...new Set(
			[...datos.para, ...datos.cc]
				.map((email) => email.trim().toLowerCase())
				.filter(Boolean)
		)
	];
	if (destinatarios.length === 0) {
		throw new ErrorTickets('DATOS_INVALIDOS', 'Indicá al menos un destinatario');
	}

	const asunto = datos.asunto.includes(`[${base.codigoVisible}]`)
		? datos.asunto
		: `[${base.codigoVisible}] ${datos.asunto}`;
	const leyenda = construirLeyenda(base, participantes);
	const textoBase = `${datos.cuerpo}${leyenda ? `\n${leyenda}` : ''}`;
	const htmlBase = `<p>${escaparHtml(datos.cuerpo).replace(/\n/g, '<br>')}</p>${
		leyenda
			? `<hr><p style="font-size:12px;color:#475569">${escaparHtml(leyenda).replace(/\n/g, '<br>')}</p>`
			: ''
	}`;

	const cuerpoPara = (urlPortal: string) => ({
		texto: `${textoBase}${urlPortal ? `\n\nVer y responder en el ticket: ${urlPortal}\n` : ''}`,
		html: `${htmlBase}${
			urlPortal
				? `<p style="margin-top:18px"><a href="${urlPortal}" style="display:inline-block;padding:10px 16px;border-radius:8px;background:#4f46e5;color:#fff;text-decoration:none;font-family:sans-serif;font-size:14px">Ver y responder en el ticket</a></p>`
				: ''
		}`
	});

	const envios: {
		destinatario: string;
		gmailMessageId: string | null;
		messageId: string;
		threadId: string;
	}[] = [];
	let messageId = '';
	let threadId = '';
	let remitenteEmail = '';

	if (datos.cuentaGmailId) {
		const [cuentaGmail] = await db
			.select()
			.from(gmailCuentas)
			.where(eq(gmailCuentas.id, datos.cuentaGmailId))
			.limit(1);
		if (!cuentaGmail || !cuentaGmail.activo) {
			throw new ErrorTickets(
				'SIN_CUENTA_CORREO',
				'La cuenta Gmail no existe o está desconectada. Revisá Configuración › Correo.'
			);
		}
		const accessToken = await tokenGmailCuenta(cuentaGmail);
		let hilo: string | null = ultimo?.threadId ?? null;
		try {
			for (const destinatario of destinatarios) {
				let urlPortal = '';
				try {
					urlPortal = construirUrlPortal(await crearEnlacePublico(base.id, destinatario));
				} catch (error) {
					console.error('[tickets] no se pudo crear el enlace público:', error);
				}
				const cuerpos = cuerpoPara(urlPortal);
				const envio = await enviarMensaje(accessToken, {
					de: { nombre: cuentaGmail.nombre || cuentaGmail.email, email: cuentaGmail.email },
					para: [destinatario],
					cc: [],
					asunto,
					...cuerpos,
					codigo: base.codigoVisible,
					replyTo: construirReplyTo(cuentaGmail.email, base.codigoVisible),
					inReplyTo: ultimo?.messageId ?? null,
					references: ultimo?.messageId ?? null,
					threadId: hilo
				});
				hilo = hilo ?? envio.threadId;
				if (!messageId) {
					messageId = envio.messageId;
					threadId = envio.threadId;
					remitenteEmail = cuentaGmail.email;
				}
				envios.push({
					destinatario,
					gmailMessageId: envio.id,
					messageId: envio.messageId,
					threadId: envio.threadId
				});
			}
		} catch (error) {
			throw new ErrorTickets(
				'CORREO_FALLIDO',
				error instanceof Error ? error.message : 'No se pudo enviar el correo por Gmail'
			);
		}
	} else {
		const cuenta = datos.cuentaId
			? (await db.select().from(cuentasCorreo).where(eq(cuentasCorreo.id, datos.cuentaId)).limit(1))[0]
			: await cuentaPredeterminada();
		if (!cuenta) {
			throw new ErrorTickets('SIN_CUENTA_CORREO', 'La cuenta de correo no existe');
		}
		threadId = ultimo?.threadId ?? `ticket-${base.id}-${randomUUID()}`;
		try {
			for (const destinatario of destinatarios) {
				let urlPortal = '';
				try {
					urlPortal = construirUrlPortal(await crearEnlacePublico(base.id, destinatario));
				} catch (error) {
					console.error('[tickets] no se pudo crear el enlace público:', error);
				}
				const cuerpos = cuerpoPara(urlPortal);
				const envioId = await enviarConCuenta({
					cuentaId: cuenta.id,
					aliasId: datos.aliasId ?? null,
					para: [destinatario],
					cc: [],
					asunto,
					...cuerpos
				});
				if (!messageId) {
					messageId = envioId;
					remitenteEmail = cuenta.email;
				}
				envios.push({
					destinatario,
					gmailMessageId: null,
					messageId: envioId,
					threadId
				});
			}
		} catch (error) {
			if (error instanceof ErrorEnvioCorreo) {
				throw new ErrorTickets('CORREO_FALLIDO', error.message);
			}
			throw new ErrorTickets(
				'CORREO_FALLIDO',
				error instanceof Error ? error.message : 'No se pudo enviar el correo'
			);
		}
	}

	const correoId = await db.transaction(async (tx) => {
		const [correo] = await tx
			.insert(ticketCorreos)
			.values({
				ticketId: base.id,
				direccion: 'SALIENTE',
				threadId,
				messageId,
				de: remitenteEmail,
				para: destinatarios.join(', '),
				cc: null,
				asunto,
				cuerpo: textoBase,
				estado: 'ENVIADO',
				usuarioId: usuario.id,
				metadata: {
					threadId,
					messageId,
					proveedor: datos.cuentaGmailId ? 'GMAIL' : 'SMTP',
					envios: envios.length
				}
			})
			.returning({ id: ticketCorreos.id });

		if (envios.length > 0) {
			await tx.insert(ticketCorreoEnvios).values(
				envios.map((envio) => ({
					correoId: correo.id,
					destinatario: envio.destinatario,
					gmailMessageId: envio.gmailMessageId,
					messageIdHeader: envio.messageId,
					threadId: envio.threadId
				}))
			);
		}

		return correo.id;
	});

	return { correoId, messageId, threadId };
}

export async function enviarCorreoTicket(
	usuario: UsuarioSesion,
	id: number,
	datos: DatosCorreoTicket
): Promise<TicketDetalle> {
	const base = await cargarFilaTicket(id);
	if (!base) throw new ErrorTickets('NO_ENCONTRADO', 'El ticket no existe');
	const participantesPorTicket = await participantesDe([id]);
	const participantes = participantesPorTicket[id] ?? [];
	const permisos = permisosDe(usuario, base, participantes);
	if (!permisos.ver) throw new ErrorTickets('SIN_PERMISO', 'No tenés acceso a este ticket');
	if (!permisos.enviarCorreo) {
		throw new ErrorTickets('TICKET_CERRADO', 'El ticket está cerrado y no admite correos');
	}

	const correo = await enviarCorreoBase(usuario, base, participantes, {
		para: datos.para,
		cc: datos.cc,
		asunto: datos.asunto,
		cuerpo: datos.cuerpo,
		cuentaId: datos.cuentaId,
		aliasId: datos.aliasId,
		cuentaGmailId: datos.cuentaGmailId
	});

	await db.transaction(async (tx) => {
		if (datos.guardarEnHistorial) {
			await tx.insert(ticketMensajes).values({
				ticketId: id,
				autorUsuarioId: usuario.id,
				tipo: 'COMENTARIO',
				contenido: datos.cuerpo,
				canal: 'CORREO',
				metadata: {
					asunto: datos.asunto,
					messageId: correo.messageId,
					threadId: correo.threadId
				}
			});
			await registrarEventoTx(tx, {
				ticketId: id,
				tipoEvento: 'CORREO_ENVIADO',
				usuario,
				valorNuevo: correo.threadId,
				detalle: `Message-ID ${correo.messageId}`
			});
		}

		await tx
			.update(tickets)
			.set({ version: base.version + 1, fechaActualizacion: new Date() })
			.where(eq(tickets.id, id));

		const destinatarios = await idsParticipantesTx(tx, id);
		await notificarTx(tx, {
			ticketId: id,
			usuarioIds: destinatarios,
			tipo: 'TICKET_CORREO',
			titulo: `Correo enviado en ${base.codigoVisible}`,
			detalle: datos.asunto,
			actorUsuarioId: usuario.id,
			claveEvento: `correo:${base.version + 1}`
		});
	});

	return obtenerTicket(usuario, id, true);
}

export async function registrarCorreoEntrante(
	id: number,
	datos: DatosCorreoEntrante
): Promise<{ mensajeId: number; threadId: string | null }> {
	const base = await cargarFilaTicket(id);
	if (!base) throw new ErrorTickets('NO_ENCONTRADO', 'El ticket no existe');
	if (ESTADOS_TERMINALES.includes(base.estado as EstadoTicket)) {
		throw new ErrorTickets('TICKET_CERRADO', 'El ticket está cerrado y no admite respuestas');
	}

	const [usuarioEmail] = await db
		.select({ id: user.id, nombre: user.name, email: user.email, rol: user.rol, areaId: user.areaId })
		.from(user)
		.where(and(eq(user.email, datos.de), eq(user.activo, true), isNull(user.eliminadoEn)))
		.limit(1);

	const participantesPorTicket = await participantesDe([id]);
	const participantes = participantesPorTicket[id] ?? [];
	const autor = usuarioEmail
		? {
				id: usuarioEmail.id,
				nombre: usuarioEmail.nombre,
				email: usuarioEmail.email,
				rol: (usuarioEmail.rol === 'ADMIN' ? 'ADMIN' : 'OPERADOR') as 'ADMIN' | 'OPERADOR',
				areaId: usuarioEmail.areaId,
				areaNombre: null,
				permisos: [],
				admin: usuarioEmail.rol === 'ADMIN'
			}
		: null;
	const autorParticipa = autor ? usuarioParticipa(autor, base, participantes) : false;

	return await db.transaction(async (tx) => {
		const [correo] = await tx
			.insert(ticketCorreos)
			.values({
				ticketId: id,
				direccion: 'ENTRANTE',
				threadId: datos.threadId ?? null,
				messageId: datos.messageId ?? null,
				inReplyTo: datos.inReplyTo ?? null,
				de: datos.de,
				para: datos.para.length ? datos.para.join(', ') : null,
				asunto: datos.asunto,
				cuerpo: datos.cuerpo,
				fecha: datos.fecha ? new Date(datos.fecha) : new Date(),
				estado: 'INCORPORADO',
				usuarioId: autor?.id ?? null,
				metadata: { threadId: datos.threadId ?? null, messageId: datos.messageId ?? null }
			})
			.returning({ id: ticketCorreos.id });

		const menciones = autorParticipa
			? await resolverMencionesTx(tx, datos.cuerpo)
			: { tokens: [], areas: [], usuarios: [] };
		for (const areaId of menciones.areas) {
			await agregarParticipanteTx(tx, id, 'AREA', areaId, 'MENCION', autor?.id ?? 'correo');
		}
		for (const usuarioId of menciones.usuarios) {
			await agregarParticipanteTx(tx, id, 'USUARIO', usuarioId, 'MENCION', autor?.id ?? 'correo');
		}

		const [mensaje] = await tx
			.insert(ticketMensajes)
			.values({
				ticketId: id,
				autorUsuarioId: autor?.id ?? null,
				autorNombre: autor?.nombre ?? datos.de,
				autorEmail: datos.de,
				tipo: 'COMENTARIO',
				contenido: datos.cuerpo,
				menciones: menciones.tokens,
				canal: 'CORREO',
				correoId: correo.id,
				metadata: {
					asunto: datos.asunto,
					messageId: datos.messageId ?? null,
					threadId: datos.threadId ?? null,
					direccion: 'ENTRANTE'
				}
			})
			.returning({ id: ticketMensajes.id });

		await registrarEventoTx(tx, {
			ticketId: id,
			tipoEvento: 'CORREO_RECIBIDO',
			usuario: autor,
			valorNuevo: datos.threadId ?? null,
			detalle: `De ${datos.de}${autorParticipa ? '' : ' · remitente externo sin permisos de mención'}`
		});

		await tx
			.update(tickets)
			.set({ version: base.version + 1, fechaActualizacion: new Date() })
			.where(eq(tickets.id, id));

		const destinatarios = await idsParticipantesTx(tx, id);
		await notificarTx(tx, {
			ticketId: id,
			usuarioIds: destinatarios,
			tipo: 'TICKET_CORREO_RECIBIDO',
			titulo: `Correo recibido en ${base.codigoVisible}`,
			detalle: datos.asunto || datos.cuerpo.slice(0, 160),
			actorUsuarioId: autor?.id ?? null,
			claveEvento: `correo-entrante:${datos.messageId ?? mensaje.id}`
		});

		return { mensajeId: mensaje.id, threadId: datos.threadId ?? null };
	});
}

