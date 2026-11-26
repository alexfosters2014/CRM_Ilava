import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import {
	articulos,
	db,
	facturas,
	facturaLineas,
	gruposFacturacion,
	modalidadesCobranza,
	monedas,
	plantillas,
	plantillasLineas,
	servicios,
	tiposCliente,
	tiposComprobantes,
	tiposGestion,
	tiposGestionFacturacion,
	tiposPrecios
} from '../base-datos/index.ts';
import { resolverArticulo, ErrorArticuloInexistente } from '../servicios/articulos.ts';
import {
	sustituirVariables,
	variablesFaltantes,
	crearSnapshotVariables,
	textosDesdeSnapshot
} from '../servicios/variables.ts';
import type { SnapshotVariables } from '../servicios/variables.ts';

/**
 * Repositorio: facturas del multifacturador.
 *
 * La factura es una COPIA de la plantilla: servicios, moneda, importes y
 * comentarios quedan congelados en el momento del envío. La plantilla original
 * no se modifica nunca desde acá.
 */

export interface LineaFacturaListado {
	id: number;
	articuloId: number;
	codigo: string;
	descripcion: string;
	cantidad: string;
	importeUnitario: string;
	detalle: string | null;
	comentario: string | null;
}

export interface FacturaListado {
	id: number;
	grupoId: number;
	grupoNombre: string;
	grupoColorFondo: string;
	grupoColorTexto: string;
	plantillaId: number;
	periodo: string;
	contactoFacturacion: string;
	nombreFantasia: string | null;
	numeracion: string | null;
	tipoNumeracion: string;
	tipoGestion: string;
	tipoCliente: string;
	modalidadCobranza: string;
	tipoGestionFacturacion: string;
	comentarioGestionFacturacion: string | null;
	moneda: string;
	tipoComprobante: string | null;
	tipoPrecio: string | null;
	idCliente: number | null;
	fecha: string | null;
	estado: string;
	motivoPendiente: string | null;
	facturadoEn: string | null;
	facturadoPor: string | null;
	facturadoVisto: boolean;
	serie: string | null;
	numero: string | null;
	comentarioGeneral: string | null;
	ordenManual: number | null;
	idCompra: string | null;
	detalleAuxiliar: string | null;
	uteVencimiento: string | null;
	informacionAdicional: string | null;
	lineas: LineaFacturaListado[];
}

export interface ResumenCopia {
	facturasCreadas: number;
	omitidas: number;
}

/** No se pudo aplicar la operación pedida sobre la factura. */
export class ErrorFactura extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'ErrorFactura';
	}
}

/** El código de artículo tipeado no existe en el catálogo. */
export { ErrorArticuloInexistente } from '../servicios/articulos.ts';

/** Faltan valores de variables para poder sustituir los comentarios. */
export class ErrorVariablesFaltantes extends Error {
	readonly faltantes: string[];

	constructor(faltantes: string[]) {
		super(`Faltan valores para las variables: ${faltantes.join(', ')}`);
		this.name = 'ErrorVariablesFaltantes';
		this.faltantes = faltantes;
	}
}

/** Lista las facturas vivas, opcionalmente filtradas por estado. */
export async function listarFacturas(estados?: string[]): Promise<FacturaListado[]> {
	const filas = await db
		.select({
			factura: facturas,
			grupoNombre: gruposFacturacion.nombre,
			grupoColorFondo: gruposFacturacion.colorFondo,
			grupoColorTexto: gruposFacturacion.colorTexto
		})
		.from(facturas)
		.leftJoin(gruposFacturacion, eq(facturas.grupoId, gruposFacturacion.id))
		.where(
			and(
				isNull(facturas.eliminadoEn),
				estados && estados.length > 0 ? inArray(facturas.estado, estados) : undefined
			)
		)
		.orderBy(asc(facturas.id));

	if (filas.length === 0) return [];

	const lineas = await db
		.select()
		.from(facturaLineas)
		.where(
			inArray(
				facturaLineas.facturaId,
				filas.map((fila) => fila.factura.id)
			)
		)
		.orderBy(asc(facturaLineas.id));

	const lineasPorFactura = new Map<number, LineaFacturaListado[]>();
	for (const linea of lineas) {
		const lista = lineasPorFactura.get(linea.facturaId) ?? [];
		lista.push({
			id: linea.id,
			articuloId: linea.articuloId,
			codigo: linea.codigo,
			descripcion: linea.descripcion,
			cantidad: linea.cantidad,
			importeUnitario: linea.importeUnitario,
			detalle: linea.detalle,
			comentario: linea.comentario
		});
		lineasPorFactura.set(linea.facturaId, lista);
	}

	return filas.map(({ factura: fila, grupoNombre, grupoColorFondo, grupoColorTexto }) => ({
		id: fila.id,
		grupoId: fila.grupoId,
		grupoNombre: grupoNombre ?? 'Sin grupo',
		grupoColorFondo: grupoColorFondo ?? '#3346b8',
		grupoColorTexto: grupoColorTexto ?? '#ffffff',
		plantillaId: fila.plantillaId,
		periodo: fila.periodo,
		contactoFacturacion: fila.contactoFacturacion,
		nombreFantasia: fila.nombreFantasia,
		numeracion: fila.numeracion,
		tipoNumeracion: fila.tipoNumeracion,
		tipoGestion: fila.tipoGestion,
		tipoCliente: fila.tipoCliente,
		modalidadCobranza: fila.modalidadCobranza,
		tipoGestionFacturacion: fila.tipoGestionFacturacion,
		comentarioGestionFacturacion: fila.comentarioGestionFacturacion,
		moneda: fila.moneda,
		tipoComprobante: fila.tipoComprobante,
		tipoPrecio: fila.tipoPrecio,
		idCliente: fila.idCliente,
		fecha: fila.fecha,
		estado: fila.estado,
		motivoPendiente: fila.motivoPendiente,
		facturadoEn: fila.facturadoEn ? fila.facturadoEn.toISOString() : null,
		facturadoPor: fila.facturadoPor,
		facturadoVisto: fila.facturadoVisto,
		serie: fila.serie,
		numero: fila.numero,
		comentarioGeneral: fila.comentarioGeneral,
		ordenManual: fila.ordenManual,
		idCompra: fila.idCompra,
		detalleAuxiliar: fila.detalleAuxiliar,
		uteVencimiento: fila.uteVencimiento,
		informacionAdicional: fila.informacionAdicional,
		lineas: lineasPorFactura.get(fila.id) ?? []
	}));
}

/**
 * Copia las plantillas indicadas al Facturador para el período elegido.
 *
 * La cabecera se copia completa (incluida `serie`): si se agrega un campo
 * editable a la plantilla, hay que sumarlo también acá.
 */
export async function crearDesdePlantillas(
	plantillaIds: number[],
	periodo: string,
	fecha: string
): Promise<ResumenCopia> {
	return db.transaction(async (tx) => {
		const cabeceras = await tx
			.select({
				id: plantillas.id,
				grupoId: servicios.grupoId,
				servicioId: plantillas.servicioId,
				contactoFacturacion: servicios.contactoFacturacion,
				nombreFantasia: servicios.nombreFantasia,
				numeracion: servicios.numeracion,
				tipoNumeracion: servicios.tipoNumeracion,
				tipoGestion: tiposGestion.nombre,
				tipoCliente: tiposCliente.nombre,
				modalidadCobranza: modalidadesCobranza.nombre,
				tipoGestionFacturacion: tiposGestionFacturacion.nombre,
				comentarioGestionFacturacion: servicios.comentarioGestionFacturacion,
				moneda: monedas.codigo,
				tipoComprobante: tiposComprobantes.nombre,
				tipoPrecio: tiposPrecios.nombre,
				idCliente: plantillas.idCliente,
				serie: plantillas.serie,
				comentarioGeneral: plantillas.comentarioGeneral,
				idCompra: plantillas.idCompra,
				detalleAuxiliar: plantillas.detalleAuxiliar,
				uteVencimiento: plantillas.uteVencimiento,
				informacionAdicional: plantillas.informacionAdicional
			})
			.from(plantillas)
			.innerJoin(servicios, eq(plantillas.servicioId, servicios.id))
			.leftJoin(tiposGestion, eq(servicios.tipoGestionId, tiposGestion.id))
			.leftJoin(tiposCliente, eq(servicios.tipoClienteId, tiposCliente.id))
			.leftJoin(modalidadesCobranza, eq(servicios.modalidadCobranzaId, modalidadesCobranza.id))
			.leftJoin(
				tiposGestionFacturacion,
				eq(servicios.tipoGestionFacturacionId, tiposGestionFacturacion.id)
			)
			.leftJoin(monedas, eq(plantillas.monedaId, monedas.id))
			.leftJoin(tiposComprobantes, eq(plantillas.tipoComprobanteId, tiposComprobantes.id))
			.leftJoin(tiposPrecios, eq(plantillas.tipoPrecioId, tiposPrecios.id))
			.where(and(inArray(plantillas.id, plantillaIds), isNull(plantillas.eliminadoEn)));

		if (cabeceras.length === 0) {
			throw new ErrorFactura('Las plantillas seleccionadas ya no existen');
		}

		const lineas = await tx
			.select({
				plantillaId: plantillasLineas.plantillaId,
				articuloId: plantillasLineas.articuloId,
				codigo: articulos.codigo,
				descripcion: articulos.descripcion,
				cantidad: plantillasLineas.cantidad,
				importeUnitario: plantillasLineas.importeUnitario,
				detalle: plantillasLineas.detalle,
				comentario: plantillasLineas.comentario
			})
			.from(plantillasLineas)
			.innerJoin(articulos, eq(plantillasLineas.articuloId, articulos.id))
			.where(inArray(plantillasLineas.plantillaId, plantillaIds))
			.orderBy(asc(plantillasLineas.id));

		// Ya copiadas para ese período: no se duplican.
		const existentes = await tx
			.select({ plantillaId: facturas.plantillaId })
			.from(facturas)
			.where(and(inArray(facturas.plantillaId, plantillaIds), eq(facturas.periodo, periodo), isNull(facturas.eliminadoEn)));
		const yaCopiadas = new Set(existentes.map((fila) => fila.plantillaId));

		let facturasCreadas = 0;
		let omitidas = 0;

		for (const cabecera of cabeceras) {
			if (yaCopiadas.has(cabecera.id)) {
				omitidas += 1;
				continue;
			}

			const [creada] = await tx
				.insert(facturas)
				.values({
					grupoId: cabecera.grupoId,
					plantillaId: cabecera.id,
					periodo,
					servicioId: cabecera.servicioId,
					contactoFacturacion: cabecera.contactoFacturacion,
					nombreFantasia: cabecera.nombreFantasia,
					numeracion: cabecera.numeracion,
					tipoNumeracion: cabecera.tipoNumeracion ?? 'SIN_NUMERACION',
					tipoGestion: cabecera.tipoGestion ?? 'NORMAL',
					tipoCliente: cabecera.tipoCliente ?? 'EMPRESA',
					modalidadCobranza: cabecera.modalidadCobranza ?? 'TRANSFERENCIA',
					tipoGestionFacturacion: cabecera.tipoGestionFacturacion ?? 'NORMAL',
					comentarioGestionFacturacion: cabecera.comentarioGestionFacturacion,
					moneda: cabecera.moneda ?? '$',
					tipoComprobante: cabecera.tipoComprobante,
					tipoPrecio: cabecera.tipoPrecio,
					idCliente: cabecera.idCliente,
					fecha,
					serie: cabecera.serie,
					comentarioGeneral: cabecera.comentarioGeneral,
					idCompra: cabecera.idCompra,
					detalleAuxiliar: cabecera.detalleAuxiliar,
					uteVencimiento: cabecera.uteVencimiento,
					informacionAdicional: cabecera.informacionAdicional,
					estado: 'PROCESO'
				})
				.returning({ id: facturas.id });

			const lineasFactura = lineas.filter((linea) => linea.plantillaId === cabecera.id);
			if (lineasFactura.length > 0) {
				await tx.insert(facturaLineas).values(
					lineasFactura.map((linea) => ({
						facturaId: creada.id,
						articuloId: linea.articuloId,
						codigo: linea.codigo,
						descripcion: linea.descripcion,
						cantidad: linea.cantidad,
						importeUnitario: linea.importeUnitario,
						detalle: linea.detalle,
						comentario: linea.comentario
					}))
				);
			}

			facturasCreadas += 1;
		}

		return { facturasCreadas, omitidas };
	});
}

/** Actualiza la cabecera editable de una factura. */
export async function actualizarFactura(
	id: number,
	cambios: {
		comentarioGeneral?: string | null;
		moneda?: '$' | 'USD';
		tipoComprobante?: string | null;
		tipoPrecio?: string | null;
		idCliente?: number | null;
		fecha?: string | null;
		serie?: string | null;
		numero?: string | null;
		ordenManual?: number | null;
		idCompra?: string | null;
		detalleAuxiliar?: string | null;
		uteVencimiento?: string | null;
		informacionAdicional?: string | null;
	}
): Promise<number | undefined> {
	const [actualizada] = await db
		.update(facturas)
		.set({ ...cambios, actualizadoEn: new Date() })
		.where(and(eq(facturas.id, id), isNull(facturas.eliminadoEn)))
		.returning({ id: facturas.id });
	return actualizada?.id;
}

/**
 * Edita una línea de la factura. Si cambia el código, se resuelve contra el
 * catálogo de artículos: un código inexistente no se guarda.
 */
export async function actualizarLinea(
	facturaId: number,
	lineaId: number,
	cambios: {
		codigo?: string;
		cantidad?: number;
		importeUnitario?: number;
		detalle?: string | null;
		comentario?: string | null;
	}
): Promise<LineaFacturaListado | undefined> {
	const cambiosDb: Partial<typeof facturaLineas.$inferInsert> = {};

	if (cambios.codigo !== undefined) {
		const codigo = cambios.codigo.trim();
		const [articulo] = await db
			.select({ id: articulos.id, codigo: articulos.codigo, descripcion: articulos.descripcion })
			.from(articulos)
			.where(eq(articulos.codigo, codigo))
			.limit(1);

		if (!articulo) throw new ErrorArticuloInexistente(codigo);

		cambiosDb.articuloId = articulo.id;
		cambiosDb.codigo = articulo.codigo;
		cambiosDb.descripcion = articulo.descripcion;
	}

	if (cambios.cantidad !== undefined) cambiosDb.cantidad = String(cambios.cantidad);
	if (cambios.importeUnitario !== undefined) cambiosDb.importeUnitario = String(cambios.importeUnitario);
	if (cambios.detalle !== undefined) cambiosDb.detalle = cambios.detalle;
	if (cambios.comentario !== undefined) cambiosDb.comentario = cambios.comentario;

	if (Object.keys(cambiosDb).length === 0) return undefined;

	const [actualizada] = await db
		.update(facturaLineas)
		.set(cambiosDb)
		.where(and(eq(facturaLineas.id, lineaId), eq(facturaLineas.facturaId, facturaId)))
		.returning();

	if (!actualizada) return undefined;

	await db
		.update(facturas)
		.set({ actualizadoEn: new Date() })
		.where(eq(facturas.id, facturaId));

	return {
		id: actualizada.id,
		articuloId: actualizada.articuloId,
		codigo: actualizada.codigo,
		descripcion: actualizada.descripcion,
		cantidad: actualizada.cantidad,
		importeUnitario: actualizada.importeUnitario,
		detalle: actualizada.detalle,
		comentario: actualizada.comentario
	};
}

/** Estados en los que una factura todavía se puede editar. */
const ESTADOS_EDITABLES = new Set(['PROCESO', 'PENDIENTE']);

async function facturaEditable(id: number) {
	const [factura] = await db
		.select({ id: facturas.id, estado: facturas.estado })
		.from(facturas)
		.where(and(eq(facturas.id, id), isNull(facturas.eliminadoEn)))
		.limit(1);

	if (!factura) throw new ErrorFactura('La factura no existe');
	if (!ESTADOS_EDITABLES.has(factura.estado)) {
		throw new ErrorFactura('La factura ya fue enviada a Bandeja y no se puede modificar');
	}
	return factura;
}

/**
 * Agrega una línea de facturación a la factura. La línea nace y muere en la
 * factura: no modifica la plantilla de origen.
 */
export async function agregarLinea(
	facturaId: number,
	datos: {
		codigo: string;
		cantidad: number;
		importeUnitario: number;
		detalle?: string | null;
		comentario?: string | null;
	}
): Promise<LineaFacturaListado> {
	await facturaEditable(facturaId);

	const articulo = await resolverArticulo(datos.codigo);

	const [creada] = await db
		.insert(facturaLineas)
		.values({
			facturaId,
			articuloId: articulo.id,
			codigo: articulo.codigo,
			descripcion: articulo.descripcion,
			cantidad: String(datos.cantidad),
			importeUnitario: String(datos.importeUnitario),
			detalle: datos.detalle ?? null,
			comentario: datos.comentario ?? null
		})
		.returning();

	await db.update(facturas).set({ actualizadoEn: new Date() }).where(eq(facturas.id, facturaId));

	return {
		id: creada.id,
		articuloId: creada.articuloId,
		codigo: creada.codigo,
		descripcion: creada.descripcion,
		cantidad: creada.cantidad,
		importeUnitario: creada.importeUnitario,
		detalle: creada.detalle,
		comentario: creada.comentario
	};
}

/**
 * Elimina una línea de la factura de forma DEFINITIVA. La factura no puede
 * quedar sin líneas.
 */
export async function eliminarLineaDefinitivo(facturaId: number, lineaId: number): Promise<void> {
	await facturaEditable(facturaId);

	const lineas = await db
		.select({ id: facturaLineas.id })
		.from(facturaLineas)
		.where(eq(facturaLineas.facturaId, facturaId));

	if (lineas.length <= 1) {
		throw new ErrorFactura('La factura tiene que tener al menos una línea');
	}

	const borradas = await db
		.delete(facturaLineas)
		.where(and(eq(facturaLineas.id, lineaId), eq(facturaLineas.facturaId, facturaId)))
		.returning({ id: facturaLineas.id });

	if (borradas.length === 0) throw new ErrorFactura('La línea no existe');

	await db.update(facturas).set({ actualizadoEn: new Date() }).where(eq(facturas.id, facturaId));
}

/**
 * Mueve la factura de estado.
 *
 * - PENDIENTE exige el motivo.
 * - BANDEJA exige fecha y sustituye todas las variables de los comentarios.
 * - FACTURADO y COBRADO no piden datos extra (el facturador real es externo).
 */
export async function cambiarEstado(
	id: number,
	cambio: {
		estado: 'PROCESO' | 'PENDIENTE' | 'BANDEJA' | 'FACTURADO' | 'COBRADO';
		motivo?: string | null;
		fecha?: string | null;
		variables?: Record<string, string>;
	}
): Promise<void> {
	const [factura] = await db
		.select()
		.from(facturas)
		.where(and(eq(facturas.id, id), isNull(facturas.eliminadoEn)))
		.limit(1);

	if (!factura) throw new ErrorFactura('La factura no existe');
	if (factura.estado === 'ELIMINADO') throw new ErrorFactura('La factura está eliminada');

	if (cambio.estado === 'PENDIENTE' && !cambio.motivo?.trim()) {
		throw new ErrorFactura('Para pasar a PENDIENTE hay que indicar el motivo');
	}

	if (cambio.estado !== 'BANDEJA') {
		const ahora = new Date();
		await db
			.update(facturas)
			.set({
				estado: cambio.estado,
				motivoPendiente: cambio.estado === 'PENDIENTE' ? cambio.motivo?.trim() : null,
				// El envío a facturar queda sellado para el histórico de la Bandeja.
				...(cambio.estado === 'FACTURADO'
					? { facturadoEn: ahora, facturadoPor: 'MANUAL', facturadoVisto: false }
					: {}),
				actualizadoEn: ahora
			})
			.where(eq(facturas.id, id));
		return;
	}

	// La fecha global se carga al enviar al Facturador y se puede editar ahí; si
	// por algún motivo falta, se exige en el pasaje a Bandeja.
	const fecha = cambio.fecha ?? factura.fecha;
	if (!fecha) throw new ErrorFactura('La factura no tiene fecha: cargala antes de pasarla a Bandeja');

	const lineas = await db.select().from(facturaLineas).where(eq(facturaLineas.facturaId, id));
	const textos = [
		factura.comentarioGeneral,
		factura.detalleAuxiliar,
		factura.informacionAdicional,
		...lineas.flatMap((linea) => [linea.detalle, linea.comentario])
	];
	const valores = cambio.variables ?? {};

	const faltantes = variablesFaltantes(textos, valores);
	if (faltantes.length > 0) throw new ErrorVariablesFaltantes(faltantes);

	// Copia de los textos ANTES de sustituir: permite restaurar los `{{clave}}`
	// exactos si la factura vuelve de la Bandeja al Facturador.
	const snapshot = crearSnapshotVariables(
		{
			comentarioGeneral: factura.comentarioGeneral,
			detalleAuxiliar: factura.detalleAuxiliar,
			informacionAdicional: factura.informacionAdicional
		},
		lineas.map((linea) => ({ id: linea.id, detalle: linea.detalle, comentario: linea.comentario })),
		valores
	);

	await db.transaction(async (tx) => {
		await tx
			.update(facturas)
			.set({
				estado: 'BANDEJA',
				fecha,
				motivoPendiente: null,
				comentarioGeneral: sustituirVariables(factura.comentarioGeneral, valores),
				detalleAuxiliar: sustituirVariables(factura.detalleAuxiliar, valores),
				informacionAdicional: sustituirVariables(factura.informacionAdicional, valores),
				variablesSnapshot: snapshot,
				actualizadoEn: new Date()
			})
			.where(eq(facturas.id, id));

		for (const linea of lineas) {
			await tx
				.update(facturaLineas)
				.set({
					detalle: sustituirVariables(linea.detalle, valores),
					comentario: sustituirVariables(linea.comentario, valores)
				})
				.where(eq(facturaLineas.id, linea.id));
		}
	});
}

/**
 * Devuelve facturas de la Bandeja al Facturador.
 *
 * Solo las que están en BANDEJA: pasan a PROCESO, pierden el motivo pendiente y
 * el orden manual (si vuelven, entran al final de la cola). Si al pasar a
 * Bandeja se guardó el snapshot de variables, restaura los textos originales
 * con los `{{clave}}` y descarta el snapshot.
 */
export async function devolverAFacturador(ids: number[]): Promise<number> {
	if (ids.length === 0) return 0;

	return db.transaction(async (tx) => {
		const filas = await tx
			.select({ id: facturas.id, variablesSnapshot: facturas.variablesSnapshot })
			.from(facturas)
			.where(
				and(inArray(facturas.id, ids), eq(facturas.estado, 'BANDEJA'), isNull(facturas.eliminadoEn))
			);

		for (const fila of filas) {
			const snapshot = fila.variablesSnapshot as SnapshotVariables | null;
			const textos = snapshot ? textosDesdeSnapshot(snapshot) : null;

			await tx
				.update(facturas)
				.set({
					estado: 'PROCESO',
					motivoPendiente: null,
					ordenManual: null,
					...(textos
						? {
								comentarioGeneral: textos.comentarioGeneral,
								detalleAuxiliar: textos.detalleAuxiliar,
								informacionAdicional: textos.informacionAdicional
							}
						: {}),
					variablesSnapshot: null,
					actualizadoEn: new Date()
				})
				.where(eq(facturas.id, fila.id));

			if (!textos) continue;

			for (const linea of textos.lineas) {
				await tx
					.update(facturaLineas)
					.set({ detalle: linea.detalle, comentario: linea.comentario })
					.where(and(eq(facturaLineas.id, linea.id), eq(facturaLineas.facturaId, fila.id)));
			}
		}

		return filas.length;
	});
}

/**
 * Marca como FACTURADO las facturas exportadas. Solo aplica a las que están en
 * BANDEJA, así la operación es idempotente y no toca estados posteriores.
 */
export async function marcarFacturadas(
	ids: number[],
	canal: 'MULTIFACTURACION' | 'API' = 'MULTIFACTURACION'
): Promise<number> {
	if (ids.length === 0) return 0;

	const ahora = new Date();
	const marcadas = await db
		.update(facturas)
		.set({
			estado: 'FACTURADO',
			motivoPendiente: null,
			facturadoEn: ahora,
			facturadoPor: canal,
			facturadoVisto: false,
			actualizadoEn: ahora
		})
		.where(
			and(inArray(facturas.id, ids), eq(facturas.estado, 'BANDEJA'), isNull(facturas.eliminadoEn))
		)
		.returning({ id: facturas.id });

	return marcadas.length;
}

/**
 * Marca como "vistos" los envíos a facturar: dejan de aparecer en el modal.
 * No borra nada, solo oculta el registro del histórico.
 */
export async function marcarEnviosVistos(ids: number[]): Promise<number> {
	if (ids.length === 0) return 0;

	const marcadas = await db
		.update(facturas)
		.set({ facturadoVisto: true })
		.where(and(inArray(facturas.id, ids), isNull(facturas.eliminadoEn)))
		.returning({ id: facturas.id });

	return marcadas.length;
}

/** Borrado lógico por lote: la factura queda como ELIMINADO. */
export async function eliminarFacturas(ids: number[]): Promise<number> {
	if (ids.length === 0) return 0;

	const ahora = new Date();
	const eliminadas = await db
		.update(facturas)
		.set({ estado: 'ELIMINADO', eliminadoEn: ahora, actualizadoEn: ahora })
		.where(and(inArray(facturas.id, ids), isNull(facturas.eliminadoEn)))
		.returning({ id: facturas.id });

	return eliminadas.length;
}
