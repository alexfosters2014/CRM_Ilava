import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import {
	articulos,
	db,
	gruposFacturacion,
	monedas,
	plantillas,
	plantillasLineas,
	servicios,
	tiposComprobantes,
	tiposPrecios
} from '../base-datos/index.ts';
import { normalizarOpcional, normalizarTexto } from '../servicios/normalizar.ts';
import { resolverArticulo } from '../servicios/articulos.ts';
import { ErrorCatalogosFaltantes, faltantesCatalogosPlantillas } from '../servicios/importaciones.ts';
import type { FilaImportacion } from '../validaciones/plantillas.ts';

/**
 * Repositorio: plantillas de facturación.
 *
 * La plantilla es el conjunto de líneas que se factura a un servicio. Los
 * catálogos se resuelven contra los existentes (no se auto-crean) y el servicio
 * tiene que existir: si no, la fila se omite y se informa.
 */

export interface LineaListado {
	id: number;
	articuloId: number;
	codigo: string;
	articulo: string;
	detalle: string | null;
	cantidad: string;
	importeUnitario: string;
	comentario: string | null;
}

/** No se pudo aplicar la operación pedida sobre la plantilla. */
export class ErrorPlantilla extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'ErrorPlantilla';
	}
}

/** El código de artículo tipeado no existe en el catálogo. */
export { ErrorArticuloInexistente } from '../servicios/articulos.ts';

export interface PlantillaListado {
	id: number;
	servicioId: number;
	contactoFacturacion: string;
	agrupador: string;
	fecha: string | null;
	serie: string | null;
	monedaId: number | null;
	tipoComprobanteId: number | null;
	tipoPrecioId: number | null;
	moneda: string | null;
	tipoComprobante: string | null;
	tipoPrecio: string | null;
	idCliente: number | null;
	comentarioGeneral: string | null;
	idCompra: string | null;
	detalleAuxiliar: string | null;
	uteVencimiento: string | null;
	informacionAdicional: string | null;
	lineas: LineaListado[];
}

export interface GrupoListado {
	id: number;
	nombre: string;
	colorFondo: string;
	colorTexto: string;
	plantillas: PlantillaListado[];
}

export interface ServicioOmitido {
	contacto: string;
	motivo: 'NO_EXISTE' | 'DESHABILITADO';
}

export interface ResumenImportacion {
	filas: number;
	plantillasNuevas: number;
	plantillasReutilizadas: number;
	lineasInsertadas: number;
	serviciosOmitidos: ServicioOmitido[];
}

/** Lista las plantillas agrupadas por grupo de facturación (heredado del servicio). */
export async function listarPlantillas(): Promise<GrupoListado[]> {
	const filasPlantillas = await db
		.select({
			id: plantillas.id,
			servicioId: servicios.id,
			contactoFacturacion: servicios.contactoFacturacion,
			agrupador: plantillas.agrupador,
			fecha: plantillas.fecha,
			serie: plantillas.serie,
			comentarioGeneral: plantillas.comentarioGeneral,
			idCompra: plantillas.idCompra,
			detalleAuxiliar: plantillas.detalleAuxiliar,
			uteVencimiento: plantillas.uteVencimiento,
			informacionAdicional: plantillas.informacionAdicional,
			grupoId: servicios.grupoId,
			grupoNombre: gruposFacturacion.nombre,
			grupoColorFondo: gruposFacturacion.colorFondo,
			grupoColorTexto: gruposFacturacion.colorTexto,
			monedaId: plantillas.monedaId,
			tipoComprobanteId: plantillas.tipoComprobanteId,
			tipoPrecioId: plantillas.tipoPrecioId,
			moneda: monedas.codigo,
			tipoComprobante: tiposComprobantes.nombre,
			tipoPrecio: tiposPrecios.nombre,
			idCliente: plantillas.idCliente
		})
		.from(plantillas)
		.innerJoin(servicios, eq(plantillas.servicioId, servicios.id))
		.innerJoin(gruposFacturacion, eq(servicios.grupoId, gruposFacturacion.id))
		.leftJoin(monedas, eq(plantillas.monedaId, monedas.id))
		.leftJoin(tiposComprobantes, eq(plantillas.tipoComprobanteId, tiposComprobantes.id))
		.leftJoin(tiposPrecios, eq(plantillas.tipoPrecioId, tiposPrecios.id))
		.where(and(isNull(plantillas.eliminadoEn), isNull(servicios.eliminadoEn)))
		.orderBy(asc(plantillas.id));

	if (filasPlantillas.length === 0) return [];

	const lineas = await db
		.select({
			id: plantillasLineas.id,
			plantillaId: plantillasLineas.plantillaId,
			articuloId: plantillasLineas.articuloId,
			codigo: articulos.codigo,
			articulo: articulos.descripcion,
			detalle: plantillasLineas.detalle,
			cantidad: plantillasLineas.cantidad,
			importeUnitario: plantillasLineas.importeUnitario,
			comentario: plantillasLineas.comentario
		})
		.from(plantillasLineas)
		.innerJoin(articulos, eq(plantillasLineas.articuloId, articulos.id))
		.where(
			inArray(
				plantillasLineas.plantillaId,
				filasPlantillas.map((p) => p.id)
			)
		)
		.orderBy(asc(plantillasLineas.id));

	const lineasPorPlantilla = new Map<number, LineaListado[]>();
	for (const linea of lineas) {
		const lista = lineasPorPlantilla.get(linea.plantillaId) ?? [];
		lista.push({
			id: linea.id,
			articuloId: linea.articuloId,
			codigo: linea.codigo,
			articulo: linea.articulo,
			detalle: linea.detalle,
			cantidad: linea.cantidad,
			importeUnitario: linea.importeUnitario,
			comentario: linea.comentario
		});
		lineasPorPlantilla.set(linea.plantillaId, lista);
	}

	const grupos = new Map<number, GrupoListado>();
	for (const fila of filasPlantillas) {
		const plantilla: PlantillaListado = {
			id: fila.id,
			servicioId: fila.servicioId,
			contactoFacturacion: fila.contactoFacturacion,
			agrupador: fila.agrupador,
			fecha: fila.fecha,
			serie: fila.serie,
			monedaId: fila.monedaId,
			tipoComprobanteId: fila.tipoComprobanteId,
			tipoPrecioId: fila.tipoPrecioId,
			moneda: fila.moneda,
			tipoComprobante: fila.tipoComprobante,
			tipoPrecio: fila.tipoPrecio,
			idCliente: fila.idCliente,
			comentarioGeneral: fila.comentarioGeneral,
			idCompra: fila.idCompra,
			detalleAuxiliar: fila.detalleAuxiliar,
			uteVencimiento: fila.uteVencimiento,
			informacionAdicional: fila.informacionAdicional,
			lineas: lineasPorPlantilla.get(fila.id) ?? []
		};

		const grupo = grupos.get(fila.grupoId);
		if (grupo) {
			grupo.plantillas.push(plantilla);
		} else {
			grupos.set(fila.grupoId, {
				id: fila.grupoId,
				nombre: fila.grupoNombre ?? 'Sin grupo',
				colorFondo: fila.grupoColorFondo ?? '#3346b8',
				colorTexto: fila.grupoColorTexto ?? '#ffffff',
				plantillas: [plantilla]
			});
		}
	}

	return [...grupos.values()];
}

/** Construye un índice `texto normalizado -> id` a partir de filas de catálogo. */
function indexar(filas: { id: number; nombre: string }[]): Map<string, number> {
	const mapa = new Map<string, number>();
	for (const fila of filas) mapa.set(normalizarTexto(fila.nombre), fila.id);
	return mapa;
}

/**
 * Importa filas de la planilla mensual.
 *
 * Reglas:
 * - Los catálogos (moneda, tipo de comprobante, tipo de precio, artículo) se
 *   resuelven contra los existentes; un valor faltante rechaza el archivo.
 * - El servicio se busca por contacto. Si no existe o está deshabilitado, la
 *   fila NO se importa y se informa en `serviciosOmitidos`.
 * - Las líneas se agrupan en plantillas por (servicio, número agrupador).
 * - Reimportar no duplica: se reutilizan y se reemplazan sus líneas.
 */
export async function importarPlantillas(filas: FilaImportacion[]): Promise<ResumenImportacion> {
	return db.transaction(async (tx) => {
		const resumen: ResumenImportacion = {
			filas: filas.length,
			plantillasNuevas: 0,
			plantillasReutilizadas: 0,
			lineasInsertadas: 0,
			serviciosOmitidos: []
		};

		const [monedasDb, comprobantesDb, preciosDb, articulosDb] = await Promise.all([
			tx.select({ id: monedas.id, nombre: monedas.codigo, activo: monedas.activo }).from(monedas),
			tx
				.select({ id: tiposComprobantes.id, nombre: tiposComprobantes.nombre, activo: tiposComprobantes.activo })
				.from(tiposComprobantes),
			tx.select({ id: tiposPrecios.id, nombre: tiposPrecios.nombre, activo: tiposPrecios.activo }).from(tiposPrecios),
			tx.select({ id: articulos.id, nombre: articulos.codigo, activo: articulos.activo }).from(articulos)
		]);

		// Validación de catálogos: no se crean valores y los deshabilitados no cuentan.
		const faltantes = faltantesCatalogosPlantillas(filas, {
			moneda: new Set(monedasDb.filter((fila) => fila.activo).map((fila) => normalizarTexto(fila.nombre))),
			comprobante: new Set(
				comprobantesDb.filter((fila) => fila.activo).map((fila) => normalizarTexto(fila.nombre))
			),
			precio: new Set(preciosDb.filter((fila) => fila.activo).map((fila) => normalizarTexto(fila.nombre))),
			articulo: new Set(articulosDb.filter((fila) => fila.activo).map((fila) => normalizarTexto(fila.nombre)))
		});
		if (Object.keys(faltantes).length > 0) throw new ErrorCatalogosFaltantes(faltantes);

		const monedasMap = indexar(monedasDb.filter((fila) => fila.activo));
		const comprobantesMap = indexar(comprobantesDb.filter((fila) => fila.activo));
		const preciosMap = indexar(preciosDb.filter((fila) => fila.activo));
		const articulosPorCodigo = indexar(articulosDb.filter((fila) => fila.activo));

		// Servicios existentes por nombre normalizado.
		const serviciosDb = await tx
			.select({ id: servicios.id, contactoFacturacion: servicios.contactoFacturacion, habilitado: servicios.habilitado })
			.from(servicios)
			.where(isNull(servicios.eliminadoEn));
		const serviciosPorNombre = new Map<string, { id: number; habilitado: boolean }>();
		for (const servicio of serviciosDb) {
			serviciosPorNombre.set(normalizarTexto(servicio.contactoFacturacion), {
				id: servicio.id,
				habilitado: servicio.habilitado
			});
		}

		// Acumulador por identidad de plantilla (servicio + agrupador).
		const porPlantilla = new Map<
			string,
			{
				cabecera: typeof plantillas.$inferInsert;
				lineas: Omit<typeof plantillasLineas.$inferInsert, 'plantillaId'>[];
			}
		>();

		// Servicios omitidos: se listan una sola vez por servicio.
		const omitidos = new Map<string, ServicioOmitido>();
		const omitir = (contacto: string, motivo: ServicioOmitido['motivo']) => {
			const clave = normalizarTexto(contacto);
			if (!omitidos.has(clave)) omitidos.set(clave, { contacto, motivo });
		};

		for (const fila of filas) {
			const contacto = fila.contacto.trim();
			const servicio = serviciosPorNombre.get(normalizarTexto(contacto));

			if (!servicio) {
				omitir(contacto, 'NO_EXISTE');
				continue;
			}
			if (!servicio.habilitado) {
				omitir(contacto, 'DESHABILITADO');
				continue;
			}

			const claveArticulo = normalizarOpcional(fila.articuloCodigo) ?? normalizarTexto(fila.articuloCodigo);
			const articuloId = articulosPorCodigo.get(claveArticulo)!;
			const agrupador = fila.agrupador.trim();

			const cabecera = {
				servicioId: servicio.id,
				agrupador,
				fecha: fila.fecha ?? null,
				serie: fila.serie?.trim() || null,
				monedaId: monedasMap.get(normalizarTexto((fila.moneda ?? '').trim())) ?? null,
				tipoComprobanteId: comprobantesMap.get(normalizarTexto((fila.tipoComprobante ?? '').trim())) ?? null,
				tipoPrecioId: preciosMap.get(normalizarTexto((fila.tipoPrecio ?? '').trim())) ?? null,
				idCliente: fila.idCliente ? Number(fila.idCliente) : null,
				comentarioGeneral: fila.comentario?.trim() || null,
				// Los auxiliares son del documento: se toma el primer valor no vacío
				// de las filas que componen la misma plantilla.
				idCompra: fila.idCompra?.trim() || null,
				detalleAuxiliar: null,
				uteVencimiento: fila.vencimiento ?? null,
				informacionAdicional: fila.informacionAdicional?.trim() || null
			};

			const linea = {
				articuloId,
				cantidad: String(fila.cantidad ?? 0),
				importeUnitario: String(fila.importeUnitario ?? 0),
				detalle: fila.detalle?.trim() || null
			};

			// Se agrupa por identidad de plantilla para no crear una por línea.
			const clavePlantilla = `${servicio.id}|${agrupador}`;
			const acumulada = porPlantilla.get(clavePlantilla);
			if (acumulada) {
				acumulada.lineas.push(linea);
				// La primera fila con dato completa el auxiliar del documento.
				acumulada.cabecera.comentarioGeneral ??= cabecera.comentarioGeneral;
				acumulada.cabecera.idCompra ??= cabecera.idCompra;
				acumulada.cabecera.uteVencimiento ??= cabecera.uteVencimiento;
				acumulada.cabecera.informacionAdicional ??= cabecera.informacionAdicional;
			} else {
				porPlantilla.set(clavePlantilla, { cabecera, lineas: [linea] });
			}
		}

		// Persistencia: una plantilla por clave; si ya existía se le reemplazan
		// las líneas, de modo que reimportar el mismo archivo no duplique nada.
		for (const { cabecera, lineas } of porPlantilla.values()) {
			const [creada] = await tx
				.insert(plantillas)
				.values(cabecera)
				.onConflictDoNothing({
					target: [plantillas.servicioId, plantillas.agrupador]
				})
				.returning({ id: plantillas.id });

			let plantillaId = creada?.id;

			if (plantillaId) {
				resumen.plantillasNuevas += 1;
			} else {
				const [existente] = await tx
					.select({ id: plantillas.id })
					.from(plantillas)
					.where(
						and(
							eq(plantillas.servicioId, cabecera.servicioId),
							eq(plantillas.agrupador, cabecera.agrupador)
						)
					)
					.limit(1);
				plantillaId = existente?.id;
				resumen.plantillasReutilizadas += 1;

				if (plantillaId) {
					await tx
						.update(plantillas)
						.set({ ...cabecera, eliminadoEn: null })
						.where(eq(plantillas.id, plantillaId));
					await tx.delete(plantillasLineas).where(eq(plantillasLineas.plantillaId, plantillaId));
				}
			}

			if (!plantillaId) throw new Error('No se pudo crear ni recuperar la plantilla importada');

			await tx
				.insert(plantillasLineas)
				.values(lineas.map((linea) => ({ ...linea, plantillaId })));
			resumen.lineasInsertadas += lineas.length;
		}

		resumen.serviciosOmitidos = [...omitidos.values()];

		return resumen;
	});
}

/**
 * Actualiza la cabecera de una plantilla: chips, comentario general y campos
 * auxiliares del documento.
 */
export async function actualizarPlantilla(
	id: number,
	cambios: {
		monedaId?: number | null;
		tipoComprobanteId?: number | null;
		tipoPrecioId?: number | null;
		idCliente?: number | null;
		comentarioGeneral?: string | null;
		fecha?: string | null;
		serie?: string | null;
		idCompra?: string | null;
		detalleAuxiliar?: string | null;
		uteVencimiento?: string | null;
		informacionAdicional?: string | null;
	}
): Promise<boolean> {
	const [actualizada] = await db
		.update(plantillas)
		.set({ ...cambios, actualizadoEn: new Date() })
		.where(and(eq(plantillas.id, id), isNull(plantillas.eliminadoEn)))
		.returning({ id: plantillas.id });

	return Boolean(actualizada);
}

/** Arma la fila que consume la pantalla para una línea recién guardada. */
async function lineaListado(linea: {
	id: number;
	articuloId: number;
	detalle: string | null;
	cantidad: string;
	importeUnitario: string;
	comentario: string | null;
}): Promise<LineaListado> {
	const articulo = await resolverArticuloPorId(linea.articuloId);
	return {
		id: linea.id,
		articuloId: linea.articuloId,
		codigo: articulo?.codigo ?? '',
		articulo: articulo?.descripcion ?? '',
		detalle: linea.detalle,
		cantidad: linea.cantidad,
		importeUnitario: linea.importeUnitario,
		comentario: linea.comentario
	};
}

async function resolverArticuloPorId(articuloId: number) {
	const [articulo] = await db
		.select({ codigo: articulos.codigo, descripcion: articulos.descripcion })
		.from(articulos)
		.where(eq(articulos.id, articuloId))
		.limit(1);
	return articulo;
}

/**
 * Agrega una línea de facturación a la plantilla. No toca ninguna factura ya
 * creada: la copia al Facturador es un snapshot independiente.
 */
export async function agregarLineaPlantilla(
	plantillaId: number,
	datos: {
		codigo: string;
		cantidad: number;
		importeUnitario: number;
		detalle?: string | null;
		comentario?: string | null;
	}
): Promise<LineaListado> {
	const [plantilla] = await db
		.select({ id: plantillas.id })
		.from(plantillas)
		.where(and(eq(plantillas.id, plantillaId), isNull(plantillas.eliminadoEn)))
		.limit(1);
	if (!plantilla) throw new ErrorPlantilla('La plantilla no existe');

	const articulo = await resolverArticulo(datos.codigo);

	const [creada] = await db
		.insert(plantillasLineas)
		.values({
			plantillaId,
			articuloId: articulo.id,
			cantidad: String(datos.cantidad),
			importeUnitario: String(datos.importeUnitario),
			detalle: datos.detalle ?? null,
			comentario: datos.comentario ?? null
		})
		.returning();

	await db.update(plantillas).set({ actualizadoEn: new Date() }).where(eq(plantillas.id, plantillaId));

	return lineaListado(creada);
}

/**
 * Elimina una línea de la plantilla de forma DEFINITIVA. No se permite dejar la
 * plantilla sin líneas.
 */
export async function eliminarLineaPlantilla(plantillaId: number, lineaId: number): Promise<void> {
	const lineas = await db
		.select({ id: plantillasLineas.id })
		.from(plantillasLineas)
		.where(eq(plantillasLineas.plantillaId, plantillaId));

	if (lineas.length <= 1) {
		throw new ErrorPlantilla('La plantilla tiene que tener al menos una línea');
	}

	const borradas = await db
		.delete(plantillasLineas)
		.where(and(eq(plantillasLineas.id, lineaId), eq(plantillasLineas.plantillaId, plantillaId)))
		.returning({ id: plantillasLineas.id });

	if (borradas.length === 0) throw new ErrorPlantilla('La línea no existe');

	await db.update(plantillas).set({ actualizadoEn: new Date() }).where(eq(plantillas.id, plantillaId));
}

/**
 * Edición rápida de una línea de la plantilla (código, cantidad, importe,
 * detalle y comentario). Si cambia el código se resuelve contra el catálogo.
 */
export async function actualizarLineaPlantilla(
	plantillaId: number,
	lineaId: number,
	cambios: {
		codigo?: string;
		cantidad?: number;
		importeUnitario?: number;
		detalle?: string | null;
		comentario?: string | null;
	}
): Promise<LineaListado | undefined> {
	const cambiosDb: Partial<typeof plantillasLineas.$inferInsert> = {};

	if (cambios.codigo !== undefined) {
		const articulo = await resolverArticulo(cambios.codigo);
		cambiosDb.articuloId = articulo.id;
	}
	if (cambios.cantidad !== undefined) cambiosDb.cantidad = String(cambios.cantidad);
	if (cambios.importeUnitario !== undefined) cambiosDb.importeUnitario = String(cambios.importeUnitario);
	if (cambios.detalle !== undefined) cambiosDb.detalle = cambios.detalle;
	if (cambios.comentario !== undefined) cambiosDb.comentario = cambios.comentario;

	if (Object.keys(cambiosDb).length === 0) return undefined;

	const [actualizada] = await db
		.update(plantillasLineas)
		.set(cambiosDb)
		.where(and(eq(plantillasLineas.id, lineaId), eq(plantillasLineas.plantillaId, plantillaId)))
		.returning();

	if (!actualizada) return undefined;

	await db.update(plantillas).set({ actualizadoEn: new Date() }).where(eq(plantillas.id, plantillaId));

	return lineaListado(actualizada);
}

/**
 * Borrado lógico de plantillas: marca `eliminado_en` y deja de listarlas.
 * No se eliminan filas ni líneas, así se puede auditar o restaurar después.
 */
export async function eliminarPlantillas(ids: number[]): Promise<number> {
	if (ids.length === 0) return 0;

	const ahora = new Date();
	const eliminadas = await db
		.update(plantillas)
		.set({ eliminadoEn: ahora, actualizadoEn: ahora })
		.where(and(inArray(plantillas.id, ids), isNull(plantillas.eliminadoEn)))
		.returning({ id: plantillas.id });

	return eliminadas.length;
}
