import { leerPlantillasDesdeExcel, type FilaImportacion } from '#lib/servicios/importacion.ts';

/**
 * Capa: ServiciosDatosAPI (plantillas)
 *
 * Único punto del frontend que habla con los endpoints de plantillas y
 * catálogos. Las pantallas no llaman a `fetch` directamente.
 */

export interface LineaPlantilla {
	id: number;
	articuloId: number;
	codigo: string;
	articulo: string;
	detalle: string | null;
	cantidad: string;
	importeUnitario: string;
	comentario: string | null;
}

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
	lineas: LineaPlantilla[];
}

export interface GrupoPlantillas {
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

export interface Catalogos {
	grupos: { id: number; nombre: string; colorFondo: string; colorTexto: string; activo: boolean }[];
	articulos: { id: number; codigo: string; descripcion: string; activo: boolean }[];
	tiposComprobantes: { id: number; nombre: string; abreviatura: string | null; activo: boolean }[];
	tiposPrecios: { id: number; nombre: string; activo: boolean }[];
	monedas: { id: number; codigo: string; activo: boolean }[];
	tiposGestion: { id: number; nombre: string; activo: boolean }[];
	tiposCliente: { id: number; nombre: string; activo: boolean }[];
	modalidadesCobranza: { id: number; nombre: string; activo: boolean }[];
	tiposGestionFacturacion: { id: number; nombre: string; activo: boolean }[];
	monedasTiposPrecio: { monedaId: number; tipoPrecioId: number }[];
}

/** Convierte el mapa de faltantes de catálogo en un mensaje legible. */
export function mensajeFaltantes(faltantes: Record<string, string[]>): string {
	return Object.entries(faltantes)
		.map(([catalogo, valores]) => `${catalogo}: ${valores.join(', ')}`)
		.join(' · ');
}

/** Error de importación con el detalle necesario para el reporte en pantalla. */
export class ErrorImportacionPlantillas extends Error {
	readonly faltantes?: Record<string, string[]>;
	readonly detalles?: { campo: string; mensaje: string }[];

	constructor(
		mensaje: string,
		extras: { faltantes?: Record<string, string[]>; detalles?: { campo: string; mensaje: string }[] } = {}
	) {
		super(mensaje);
		this.name = 'ErrorImportacionPlantillas';
		this.faltantes = extras.faltantes;
		this.detalles = extras.detalles;
	}
}

/** Lista las plantillas agrupadas por grupo de facturación. */
export async function listarPlantillas(): Promise<GrupoPlantillas[]> {
	const res = await fetch('/api/plantillas');
	if (!res.ok) throw new Error('No se pudieron cargar las plantillas');
	return res.json();
}

/** Lista los catálogos disponibles para filtros y formularios. */
export async function listarCatalogos(): Promise<Catalogos> {
	const res = await fetch('/api/catalogos');
	if (!res.ok) throw new Error('No se pudieron cargar los catálogos');
	return res.json();
}

/** Importa un archivo Excel completo y devuelve el resumen de la operación. */
export async function importarPlantillasDesdeArchivo(archivo: File): Promise<ResumenImportacion> {
	const filas: FilaImportacion[] = await leerPlantillasDesdeExcel(archivo);

	const res = await fetch('/api/plantillas/importar', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ filas })
	});

	const datos = await res.json().catch(() => ({}));
	if (!res.ok) {
		if (datos?.faltantes) {
			throw new ErrorImportacionPlantillas('Faltan valores de catálogo: nada se importó', {
				faltantes: datos.faltantes
			});
		}
		const detalles = Array.isArray(datos?.detalles) ? datos.detalles : undefined;
		throw new ErrorImportacionPlantillas(datos?.error ?? 'No se pudo importar el archivo', { detalles });
	}

	return datos;
}

/** Actualiza los chips de la plantilla, el comentario general y los auxiliares. */
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
): Promise<void> {
	const res = await fetch(`/api/plantillas/${id}`, {
		method: 'PATCH',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(cambios)
	});

	const datos = await res.json().catch(() => ({}));
	if (!res.ok) throw new Error(datos?.error ?? 'No se pudo guardar la plantilla');
}

/** Edición rápida de una línea de la plantilla. */
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
): Promise<LineaPlantilla> {
	const res = await fetch(`/api/plantillas/${plantillaId}/lineas/${lineaId}`, {
		method: 'PATCH',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(cambios)
	});

	const datos = await res.json().catch(() => ({}));
	if (!res.ok) throw new Error(datos?.error ?? 'No se pudo guardar la línea');
	return datos;
}

/** Agrega una línea de facturación a la plantilla. */
export async function agregarLineaPlantilla(
	plantillaId: number,
	datos: {
		codigo: string;
		cantidad: number;
		importeUnitario: number;
		detalle?: string | null;
		comentario?: string | null;
	}
): Promise<LineaPlantilla> {
	const res = await fetch(`/api/plantillas/${plantillaId}/lineas`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(datos)
	});

	const cuerpo = await res.json().catch(() => ({}));
	if (!res.ok) throw new Error(cuerpo?.error ?? 'No se pudo agregar la línea');
	return cuerpo;
}

/** Elimina una línea de la plantilla de forma definitiva. */
export async function eliminarLineaPlantilla(plantillaId: number, lineaId: number): Promise<void> {
	const res = await fetch(`/api/plantillas/${plantillaId}/lineas/${lineaId}`, { method: 'DELETE' });
	if (!res.ok) {
		const datos = await res.json().catch(() => ({}));
		throw new Error(datos?.error ?? 'No se pudo eliminar la línea');
	}
}

/** Borrado lógico de plantillas por lote. Devuelve cuántas se eliminaron. */
export async function eliminarPlantillas(ids: number[]): Promise<number> {
	const res = await fetch('/api/plantillas/eliminar', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ ids })
	});

	const datos = await res.json().catch(() => ({}));
	if (!res.ok) {
		throw new Error(datos?.error ?? 'No se pudieron eliminar las plantillas');
	}

	return datos.eliminadas ?? 0;
}
