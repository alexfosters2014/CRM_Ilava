import { leerCobranzaDesdeExcel, type FilaCobranza, type ValidacionCobranza } from '#lib/servicios/importacion.ts';
import type { CuentaCorreo } from './correo.ts';

export interface DocumentoCartera {
	id: number;
	tipoComprobante: string;
	serie: string;
	numero: string;
	fechaEmision: string;
	fechaVencimiento: string;
	moneda: string;
	importe: string;
	saldoPendiente: string;
	diasAging: number;
	/** Plazo configurado en el servicio (días entre emisión y vencimiento). */
	plazoDias: number;
	/** Días de mora: positivo si pasó el plazo, negativo si aún falta. */
	diasVencido: number;
	/** `true` cuando los días desde la emisión superan el plazo del servicio. */
	vencida: boolean;
	tramo: string;
	activo: boolean;
	excluidoEnvio: boolean;
}

export interface ComprobanteEnvio {
	id: number;
	tipoComprobante: string;
	serie: string;
	numero: string;
	vencimiento: string | null;
	moneda: string;
	saldo: string;
	incluido: boolean;
}

/** Destino de un mail: ambos procesos, solo facturas o solo estados de cuenta. */
export type UsoEmail = 'COMPARTIDO' | 'FACTURACION' | 'COBRANZA';

/** Estado derivado del conjunto de mails activos (nunca persistido). */
export type ModoEmails = 'VACIO' | 'COMPARTIDO' | 'SEPARADO' | 'MIXTO';

export interface EmailServicio {
	id: number;
	email: string;
	uso: UsoEmail;
	activo: boolean;
}

export interface EmailsServicio {
	servicioId: number;
	modo: ModoEmails;
	emails: EmailServicio[];
}

export interface ResumenAltaEmails {
	agregados: number;
	existentes: number;
	reactivados: number;
	compartidos: number;
	emails: string[];
}

export interface EnvioCobranza {
	id: number;
	periodo: string;
	creadoEn: string;
	enviadoEn: string | null;
	usuario: string | null;
	plantilla: string | null;
	cuenta: string | null;
	alias: string | null;
	destinatarios: string[];
	asunto: string;
	estado: string;
	error: string | null;
	/** Clasificación del error SMTP (AUTENTICACION, CONEXION, ...). */
	errorTipo: string | null;
	totales: { pesos: string; dolares: string; equivalentePesos: string; cantidad: number } | null;
	comprobantes: ComprobanteEnvio[] | null;
}

export interface ServicioCartera {
	servicioId: number;
	servicio: string;
	/** Celular de WhatsApp normalizado, si el servicio lo tiene cargado. */
	celular: string | null;
	tipoGestion: string;
	tipoCliente: string;
	modalidadCobranza: string;
	seleccionable: boolean;
	grupoCobranzaId: number | null;
	grupoCobranza: string | null;
	grupoCobranzaFondo: string | null;
	grupoCobranzaTexto: string | null;
	grupoCobranzaOrden: number;
	envios: number;
	/** Mails de cobranza activos. 0 = sin destinatarios para enviar. */
	destinatarios: number;
	/** Tramo excluyente de la deuda más antigua. `null` si no debe nada. */
	tramoAntiguedad: string | null;
	/** Días desde la emisión del comprobante impago más antiguo. `null` sin deuda. */
	diasDeudaMasAntigua: number | null;
	/** Alerta de mora: mostaza 1-2 meses, naranja 3-4, rojo +4. `null` sin deuda. */
	alertaMora: 'MOSTAZA' | 'NARANJA' | 'ROJO' | null;
	/** Plazo de pago configurado para el servicio, en días. */
	cantidadDiasVencimiento: number;
	pesos: Record<string, string>;
	dolares: Record<string, string>;
	equivalentePesos: string;
	documentos: DocumentoCartera[];
}

export interface CarteraCobranza {
	periodo: string;
	cotizacionUsd: number;
	servicios: ServicioCartera[];
}

export interface ExclusionCobranza {
	id: number;
	clave: string;
	contacto: string;
	comprobante: string | null;
	motivo: string;
}

export class ErrorImportacionCobranza extends Error {
	constructor(public readonly validaciones: ValidacionCobranza[]) {
		super('La planilla contiene validaciones pendientes');
		this.name = 'ErrorImportacionCobranza';
	}
}

export async function listarCarteraCobranza(periodo?: string): Promise<{ periodos: { periodo: string; cotizacionUsd: string }[]; cartera: CarteraCobranza | null }> {
	const query = periodo ? `?periodo=${encodeURIComponent(periodo)}` : '';
	const res = await fetch(`/api/cobranza${query}`, { cache: 'no-store' });
	if (!res.ok) throw new Error('No se pudo cargar la cartera');
	return res.json();
}

export async function importarCarteraDesdeArchivo(archivo: File, periodo: string, cotizacionUsd: number) {
	const filas: FilaCobranza[] = await leerCobranzaDesdeExcel(archivo);
	const res = await fetch('/api/cobranza', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ periodo, cotizacionUsd, filas, archivoNombre: archivo.name })
	});
	const datos = await res.json().catch(() => ({}));
	if (!res.ok) {
		if (Array.isArray(datos?.errores)) throw new ErrorImportacionCobranza(datos.errores);
		throw new Error(datos?.error ?? 'No se pudo importar la cartera');
	}
	return datos;
}

export async function listarExclusionesCobranza(): Promise<ExclusionCobranza[]> {
	const res = await fetch('/api/cobranza/exclusiones');
	if (!res.ok) throw new Error('No se pudieron cargar las exclusiones de Cobranza');
	return res.json();
}

export async function excluirObservacionCobranza(fila: FilaCobranza, motivo: string) {
	const res = await fetch('/api/cobranza/exclusiones', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ fila, motivo })
	});
	const datos = await res.json().catch(() => ({}));
	if (!res.ok) throw new Error(datos?.error ?? 'No se pudo guardar la exclusión');
	return datos as ExclusionCobranza;
}

export async function eliminarComprobanteCobranza(id: number, motivo?: string) {
	const params = new URLSearchParams({ id: String(id) });
	if (motivo) params.set('motivo', motivo);
	const res = await fetch(`/api/cobranza?${params}`, { method: 'DELETE' });
	if (!res.ok) throw new Error('No se pudo eliminar el comprobante');
}

export interface ConfiguracionCobranza {
	copiaActiva: boolean;
	copiaEmails: string;
	copiaTipo: 'CC' | 'CCO';
}

export async function obtenerConfiguracionCobranza(): Promise<ConfiguracionCobranza> {
	const res = await fetch('/api/configuracion/cobranza');
	if (!res.ok) throw new Error('No se pudo cargar la copia global');
	return res.json();
}

export async function guardarConfiguracionCobranza(
	datos: ConfiguracionCobranza
): Promise<ConfiguracionCobranza> {
	const res = await fetch('/api/configuracion/cobranza', {
		method: 'PUT',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(datos)
	});
	const respuesta = await res.json().catch(() => ({}));
	if (!res.ok) throw new Error(respuesta?.error ?? 'No se pudo guardar la copia global');
	return respuesta;
}

export interface ResumenLoteEnvios {
	id: number;
	periodo: string;
	estado: string;
	total: number;
	enviados: number;
	errores: number;
	pendientes: number;
	procesando: number;
	creadoEn: string;
	finalizadoEn: string | null;
}

export interface ItemLoteEnvios {
	id: number;
	servicio: string;
	estado: string;
	error: string | null;
	errorTipo: string | null;
	intentos: number;
	reanudado: boolean;
	envioId: number | null;
}

export async function crearLoteEnvios(datos: {
	periodo: string;
	servicioIds: number[];
	plantillaId: number;
	cuentaId: number;
	aliasId?: number | null;
}): Promise<{ id: number; total: number }> {
	const res = await fetch('/api/cobranza/envios-masivos', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(datos)
	});
	const respuesta = await res.json().catch(() => ({}));
	if (!res.ok) throw new Error(respuesta?.error ?? 'No se pudo iniciar el envío masivo');
	return respuesta;
}

export async function obtenerLoteActivo(): Promise<ResumenLoteEnvios | null> {
	const res = await fetch('/api/cobranza/envios-masivos/activo');
	if (!res.ok) return null;
	return res.json();
}

export async function obtenerLoteEnvios(
	id: number
): Promise<ResumenLoteEnvios & { items: ItemLoteEnvios[] }> {
	const res = await fetch(`/api/cobranza/envios-masivos/${id}`);
	if (!res.ok) throw new Error('No se pudo cargar el lote de envíos');
	return res.json();
}

export async function asignarGrupoCobranza(
	servicioIds: number[],
	grupoCobranzaId: number | null
): Promise<number> {
	const res = await fetch('/api/cobranza/grupos-cobranza', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ servicioIds, grupoCobranzaId })
	});
	const respuesta = await res.json().catch(() => ({}));
	if (!res.ok) throw new Error(respuesta?.error ?? 'No se pudo asignar el grupo');
	return Number(respuesta?.actualizados ?? 0);
}

export async function listarEmailsServicio(servicioId: number): Promise<EmailsServicio> {
	// no-store: si el navegador cachea una respuesta vieja, los mails cargados
	// desaparecen de la vista hasta refrescar.
	const res = await fetch(`/api/emails?servicioId=${servicioId}`, { cache: 'no-store' });
	if (!res.ok) throw new Error('No se pudieron cargar los emails');
	return res.json();
}

/**
 * Agrega uno o varios mails a un listado. Acepta `;`, `,` o saltos de línea
 * como separadores; los repetidos quedan una sola vez.
 */
export async function agregarEmailsServicio(
	servicioId: number,
	emails: string,
	uso: UsoEmail = 'COBRANZA'
): Promise<ResumenAltaEmails & { uso: UsoEmail }> {
	const res = await fetch('/api/emails', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ servicioId, emails, uso })
	});
	const respuesta = await res.json().catch(() => ({}));
	if (!res.ok) throw new Error(respuesta?.error ?? 'No se pudo agregar el email');
	return respuesta;
}

export async function cambiarUsoEmail(id: number, uso: UsoEmail): Promise<EmailServicio> {
	const res = await fetch(`/api/emails/${id}`, {
		method: 'PATCH',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ uso })
	});
	const respuesta = await res.json().catch(() => ({}));
	if (!res.ok) throw new Error(respuesta?.error ?? 'No se pudo cambiar el destino');
	return respuesta;
}

/**
 * Quita el mail de un listado. Si era compartido no se borra: queda en el otro
 * listado y `uso` indica cuál conserva.
 */
export async function quitarEmailDeLista(
	id: number,
	lista: 'FACTURACION' | 'COBRANZA'
): Promise<{ eliminado: boolean; uso: UsoEmail | null; email: string }> {
	const res = await fetch(`/api/emails/${id}?lista=${lista}`, { method: 'DELETE' });
	const respuesta = await res.json().catch(() => ({}));
	if (!res.ok) throw new Error(respuesta?.error ?? 'No se pudo quitar el email');
	return respuesta;
}

/** Baja completa: el mail deja de recibir facturas y estados de cuenta. */
export async function eliminarEmailServicio(id: number): Promise<void> {
	const res = await fetch(`/api/emails/${id}`, { method: 'DELETE' });
	if (!res.ok) throw new Error('No se pudo eliminar el email');
}

/** Pasa todos los mails activos del servicio a COMPARTIDO. */
export async function unificarEmailsServicio(servicioId: number): Promise<{ actualizados: number }> {
	const res = await fetch('/api/emails/unificar', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ servicioId })
	});
	const respuesta = await res.json().catch(() => ({}));
	if (!res.ok) throw new Error(respuesta?.error ?? 'No se pudieron unificar los listados');
	return respuesta;
}

export async function listarEnviosCobranza(servicioId: number): Promise<EnvioCobranza[]> {
	const res = await fetch(`/api/cobranza/envios?servicioId=${servicioId}`);
	if (!res.ok) throw new Error('No se pudo cargar el historial de envíos');
	return res.json();
}

export async function enviarEstadoCuenta(datos: {
	servicioId: number;
	periodo: string;
	plantillaId: number;
	cuentaId: number;
	aliasId?: number | null;
	/** Envía solo comprobantes con el plazo vencido. */
	soloVencidos?: boolean;
}): Promise<EnvioCobranza> {
	const res = await fetch('/api/cobranza/envios', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(datos)
	});
	const respuesta = await res.json().catch(() => ({}));
	if (!res.ok) throw new Error(respuesta?.error ?? 'No se pudo enviar el estado de cuenta');
	return respuesta;
}

export async function alternarExclusionEnvio(id: number, excluido: boolean) {
	const res = await fetch(`/api/cobranza/comprobantes/${id}/exclusion`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ excluido })
	});
	const respuesta = await res.json().catch(() => ({}));
	if (!res.ok) throw new Error(respuesta?.error ?? 'No se pudo actualizar la exclusión');
	return respuesta as { id: number; excluidoEnvio: boolean };
}

export interface ComprobanteEliminado {
	id: number;
	servicioId: number;
	servicio: string;
	tipoComprobante: string;
	serie: string;
	numero: string;
	fechaEmision: string;
	moneda: string;
	saldoPendiente: string;
	eliminadoEn: string;
	eliminadoPor: string | null;
	eliminadoMotivo: string | null;
}

export async function listarComprobantesEliminados(periodo: string): Promise<ComprobanteEliminado[]> {
	const res = await fetch(`/api/cobranza/eliminados?periodo=${encodeURIComponent(periodo)}`);
	if (!res.ok) throw new Error('No se pudieron cargar los comprobantes eliminados');
	return res.json();
}

export async function restaurarComprobanteCobranza(id: number) {
	const res = await fetch(`/api/cobranza/comprobantes/${id}/restaurar`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: '{}'
	});
	if (!res.ok) throw new Error('No se pudo restaurar el comprobante');
}

export interface PlantillaCobranza {
	id: number;
	nombre: string;
	asunto: string;
	cuerpo: string;
	cartaHabilitada: boolean;
	cartaHtml: string | null;
	cartaFondo: string | null;
	activo: boolean;
}

export async function listarPlantillasCobranza(): Promise<PlantillaCobranza[]> {
	const res = await fetch('/api/cobranza/plantillas');
	if (!res.ok) throw new Error('No se pudieron cargar las plantillas');
	return res.json();
}

/** Plantilla que el detalle propone por defecto al enviar. */
export async function obtenerPlantillaPredeterminadaCobranza(): Promise<number | null> {
	const res = await fetch('/api/cobranza/plantilla-predeterminada', { cache: 'no-store' });
	if (!res.ok) throw new Error('No se pudo cargar la plantilla predeterminada');
	const cuerpo = (await res.json()) as { plantillaId: number | null };
	return cuerpo.plantillaId;
}

export async function guardarPlantillaPredeterminadaCobranza(plantillaId: number | null): Promise<number | null> {
	const res = await fetch('/api/cobranza/plantilla-predeterminada', {
		method: 'PUT',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ plantillaId })
	});
	const respuesta = await res.json().catch(() => ({}));
	if (!res.ok) throw new Error(respuesta?.error ?? 'No se pudo guardar la plantilla predeterminada');
	return respuesta.plantillaId ?? null;
}

export async function guardarPlantillaCobranza(datos: Partial<PlantillaCobranza>) {
	const res = await fetch('/api/cobranza/plantillas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(datos) });
	const respuesta = await res.json().catch(() => ({}));
	if (!res.ok) throw new Error(respuesta?.error ?? 'No se pudo guardar la plantilla');
	return respuesta as PlantillaCobranza;
}

export interface FilaPlanillaEmails {
	servicioId: number;
	servicio: string;
	emails: string;
}

export interface CambiosEmails {
	nuevos: string[];
	reactivados: string[];
	aCompartido: string[];
	quitados: string[];
	retenidos: string[];
	sinCambios: string[];
}

export interface CambioServicioEmails extends CambiosEmails {
	servicioId: number;
	servicio: string;
	accion: 'SIN_CAMBIOS' | 'LIMPIAR' | 'REEMPLAZAR';
}

export interface ResumenImportacionEmails {
	importacionId: number | null;
	aplicar: boolean;
	filas: number;
	servicios: number;
	agregados: number;
	reactivados: number;
	compartidos: number;
	quitados: number;
	retenidos: number;
	sinCambios: number;
	detalle: CambioServicioEmails[];
}

export class ErrorImportacionEmails extends Error {
	constructor(public readonly errores: { fila: number; mensaje: string }[]) {
		super('La planilla de mails tiene errores');
		this.name = 'ErrorImportacionEmails';
	}
}

export interface ImportacionEmails {
	id: number;
	archivo: string | null;
	usuario: string | null;
	totales: Record<string, number> | null;
	creadoEn: string;
}

/** Servicios vivos con sus mails activos de cobranza. */
export async function obtenerPlanillaEmails(): Promise<FilaPlanillaEmails[]> {
	const res = await fetch('/api/cobranza/emails/planilla', { cache: 'no-store' });
	if (!res.ok) throw new Error('No se pudo cargar la planilla de mails');
	const cuerpo = (await res.json()) as { servicios: FilaPlanillaEmails[] };
	return cuerpo.servicios ?? [];
}

/**
 * Valida la planilla (`aplicar: false`) o la aplica (`aplicar: true`).
 * El servidor devuelve el diff para previsualizar antes de confirmar.
 */
export async function importarPlanillaEmails(
	filas: { servicioId: number; emails: string }[],
	archivoNombre: string,
	aplicar: boolean
): Promise<ResumenImportacionEmails> {
	const res = await fetch('/api/cobranza/emails/importar', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ filas, archivoNombre, aplicar })
	});
	const datos = await res.json().catch(() => ({}));
	if (!res.ok) {
		if (Array.isArray(datos?.errores)) throw new ErrorImportacionEmails(datos.errores);
		throw new Error(datos?.error ?? 'No se pudo importar la planilla de mails');
	}
	return datos as ResumenImportacionEmails;
}

export async function listarImportacionesEmails(): Promise<ImportacionEmails[]> {
	const res = await fetch('/api/cobranza/emails/importaciones', { cache: 'no-store' });
	if (!res.ok) throw new Error('No se pudo cargar el historial de importaciones');
	const cuerpo = (await res.json()) as { importaciones: ImportacionEmails[] };
	return cuerpo.importaciones ?? [];
}

/**
 * Cuentas SMTP para elegir el remitente en el modal de envío.
 *
 * Va por `/api/cobranza/cuentas` (solo lectura) y no por `/api/correo/cuentas`:
 * administrar credenciales SMTP es una acción de Configuración → Correo, y un
 * operador de cobranza no debe poder crearlas ni modificarlas.
 */
export async function listarCuentasCorreoEnvio(): Promise<CuentaCorreo[]> {
	const res = await fetch('/api/cobranza/cuentas', { cache: 'no-store' });
	if (!res.ok) throw new Error('No se pudieron cargar las cuentas de correo');
	return res.json();
}

// ---------------------------------------------------------------- WhatsApp

export interface EstadoWhatsAppCobranza {
	conectado: boolean;
	estado: string;
	numeroTelefono: string | null;
}

export async function obtenerEstadoWhatsAppCobranza(): Promise<EstadoWhatsAppCobranza> {
	const res = await fetch('/api/cobranza/whatsapp/estado', { cache: 'no-store' });
	if (!res.ok) throw new Error('No se pudo consultar el estado de WhatsApp');
	return res.json();
}

export interface ResultadoEnvioWhatsAppCobranza {
	ok: boolean;
	modo: 'PDF' | 'TEXTO';
	waId: string;
	telefono: string;
	enviadoEn: string;
	/** Totales efectivamente enviados (netos de notas de crédito). */
	totales: { uyu: number; usd: number };
}

/** Envía el estado de cuenta del servicio por WhatsApp. */
export async function enviarCobranzaPorWhatsApp(
	servicioId: number,
	soloVencidos = false,
	periodo?: string,
	totales?: { uyu: number; usd: number },
	plantillaId?: number | null
): Promise<ResultadoEnvioWhatsAppCobranza> {
	const res = await fetch('/api/cobranza/whatsapp/enviar', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ servicioId, soloVencidos, periodo, totales, plantillaId })
	});
	const datos = await res.json().catch(() => ({}));
	if (!res.ok) {
		throw new Error(datos?.error ?? 'No se pudo enviar el estado de cuenta por WhatsApp');
	}
	return datos as ResultadoEnvioWhatsAppCobranza;
}
