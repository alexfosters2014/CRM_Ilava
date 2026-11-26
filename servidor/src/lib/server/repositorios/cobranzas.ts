import { and, asc, count, desc, eq, inArray, isNotNull, isNull } from 'drizzle-orm';
import {
	auditoriaCobranza,
	comprobantesCobranza,
	configuracionCobranza,
	enviosCobranza,
	exclusionesCobranza,
	db,
	modalidadesCobranza,
	periodosCobranza,
	servicios,
	serviciosEmails,
	gruposCobranza,
	tiposCliente,
	tiposGestion,
	tiposComprobantes,
	plantillasCobranza
} from '../base-datos/index.ts';
import { usosDeLista } from '../servicios/emails.ts';
import { normalizarTexto } from '../servicios/normalizar.ts';
import { listaEmails, resolverCopias } from '../servicios/copias.ts';
import {
	alertaMoraPorDias,
	calcularDiasAging,
	diasDeudaMasAntigua,
	estadoVencimiento,
	fechaCortePeriodo,
	fechaVencimientoEfectiva,
	tramoDeudaMasAntigua,
	tramoPorDias,
	claveExclusionCobranza,
	normalizarTipoComprobante,
	validarFilasCobranza,
	variablesDesconocidas,
	type AlertaMora,
	type FilaCobranzaImportacion,
	type TramoCobranza
} from '../servicios/cobranzas.ts';

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
	tramo: TramoCobranza;
	activo: boolean;
	excluidoEnvio: boolean;
}

async function excluirFilas(filas: FilaCobranzaImportacion[]): Promise<FilaCobranzaImportacion[]> {
	const exclusiones = await db.select({ clave: exclusionesCobranza.clave }).from(exclusionesCobranza).where(eq(exclusionesCobranza.activo, true));
	const claves = new Set(exclusiones.map((exclusion) => exclusion.clave));
	return filas.filter((fila) => !claves.has(claveExclusionCobranza(fila)));
}

export async function listarExclusionesCobranza() {
	return db.select().from(exclusionesCobranza).where(eq(exclusionesCobranza.activo, true)).orderBy(desc(exclusionesCobranza.creadoEn));
}

export async function crearExclusionCobranza(datos: {
	fila: FilaCobranzaImportacion;
	motivo: string;
	usuario?: string;
}) {
	const motivo = datos.motivo.trim() || 'Excluido por decisión del usuario';
	const fila = datos.fila;
	const clave = claveExclusionCobranza(fila);
	const existente = await db.select().from(exclusionesCobranza).where(eq(exclusionesCobranza.clave, clave));
	if (existente[0]) return existente[0];
	const [creada] = await db.insert(exclusionesCobranza).values({
		clave,
		contacto: fila.contacto.trim(),
		tipoComprobante: fila.tipoComprobante?.trim() || null,
		serie: fila.serie?.trim() || null,
		numero: fila.numero?.trim() || null,
		comprobante: fila.comprobante?.trim() || null,
		fechaEmision: fila.fechaEmision || null,
		moneda: fila.moneda?.trim() || null,
		importe: Number.isFinite(fila.importe) ? String(fila.importe) : null,
		saldoPendiente: Number.isFinite(fila.saldoPendiente) ? String(fila.saldoPendiente) : null,
		motivo,
		creadoPor: datos.usuario
	}).returning();
	return creada;
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
	/** Cantidad de mails de cobranza activos. 0 = no se le puede enviar nada. */
	destinatarios: number;
	/**
	 * Tramo de la deuda MÁS ANTIGUA del servicio (excluyente), calculado sobre
	 * los comprobantes con saldo pendiente positivo. `null` si no debe nada.
	 */
	tramoAntiguedad: TramoCobranza | null;
	/** Días desde la emisión del comprobante impago más antiguo. `null` sin deuda. */
	diasDeudaMasAntigua: number | null;
	/**
	 * Alerta de mora para el indicador a la izquierda del sobre:
	 * mostaza 1-2 meses, naranja 3-4 meses, rojo más de 4 meses. `null` sin deuda.
	 */
	alertaMora: AlertaMora | null;
	/** Plazo de pago configurado para el servicio, en días. */
	cantidadDiasVencimiento: number;
	pesos: Record<string, string>;
	dolares: Record<string, string>;
	equivalentePesos: string;
	documentos: DocumentoCartera[];
}

export interface ResumenImportacionCobranza {
	periodo: string;
	creado: boolean;
	filas: number;
	importadas: number;
	actualizadas: number;
	retiradas: number;
	errores: { fila: number; mensaje: string }[];
}

export class ErrorValidacionCobranza extends Error {
	constructor(public readonly errores: { fila: number; mensaje: string }[]) {
		super('La planilla contiene validaciones pendientes');
		this.name = 'ErrorValidacionCobranza';
	}
}

const VACIO = () => ({ A_VENCER: '0', '1_30': '0', '31_60': '0', '61_90': '0', MAS_90: '0' });

function sumar(destino: Record<string, string>, tramo: string, valor: string) {
	destino[tramo] = (Number(destino[tramo] ?? 0) + Number(valor)).toFixed(2);
}

export async function listarPeriodosCobranza() {
	return db.select().from(periodosCobranza).orderBy(desc(periodosCobranza.periodo));
}

export async function listarCarteraCobranza(periodo: string, hoy: string, cotizacionOverride?: number) {
	const [periodoDb] = await db.select().from(periodosCobranza).where(eq(periodosCobranza.periodo, periodo));
	if (!periodoDb) return { periodo, cotizacionUsd: cotizacionOverride ?? 0, servicios: [] as ServicioCartera[] };

	// Contador real de envíos: solo los que el proveedor confirmó.
	const enviosDb = await db
		.select({ servicioId: enviosCobranza.servicioId, total: count() })
		.from(enviosCobranza)
		.where(eq(enviosCobranza.estado, 'ENVIADO'))
		.groupBy(enviosCobranza.servicioId);
	const enviosPorServicio = new Map(enviosDb.map((fila) => [fila.servicioId, Number(fila.total)]));

	const destinatariosDb = await db
		.select({ servicioId: serviciosEmails.servicioId, total: count() })
		.from(serviciosEmails)
		.where(and(eq(serviciosEmails.activo, true), inArray(serviciosEmails.uso, usosDeLista('COBRANZA'))))
		.groupBy(serviciosEmails.servicioId);
	const destinatariosPorServicio = new Map(
		destinatariosDb.map((fila) => [fila.servicioId, Number(fila.total)])
	);

	const filas = await db
		.select({
			documento: comprobantesCobranza,
			servicio: servicios.contactoFacturacion,
			celular: servicios.celular,
			cantidadDiasVencimiento: servicios.cantidadDiasVencimiento,
			tipoGestion: tiposGestion.nombre,
			tipoCliente: tiposCliente.nombre,
			modalidadCobranza: modalidadesCobranza.nombre,
			grupoCobranzaId: gruposCobranza.id,
			grupoCobranza: gruposCobranza.nombre,
			grupoCobranzaFondo: gruposCobranza.colorFondo,
			grupoCobranzaTexto: gruposCobranza.colorTexto,
			grupoCobranzaOrden: gruposCobranza.orden
		})
		.from(comprobantesCobranza)
		.innerJoin(servicios, eq(comprobantesCobranza.servicioId, servicios.id))
		.innerJoin(tiposGestion, eq(servicios.tipoGestionId, tiposGestion.id))
		.innerJoin(tiposCliente, eq(servicios.tipoClienteId, tiposCliente.id))
		.innerJoin(modalidadesCobranza, eq(servicios.modalidadCobranzaId, modalidadesCobranza.id))
		.leftJoin(gruposCobranza, eq(servicios.grupoCobranzaId, gruposCobranza.id))
		.where(and(eq(comprobantesCobranza.periodoId, periodoDb.id), eq(comprobantesCobranza.activo, true)))
		.orderBy(asc(servicios.contactoFacturacion), asc(comprobantesCobranza.fechaEmision));

	const agrupados = new Map<number, ServicioCartera>();
	for (const fila of filas) {
		const documento = fila.documento;
		const dias = calcularDiasAging(documento.fechaEmision, hoy);
		const tramo = tramoPorDias(dias);
		const { diasVencido, vencida } = estadoVencimiento(dias, fila.cantidadDiasVencimiento);
		const existente: ServicioCartera = agrupados.get(documento.servicioId) ?? {
			servicioId: documento.servicioId,
			servicio: fila.servicio,
			celular: fila.celular,
			tipoGestion: fila.tipoGestion,
			tipoCliente: fila.tipoCliente,
			modalidadCobranza: fila.modalidadCobranza,
			seleccionable: fila.tipoGestion.toUpperCase() === 'NORMAL',
			grupoCobranzaId: fila.grupoCobranzaId,
			grupoCobranza: fila.grupoCobranza,
			grupoCobranzaFondo: fila.grupoCobranzaFondo,
			grupoCobranzaTexto: fila.grupoCobranzaTexto,
			grupoCobranzaOrden: fila.grupoCobranzaOrden ?? 0,
			envios: enviosPorServicio.get(documento.servicioId) ?? 0,
			destinatarios: destinatariosPorServicio.get(documento.servicioId) ?? 0,
			tramoAntiguedad: null,
			diasDeudaMasAntigua: null,
			alertaMora: null,
			cantidadDiasVencimiento: fila.cantidadDiasVencimiento,
			pesos: VACIO(),
			dolares: VACIO(),
			equivalentePesos: '0.00',
			documentos: [] as DocumentoCartera[]
		};
		const saldo = Number(documento.saldoPendiente);
		if (documento.moneda.toUpperCase() === 'USD') sumar(existente.dolares, tramo, documento.saldoPendiente);
		else sumar(existente.pesos, tramo, documento.saldoPendiente);
		existente.documentos.push({
			id: documento.id,
			tipoComprobante: documento.tipoComprobante,
			serie: documento.serie,
			numero: documento.numero,
			fechaEmision: documento.fechaEmision,
			fechaVencimiento: fechaVencimientoEfectiva(documento.fechaEmision, documento.fechaVencimiento),
			moneda: documento.moneda,
			importe: documento.importe,
			saldoPendiente: documento.saldoPendiente,
			diasAging: dias,
			plazoDias: fila.cantidadDiasVencimiento,
			diasVencido,
			vencida,
			tramo,
			activo: documento.activo,
			excluidoEnvio: documento.excluidoEnvio
		});
		existente.equivalentePesos = (Number(existente.equivalentePesos) + (documento.moneda.toUpperCase() === 'USD' ? saldo * Number(cotizacionOverride ?? periodoDb.cotizacionUsd) : saldo)).toFixed(2);
		agrupados.set(documento.servicioId, existente);
	}

	// Clasificación excluyente: cada servicio cae en el tramo de su deuda más
	// antigua, para que los filtros sean mutuamente excluyentes. La alerta de
	// mora usa la misma antigüedad (desde emisión) que esos tramos.
	for (const servicio of agrupados.values()) {
		servicio.diasDeudaMasAntigua = diasDeudaMasAntigua(servicio.documentos);
		servicio.tramoAntiguedad = tramoDeudaMasAntigua(servicio.documentos);
		servicio.alertaMora = alertaMoraPorDias(servicio.diasDeudaMasAntigua);
	}

	return {
		periodo,
		cotizacionUsd: Number(cotizacionOverride ?? periodoDb.cotizacionUsd),
		servicios: [...agrupados.values()]
	};
}

export async function importarCarteraCobranza(
	periodo: string,
	cotizacionUsd: number,
	filas: FilaCobranzaImportacion[],
	usuario?: string,
	archivoNombre?: string
): Promise<ResumenImportacionCobranza> {
	const filasIncluidas = await excluirFilas(filas);
	const errores = await validarCarteraCobranza(periodo, filasIncluidas);
	if (errores.length > 0) throw new ErrorValidacionCobranza(errores);
	return db.transaction(async (tx) => {
		const [serviciosDb, tiposDb] = await Promise.all([
			tx.select({ id: servicios.id, contacto: servicios.contactoFacturacion }).from(servicios).where(isNull(servicios.eliminadoEn)),
			tx.select({ nombre: tiposComprobantes.nombre, abreviatura: tiposComprobantes.abreviatura, activo: tiposComprobantes.activo }).from(tiposComprobantes)
		]);
		const porContacto = new Map(serviciosDb.map((servicio) => [normalizarTexto(servicio.contacto), servicio.id]));
		const periodoExistente = (await tx.select().from(periodosCobranza).where(eq(periodosCobranza.periodo, periodo)))[0];
		const [periodoDb] = periodoExistente
			? await tx.update(periodosCobranza).set({ cotizacionUsd: String(cotizacionUsd), archivoNombre, creadoPor: usuario, actualizadoEn: new Date() }).where(eq(periodosCobranza.id, periodoExistente.id)).returning()
			: await tx.insert(periodosCobranza).values({ periodo, cotizacionUsd: String(cotizacionUsd), archivoNombre, creadoPor: usuario }).returning();
		const activos = await tx.select({ id: comprobantesCobranza.id, claveOrigen: comprobantesCobranza.claveOrigen, servicioId: comprobantesCobranza.servicioId }).from(comprobantesCobranza).where(and(eq(comprobantesCobranza.periodoId, periodoDb.id), eq(comprobantesCobranza.activo, true)));
		await tx.update(comprobantesCobranza).set({ activo: false, actualizadoEn: new Date() }).where(and(eq(comprobantesCobranza.periodoId, periodoDb.id), eq(comprobantesCobranza.activo, true)));
		const clavesImportadas = new Set<string>();
		let importadas = 0;
		let actualizadas = 0;
		for (const fila of filasIncluidas) {
			const servicioId = porContacto.get(normalizarTexto(fila.contacto));
			if (!servicioId) throw new Error(`Servicio no encontrado durante la importación: ${fila.contacto}`);
			const claveOrigen = fila.claveOrigen?.trim() || `${servicioId}|${fila.tipoComprobante!.trim()}|${fila.serie?.trim() ?? ''}|${fila.numero!.trim()}`;
			clavesImportadas.add(claveOrigen);
			const existente = await tx
				.select({ id: comprobantesCobranza.id, eliminadoEn: comprobantesCobranza.eliminadoEn })
				.from(comprobantesCobranza)
				.where(and(eq(comprobantesCobranza.periodoId, periodoDb.id), eq(comprobantesCobranza.claveOrigen, claveOrigen)));
			const valores = {
				periodoId: periodoDb.id,
				servicioId,
				claveOrigen,
				tipoComprobante: normalizarTipoComprobante(fila.tipoComprobante!, tiposDb)!,
				serie: fila.serie?.trim() ?? '',
				numero: fila.numero!.trim(),
				fechaEmision: fila.fechaEmision!,
				fechaVencimiento: fila.fechaVencimiento || null,
				moneda: fila.moneda.trim().toUpperCase(),
				importe: String(fila.importe),
				saldoPendiente: String(fila.saldoPendiente),
				activo: true,
				eliminadoEn: null,
				eliminadoPor: null,
				eliminadoMotivo: null,
				actualizadoEn: new Date()
			};
			if (existente[0]) {
				// Un comprobante eliminado por el usuario sigue dado de baja aunque
				// vuelva a figurar en la planilla: se actualizan los importes, no el estado.
				if (existente[0].eliminadoEn) {
					const { activo: _activo, eliminadoEn: _en, eliminadoPor: _por, eliminadoMotivo: _motivo, ...datos } = valores;
					await tx.update(comprobantesCobranza).set(datos).where(eq(comprobantesCobranza.id, existente[0].id));
				} else {
					await tx.update(comprobantesCobranza).set(valores).where(eq(comprobantesCobranza.id, existente[0].id));
				}
				actualizadas++;
			} else {
				await tx.insert(comprobantesCobranza).values(valores);
				importadas++;
			}
		}
		for (const activo of activos) {
			if (!clavesImportadas.has(activo.claveOrigen)) {
				await tx.insert(auditoriaCobranza).values({ servicioId: activo.servicioId, comprobanteId: activo.id, accion: 'RETIRADO_POR_REIMPORTACION', detalle: { periodo }, usuario });
			}
		}
		return { periodo, creado: !periodoExistente, filas: filasIncluidas.length, excluidas: filas.length - filasIncluidas.length, importadas, actualizadas, retiradas: activos.length - clavesImportadas.size, errores };
	});
}

/** Valida toda la planilla antes de abrir la transacción de escritura. */
export async function validarCarteraCobranza(periodo: string, filas: FilaCobranzaImportacion[]) {
	filas = await excluirFilas(filas);
	const corte = fechaCortePeriodo(periodo);
	const errores = validarFilasCobranza(filas, corte ?? undefined);
	if (!corte) errores.unshift({ fila: 0, mensaje: 'El período debe tener formato YYYY-MM válido' });
	const [serviciosDb, tiposDb] = await Promise.all([
		db.select({ contacto: servicios.contactoFacturacion }).from(servicios).where(isNull(servicios.eliminadoEn)),
		db.select({ nombre: tiposComprobantes.nombre, abreviatura: tiposComprobantes.abreviatura, activo: tiposComprobantes.activo }).from(tiposComprobantes)
	]);
	const contactos = new Set(serviciosDb.map((servicio) => normalizarTexto(servicio.contacto)));
	filas.forEach((fila, indice) => {
		// La planilla real arranca en la fila 6 (los encabezados están en la 5).
		const filaExcel = fila.filaExcel ?? indice + 6;
		if (fila.contacto?.trim() && !contactos.has(normalizarTexto(fila.contacto))) {
			errores.push({ fila: filaExcel, mensaje: `Servicio no encontrado: ${fila.contacto}` });
		}
		if (fila.tipoComprobante?.trim() && !normalizarTipoComprobante(fila.tipoComprobante, tiposDb)) {
			errores.push({ fila: filaExcel, mensaje: `Tipo de comprobante no reconocido: ${fila.tipoComprobante}` });
		}
	});
	return errores;
}

export async function eliminarLogicamenteComprobante(id: number, usuario?: string, motivo?: string) {
	return db.transaction(async (tx) => {
		const [documento] = await tx.select().from(comprobantesCobranza).where(eq(comprobantesCobranza.id, id));
		if (!documento) return false;
		await tx.update(comprobantesCobranza).set({ activo: false, eliminadoEn: new Date(), eliminadoPor: usuario, eliminadoMotivo: motivo ?? 'Eliminado por usuario', actualizadoEn: new Date() }).where(eq(comprobantesCobranza.id, id));
		await tx.insert(auditoriaCobranza).values({ comprobanteId: id, servicioId: documento.servicioId, accion: 'ELIMINADO_LOGICO', detalle: { motivo }, usuario });
		return true;
	});
}

/**
 * Exclusión temporal: saca el comprobante del próximo envío de estado de cuenta.
 * La marca se limpia sola cuando ese envío se completa.
 */
export async function alternarExclusionEnvio(id: number, excluido: boolean, usuario?: string) {
	const [fila] = await db
		.update(comprobantesCobranza)
		.set({
			excluidoEnvio: excluido,
			excluidoEnvioEn: excluido ? new Date() : null,
			excluidoEnvioPor: excluido ? (usuario ?? null) : null,
			actualizadoEn: new Date()
		})
		.where(eq(comprobantesCobranza.id, id))
		.returning({ id: comprobantesCobranza.id, excluidoEnvio: comprobantesCobranza.excluidoEnvio });
	if (!fila) throw new Error('Comprobante no encontrado');
	return fila;
}

/** Comprobantes dados de baja manualmente en un período, para poder restaurarlos. */
export async function listarComprobantesEliminados(periodo: string) {
	return db
		.select({
			id: comprobantesCobranza.id,
			servicioId: comprobantesCobranza.servicioId,
			servicio: servicios.contactoFacturacion,
			tipoComprobante: comprobantesCobranza.tipoComprobante,
			serie: comprobantesCobranza.serie,
			numero: comprobantesCobranza.numero,
			fechaEmision: comprobantesCobranza.fechaEmision,
			moneda: comprobantesCobranza.moneda,
			saldoPendiente: comprobantesCobranza.saldoPendiente,
			eliminadoEn: comprobantesCobranza.eliminadoEn,
			eliminadoPor: comprobantesCobranza.eliminadoPor,
			eliminadoMotivo: comprobantesCobranza.eliminadoMotivo
		})
		.from(comprobantesCobranza)
		.innerJoin(periodosCobranza, eq(comprobantesCobranza.periodoId, periodosCobranza.id))
		.innerJoin(servicios, eq(comprobantesCobranza.servicioId, servicios.id))
		.where(and(eq(periodosCobranza.periodo, periodo), isNotNull(comprobantesCobranza.eliminadoEn)))
		.orderBy(desc(comprobantesCobranza.eliminadoEn));
}

/** Revierte un borrado lógico: el comprobante vuelve a la cartera. */
export async function restaurarComprobante(id: number, usuario?: string) {
	return db.transaction(async (tx) => {
		const [documento] = await tx.select().from(comprobantesCobranza).where(eq(comprobantesCobranza.id, id));
		if (!documento) return false;
		await tx
			.update(comprobantesCobranza)
			.set({ eliminadoEn: null, eliminadoPor: null, eliminadoMotivo: null, activo: true, actualizadoEn: new Date() })
			.where(eq(comprobantesCobranza.id, id));
		await tx.insert(auditoriaCobranza).values({
			comprobanteId: id,
			servicioId: documento.servicioId,
			accion: 'RESTAURADO',
			usuario
		});
		return true;
	});
}

export interface ConfiguracionCobranza {
	copiaActiva: boolean;
	copiaEmails: string;
	copiaTipo: 'CC' | 'CCO';
}

const EMAIL_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function obtenerConfiguracionCobranza(): Promise<ConfiguracionCobranza> {
	const [fila] = await db.select().from(configuracionCobranza).where(eq(configuracionCobranza.id, 1));
	return {
		copiaActiva: fila?.copiaActiva ?? false,
		copiaEmails: fila?.copiaEmails ?? '',
		copiaTipo: fila?.copiaTipo === 'CCO' ? 'CCO' : 'CC'
	};
}

export async function guardarConfiguracionCobranza(datos: ConfiguracionCobranza): Promise<ConfiguracionCobranza> {
	const emails = listaEmails(datos.copiaEmails);
	for (const email of emails) {
		if (!EMAIL_VALIDO.test(email)) throw new Error(`Email de copia inválido: ${email}`);
	}
	if (datos.copiaActiva && emails.length === 0) {
		throw new Error('Activá la copia global solo si cargás al menos un email');
	}
	const valores = {
		copiaActiva: Boolean(datos.copiaActiva),
		copiaEmails: emails.join(', '),
		copiaTipo: datos.copiaTipo === 'CCO' ? 'CCO' : 'CC',
		actualizadoEn: new Date()
	};
	await db
		.insert(configuracionCobranza)
		.values({ id: 1, ...valores })
		.onConflictDoUpdate({ target: configuracionCobranza.id, set: valores });
	return obtenerConfiguracionCobranza();
}

/**
 * Plantilla que el detalle de cobranza propone para el envío individual.
 * `null` = sin preferencia guardada (se usa la primera activa).
 */
export async function obtenerPlantillaPredeterminadaCobranza(): Promise<number | null> {
	const [fila] = await db
		.select({ plantillaId: configuracionCobranza.plantillaPredeterminadaId })
		.from(configuracionCobranza)
		.where(eq(configuracionCobranza.id, 1));
	return fila?.plantillaId ?? null;
}

export async function guardarPlantillaPredeterminadaCobranza(plantillaId: number | null): Promise<number | null> {
	if (plantillaId !== null) {
		const [plantilla] = await db
			.select({ id: plantillasCobranza.id })
			.from(plantillasCobranza)
			.where(eq(plantillasCobranza.id, plantillaId));
		if (!plantilla) throw new Error('La plantilla no existe');
	}
	const valores = { plantillaPredeterminadaId: plantillaId, actualizadoEn: new Date() };
	await db
		.insert(configuracionCobranza)
		.values({ id: 1, ...valores })
		.onConflictDoUpdate({ target: configuracionCobranza.id, set: valores });
	return plantillaId;
}

/**
 * Copias de control interno para un envío.
 * Descarta las direcciones que ya son destinatarias para no duplicar.
 */
export async function copiasParaEnvio(destinatarios: string[]): Promise<{ cc: string[]; bcc: string[] }> {
	const config = await obtenerConfiguracionCobranza();
	return resolverCopias(
		{ activa: config.copiaActiva, emails: config.copiaEmails, tipo: config.copiaTipo },
		destinatarios
	);
}

/** Asigna el mismo grupo de cobranza a varios servicios (o los deja sin grupo). */
export async function asignarGrupoCobranza(servicioIds: number[], grupoCobranzaId: number | null) {
	if (servicioIds.length === 0) return 0;
	const filas = await db
		.update(servicios)
		.set({ grupoCobranzaId })
		.where(inArray(servicios.id, servicioIds))
		.returning({ id: servicios.id });
	return filas.length;
}

export async function listarPlantillasCobranza() {
	return db.select().from(plantillasCobranza).orderBy(asc(plantillasCobranza.nombre));
}

export async function guardarPlantillaCobranza(datos: {
	id?: number;
	nombre: string;
	asunto: string;
	cuerpo: string;
	cartaHabilitada?: boolean;
	cartaHtml?: string | null;
	cartaFondo?: string | null;
	usuario?: string;
}) {
	const texto = `${datos.asunto}\n${datos.cuerpo}\n${datos.cartaHtml ?? ''}`;
	const desconocidas = variablesDesconocidas(texto);
	if (desconocidas.length) throw new Error(`Variables no utilizables: ${desconocidas.join(', ')}`);
	if (!datos.nombre.trim() || !datos.asunto.trim() || !datos.cuerpo.trim()) throw new Error('Nombre, asunto y cuerpo son obligatorios');
	if (datos.cartaHabilitada && !datos.cartaHtml?.trim()) throw new Error('La carta HTML es obligatoria cuando el PDF está habilitado');
	// La imagen viaja como data URL ya comprimida en el navegador.
	const fondo = datos.cartaFondo?.trim() || null;
	if (fondo && !/^data:image\/(png|jpe?g|webp);base64,/i.test(fondo)) {
		throw new Error('La imagen de fondo debe ser PNG, JPG o WEBP');
	}
	if (fondo && fondo.length > 3_500_000) {
		throw new Error('La imagen de fondo es demasiado grande (máximo ~2,5 MB)');
	}
	if (datos.id) {
		const [fila] = await db.update(plantillasCobranza).set({
			nombre: datos.nombre.trim(), asunto: datos.asunto.trim(), cuerpo: datos.cuerpo, cartaHabilitada: Boolean(datos.cartaHabilitada), cartaHtml: datos.cartaHtml ?? null, cartaFondo: fondo, actualizadoEn: new Date()
		}).where(eq(plantillasCobranza.id, datos.id)).returning();
		return fila;
	}
	const [fila] = await db.insert(plantillasCobranza).values({
		nombre: datos.nombre.trim(), asunto: datos.asunto.trim(), cuerpo: datos.cuerpo, cartaHabilitada: Boolean(datos.cartaHabilitada), cartaHtml: datos.cartaHtml ?? null, cartaFondo: fondo, creadoPor: datos.usuario
	}).returning();
	return fila;
}
