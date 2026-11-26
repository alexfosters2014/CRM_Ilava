import { asc, eq } from 'drizzle-orm';
import {
	articulos,
	configuracionFacturacion,
	configuracionVisual,
	db,
	gruposCobranza,
	gruposFacturacion,
	modalidadesCobranza,
	monedas,
	monedasTiposPrecio,
	tiposCliente,
	tiposComprobantes,
	tiposGestion,
	tiposGestionFacturacion,
	tiposPrecios
} from '../base-datos/index.ts';
import type { CatalogoAdmin } from '../validaciones/configuracion.ts';

/**
 * Repositorio: configuración.
 *
 * Administración de catálogos (alta, edición y habilitado), grupos con colores
 * y los colores globales de las filas alternadas.
 */

export interface ValorCatalogo {
	id: number;
	nombre: string;
	activo: boolean;
	abreviatura?: string | null;
	descripcion?: string;
	monedaId?: number | null;
	moneda?: string | null;
}

export interface CatalogosAdmin {
	tiposComprobantes: ValorCatalogo[];
	tiposPrecios: ValorCatalogo[];
	monedas: ValorCatalogo[];
	tiposGestion: ValorCatalogo[];
	tiposCliente: ValorCatalogo[];
	modalidadesCobranza: ValorCatalogo[];
	tiposGestionFacturacion: ValorCatalogo[];
	articulos: ValorCatalogo[];
}

export interface GrupoAdmin {
	id: number;
	nombre: string;
	colorFondo: string;
	colorTexto: string;
	activo: boolean;
}

export interface Apariencia {
	filaParFondo: string;
	filaParTexto: string;
	filaImparFondo: string;
	filaImparTexto: string;
	tablaLineaColor: string;
	tablaLineaGrosor: number;
	filaPaddingY: number;
	listaLineaColor: string;
	listaLineaGrosor: number;
}

const APARIENCIA_POR_DEFECTO: Apariencia = {
	filaParFondo: '#e2e9f7',
	filaParTexto: '#111827',
	filaImparFondo: '#ffffff',
	filaImparTexto: '#111827',
	tablaLineaColor: '#e3e8f4',
	tablaLineaGrosor: 1,
	filaPaddingY: 2,
	listaLineaColor: '#e3e8f4',
	listaLineaGrosor: 1
};

/** Lista todos los valores de todos los catálogos (incluye deshabilitados). */
export async function listarCatalogosAdmin(): Promise<CatalogosAdmin> {
	const [comprobantes, precios, monedasDb, pares, gestiones, clientes, cobranzas, gestionesFacturacion, articulosDb] =
		await Promise.all([
			db
				.select({
					id: tiposComprobantes.id,
					nombre: tiposComprobantes.nombre,
					abreviatura: tiposComprobantes.abreviatura,
					activo: tiposComprobantes.activo
				})
				.from(tiposComprobantes)
				.orderBy(asc(tiposComprobantes.nombre)),
			db
				.select({ id: tiposPrecios.id, nombre: tiposPrecios.nombre, activo: tiposPrecios.activo })
				.from(tiposPrecios)
				.orderBy(asc(tiposPrecios.nombre)),
			db.select({ id: monedas.id, codigo: monedas.codigo, activo: monedas.activo }).from(monedas).orderBy(asc(monedas.id)),
			db
				.select({ tipoPrecioId: monedasTiposPrecio.tipoPrecioId, monedaId: monedasTiposPrecio.monedaId })
				.from(monedasTiposPrecio),
			db.select({ id: tiposGestion.id, nombre: tiposGestion.nombre, activo: tiposGestion.activo }).from(tiposGestion).orderBy(asc(tiposGestion.nombre)),
			db.select({ id: tiposCliente.id, nombre: tiposCliente.nombre, activo: tiposCliente.activo }).from(tiposCliente).orderBy(asc(tiposCliente.nombre)),
			db
				.select({ id: modalidadesCobranza.id, nombre: modalidadesCobranza.nombre, activo: modalidadesCobranza.activo })
				.from(modalidadesCobranza)
				.orderBy(asc(modalidadesCobranza.nombre)),
			db
				.select({
					id: tiposGestionFacturacion.id,
					nombre: tiposGestionFacturacion.nombre,
					activo: tiposGestionFacturacion.activo
				})
				.from(tiposGestionFacturacion)
				.orderBy(asc(tiposGestionFacturacion.nombre)),
			db
				.select({
					id: articulos.id,
					codigo: articulos.codigo,
					descripcion: articulos.descripcion,
					activo: articulos.activo
				})
				.from(articulos)
				.orderBy(asc(articulos.codigo))
		]);

	const monedaPorId = new Map(monedasDb.map((moneda) => [moneda.id, moneda.codigo]));
	const monedaDePrecio = new Map(pares.map((par) => [par.tipoPrecioId, par.monedaId]));

	return {
		tiposComprobantes: comprobantes,
		tiposPrecios: precios.map((precio) => {
			const monedaId = monedaDePrecio.get(precio.id) ?? null;
			return { ...precio, monedaId, moneda: monedaId ? monedaPorId.get(monedaId) ?? null : null };
		}),
		monedas: monedasDb.map((moneda) => ({ id: moneda.id, nombre: moneda.codigo, activo: moneda.activo })),
		tiposGestion: gestiones,
		tiposCliente: clientes,
		modalidadesCobranza: cobranzas,
		tiposGestionFacturacion: gestionesFacturacion,
		articulos: articulosDb.map((articulo) => ({
			id: articulo.id,
			nombre: articulo.codigo,
			descripcion: articulo.descripcion,
			activo: articulo.activo
		}))
	};
}

interface DatosValor {
	nombre?: string;
	codigo?: string;
	descripcion?: string;
	abreviatura?: string | null;
	monedaId?: number | null;
	activo?: boolean;
}

/** Alta de un valor en el catálogo indicado. */
export async function crearValorCatalogo(catalogo: CatalogoAdmin, datos: DatosValor): Promise<void> {
	switch (catalogo) {
		case 'tipos-comprobantes':
			await db.insert(tiposComprobantes).values({
				nombre: datos.nombre!,
				abreviatura: datos.abreviatura ?? null
			});
			return;
		case 'tipos-precios': {
			const [creado] = await db
				.insert(tiposPrecios)
				.values({ nombre: datos.nombre! })
				.returning({ id: tiposPrecios.id });
			await asignarMonedaPrecio(creado.id, datos.monedaId ?? null);
			return;
		}
		case 'monedas':
			await db.insert(monedas).values({ codigo: datos.codigo ?? datos.nombre! });
			return;
		case 'tipos-gestion':
			await db.insert(tiposGestion).values({ nombre: datos.nombre! });
			return;
		case 'tipos-cliente':
			await db.insert(tiposCliente).values({ nombre: datos.nombre! });
			return;
		case 'modalidades-cobranza':
			await db.insert(modalidadesCobranza).values({ nombre: datos.nombre! });
			return;
		case 'tipos-gestion-facturacion':
			await db.insert(tiposGestionFacturacion).values({ nombre: datos.nombre! });
			return;
		case 'articulos':
			await db.insert(articulos).values({
				codigo: datos.codigo ?? datos.nombre!,
				descripcion: datos.descripcion?.trim() || datos.nombre!
			});
			return;
	}
}

/** Edición (incluye habilitar/deshabilitar) de un valor del catálogo. */
export async function actualizarValorCatalogo(
	catalogo: CatalogoAdmin,
	id: number,
	datos: DatosValor
): Promise<boolean> {
	switch (catalogo) {
		case 'tipos-comprobantes': {
			const [fila] = await db
				.update(tiposComprobantes)
				.set({
					...(datos.nombre !== undefined ? { nombre: datos.nombre } : {}),
					...(datos.abreviatura !== undefined ? { abreviatura: datos.abreviatura } : {}),
					...(datos.activo !== undefined ? { activo: datos.activo } : {})
				})
				.where(eq(tiposComprobantes.id, id))
				.returning({ id: tiposComprobantes.id });
			return Boolean(fila);
		}
		case 'tipos-precios': {
			const [fila] = await db
				.update(tiposPrecios)
				.set({
					...(datos.nombre !== undefined ? { nombre: datos.nombre } : {}),
					...(datos.activo !== undefined ? { activo: datos.activo } : {})
				})
				.where(eq(tiposPrecios.id, id))
				.returning({ id: tiposPrecios.id });
			if (!fila) return false;
			if (datos.monedaId !== undefined) await asignarMonedaPrecio(id, datos.monedaId);
			return true;
		}
		case 'monedas': {
			const [fila] = await db
				.update(monedas)
				.set({
					...(datos.codigo !== undefined || datos.nombre !== undefined
						? { codigo: datos.codigo ?? datos.nombre! }
						: {}),
					...(datos.activo !== undefined ? { activo: datos.activo } : {})
				})
				.where(eq(monedas.id, id))
				.returning({ id: monedas.id });
			return Boolean(fila);
		}
		case 'tipos-gestion':
		case 'tipos-cliente':
		case 'modalidades-cobranza':
		case 'tipos-gestion-facturacion': {
			const tabla = {
				'tipos-gestion': tiposGestion,
				'tipos-cliente': tiposCliente,
				'modalidades-cobranza': modalidadesCobranza,
				'tipos-gestion-facturacion': tiposGestionFacturacion
			}[catalogo];
			const [fila] = await db
				.update(tabla)
				.set({
					...(datos.nombre !== undefined ? { nombre: datos.nombre } : {}),
					...(datos.activo !== undefined ? { activo: datos.activo } : {})
				})
				.where(eq(tabla.id, id))
				.returning({ id: tabla.id });
			return Boolean(fila);
		}
		case 'articulos': {
			const [fila] = await db
				.update(articulos)
				.set({
					...(datos.codigo !== undefined || datos.nombre !== undefined
						? { codigo: datos.codigo ?? datos.nombre! }
						: {}),
					...(datos.descripcion !== undefined ? { descripcion: datos.descripcion } : {}),
					...(datos.activo !== undefined ? { activo: datos.activo } : {})
				})
				.where(eq(articulos.id, id))
				.returning({ id: articulos.id });
			return Boolean(fila);
		}
	}
}

/** Un tipo de precio pertenece a una sola moneda: se reemplaza el par. */
async function asignarMonedaPrecio(tipoPrecioId: number, monedaId: number | null): Promise<void> {
	await db.delete(monedasTiposPrecio).where(eq(monedasTiposPrecio.tipoPrecioId, tipoPrecioId));
	if (monedaId) {
		await db
			.insert(monedasTiposPrecio)
			.values({ monedaId, tipoPrecioId })
			.onConflictDoNothing();
	}
}

/** Lista los grupos con sus colores. */
export async function listarGruposAdmin(): Promise<GrupoAdmin[]> {
	return db
		.select({
			id: gruposFacturacion.id,
			nombre: gruposFacturacion.nombre,
			colorFondo: gruposFacturacion.colorFondo,
			colorTexto: gruposFacturacion.colorTexto,
			activo: gruposFacturacion.activo
		})
		.from(gruposFacturacion)
		.orderBy(asc(gruposFacturacion.id));
}

export interface GrupoCobranzaAdmin extends GrupoAdmin {
	orden: number;
}

/** Grupos de cobranza (independientes de los de facturación). */
export async function listarGruposCobranzaAdmin(): Promise<GrupoCobranzaAdmin[]> {
	return db
		.select({
			id: gruposCobranza.id,
			nombre: gruposCobranza.nombre,
			colorFondo: gruposCobranza.colorFondo,
			colorTexto: gruposCobranza.colorTexto,
			orden: gruposCobranza.orden,
			activo: gruposCobranza.activo
		})
		.from(gruposCobranza)
		.orderBy(asc(gruposCobranza.orden), asc(gruposCobranza.nombre));
}

export async function crearGrupoCobranza(datos: {
	nombre: string;
	colorFondo: string;
	colorTexto: string;
	orden?: number;
}): Promise<void> {
	await db.insert(gruposCobranza).values({
		nombre: datos.nombre,
		colorFondo: datos.colorFondo,
		colorTexto: datos.colorTexto,
		orden: datos.orden ?? 0
	});
}

export async function actualizarGrupoCobranza(
	id: number,
	datos: { nombre?: string; colorFondo?: string; colorTexto?: string; orden?: number; activo?: boolean }
): Promise<boolean> {
	const [fila] = await db
		.update(gruposCobranza)
		.set(datos)
		.where(eq(gruposCobranza.id, id))
		.returning({ id: gruposCobranza.id });
	return Boolean(fila);
}

export async function crearGrupo(datos: {
	nombre: string;
	colorFondo: string;
	colorTexto: string;
}): Promise<void> {
	await db.insert(gruposFacturacion).values({
		nombre: datos.nombre,
		colorFondo: datos.colorFondo,
		colorTexto: datos.colorTexto
	});
}

export async function actualizarGrupo(
	id: number,
	datos: { nombre?: string; colorFondo?: string; colorTexto?: string; activo?: boolean }
): Promise<boolean> {
	const [fila] = await db
		.update(gruposFacturacion)
		.set(datos)
		.where(eq(gruposFacturacion.id, id))
		.returning({ id: gruposFacturacion.id });
	return Boolean(fila);
}

/** Apariencia global: colores de fila, líneas y espaciado de tablas y listas. */
export async function obtenerApariencia(): Promise<Apariencia> {
	const [fila] = await db.select().from(configuracionVisual).where(eq(configuracionVisual.id, 1)).limit(1);
	if (!fila) return APARIENCIA_POR_DEFECTO;

	return {
		filaParFondo: fila.filaParFondo,
		filaParTexto: fila.filaParTexto,
		filaImparFondo: fila.filaImparFondo,
		filaImparTexto: fila.filaImparTexto,
		tablaLineaColor: fila.tablaLineaColor,
		tablaLineaGrosor: fila.tablaLineaGrosor,
		filaPaddingY: fila.filaPaddingY,
		listaLineaColor: fila.listaLineaColor,
		listaLineaGrosor: fila.listaLineaGrosor
	};
}

export async function actualizarApariencia(datos: Apariencia): Promise<void> {
	await db
		.insert(configuracionVisual)
		.values({ id: 1, ...datos })
		.onConflictDoUpdate({
			target: configuracionVisual.id,
			set: { ...datos, actualizadoEn: new Date() }
		});
}

// ---------- Configuración de facturación ----------

export interface ConfiguracionFacturacion {
	serie: string;
	/** Período en proceso (`YYYY-MM`), configurado en el Facturador. */
	periodo: string | null;
	/** Fecha general que se aplica a las facturas del envío (`YYYY-MM-DD`). */
	fechaGeneral: string | null;
}

const SERIE_POR_DEFECTO = 'A';

/** Parámetros de facturación (única fila, id = 1). */
export async function obtenerConfiguracionFacturacion(): Promise<ConfiguracionFacturacion> {
	const [fila] = await db
		.select({
			serie: configuracionFacturacion.serie,
			periodo: configuracionFacturacion.periodo,
			fechaGeneral: configuracionFacturacion.fechaGeneral
		})
		.from(configuracionFacturacion)
		.where(eq(configuracionFacturacion.id, 1))
		.limit(1);

	return {
		serie: fila?.serie ?? SERIE_POR_DEFECTO,
		periodo: fila?.periodo ?? null,
		fechaGeneral: fila?.fechaGeneral ?? null
	};
}

export async function actualizarConfiguracionFacturacion(
	datos: Partial<ConfiguracionFacturacion>
): Promise<void> {
	await db
		.insert(configuracionFacturacion)
		.values({
			id: 1,
			serie: datos.serie ?? SERIE_POR_DEFECTO,
			periodo: datos.periodo ?? null,
			fechaGeneral: datos.fechaGeneral ?? null
		})
		.onConflictDoUpdate({
			target: configuracionFacturacion.id,
			set: {
				...(datos.serie !== undefined ? { serie: datos.serie } : {}),
				...(datos.periodo !== undefined ? { periodo: datos.periodo } : {}),
				...(datos.fechaGeneral !== undefined ? { fechaGeneral: datos.fechaGeneral } : {}),
				actualizadoEn: new Date()
			}
		});
}

export { APARIENCIA_POR_DEFECTO, SERIE_POR_DEFECTO };
