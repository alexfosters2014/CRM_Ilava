import * as XLSX from 'xlsx';
import type { FacturaListado } from '#lib/servicios-datos-api/index.ts';
import { formatearFecha } from './fechas.ts';

/**
 * Capa: Servicios (frontend) — planilla de multifacturación.
 *
 * Genera el mismo `.xlsx` que se importa (17 columnas, una fila por línea) para
 * alimentar al facturador externo. Los datos que son del documento —contacto,
 * fecha, serie, número, moneda, comprobante, precio, adenda, ID cliente y los
 * cuatro auxiliares— se repiten en cada línea de la factura.
 */

export const HOJA_MULTIFACTURACION = 'VARIABLES PENDIENTE';

/** Encabezados en el orden exacto de la planilla modelo. */
export const ENCABEZADOS_MULTIFACTURACION = [
	'Contacto: nombre',
	'Fecha',
	'Serie',
	'Número',
	'Moneda',
	'Tipo de comprobante',
	'Tipo de precio',
	'Artículo: código',
	'Artículo: comentario',
	'Cantidad',
	'Importe unitario (x1)',
	'Comentario',
	'ID Cliente',
	'EFactura: ID Compra',
	'UTE fecha vencimiento:',
	'Detalle',
	'Información Adicional'
] as const;

export type CeldaMultifacturacion = string | number;

export interface OpcionesMultifacturacion {
	/** Serie configurada en Configuración → Facturación. */
	serie: string;
	/** Primer número simbólico. Por defecto 1. */
	numeroInicial?: number;
}

function numero(valor: string): number {
	const convertido = Number(valor);
	return Number.isFinite(convertido) ? convertido : 0;
}

function texto(valor: string | null | undefined): string {
	return (valor ?? '').trim();
}

/**
 * Arma las filas de la planilla. El número es simbólico y agrupa las líneas de
 * una misma factura: 1 para la primera, 2 para la segunda, y así.
 */
export function construirFilas(
	facturas: FacturaListado[],
	opciones: OpcionesMultifacturacion
): CeldaMultifacturacion[][] {
	const serie = opciones.serie.trim();
	let numeroFactura = opciones.numeroInicial ?? 1;

	const filas: CeldaMultifacturacion[][] = [];

	for (const factura of facturas) {
		const filaBase = {
			contacto: texto(factura.contactoFacturacion),
			fecha: formatearFecha(factura.fecha),
			serie,
			numero: numeroFactura,
			moneda: texto(factura.moneda),
			tipoComprobante: texto(factura.tipoComprobante),
			tipoPrecio: texto(factura.tipoPrecio),
			comentario: texto(factura.comentarioGeneral),
			idCliente: factura.idCliente ?? '',
			idCompra: texto(factura.idCompra),
			vencimiento: formatearFecha(factura.uteVencimiento),
			detalleAuxiliar: texto(factura.detalleAuxiliar),
			informacionAdicional: texto(factura.informacionAdicional)
		};

		for (const linea of factura.lineas) {
			filas.push([
				filaBase.contacto,
				filaBase.fecha,
				filaBase.serie,
				filaBase.numero,
				filaBase.moneda,
				filaBase.tipoComprobante,
				filaBase.tipoPrecio,
				texto(linea.codigo),
				texto(linea.detalle) || texto(linea.descripcion),
				numero(linea.cantidad),
				numero(linea.importeUnitario),
				filaBase.comentario,
				filaBase.idCliente,
				filaBase.idCompra,
				filaBase.vencimiento,
				filaBase.detalleAuxiliar,
				filaBase.informacionAdicional
			]);
		}

		numeroFactura += 1;
	}

	return filas;
}

/** Libro de Excel con la hoja y los anchos de la planilla modelo. */
export function construirLibro(filas: CeldaMultifacturacion[][]): XLSX.WorkBook {
	const hoja = XLSX.utils.aoa_to_sheet([[...ENCABEZADOS_MULTIFACTURACION], ...filas]);
	hoja['!cols'] = [
		{ wch: 34 },
		{ wch: 11 },
		{ wch: 7 },
		{ wch: 9 },
		{ wch: 8 },
		{ wch: 20 },
		{ wch: 16 },
		{ wch: 14 },
		{ wch: 38 },
		{ wch: 10 },
		{ wch: 18 },
		{ wch: 60 },
		{ wch: 11 },
		{ wch: 18 },
		{ wch: 20 },
		{ wch: 26 },
		{ wch: 26 }
	];

	const libro = XLSX.utils.book_new();
	XLSX.utils.book_append_sheet(libro, hoja, HOJA_MULTIFACTURACION);
	return libro;
}

export const ARCHIVO_PLANTILLA = 'PLANTILLA MULTIFACTURACION.xlsx';

/**
 * Cuatro filas de ejemplo: tres facturas, y la primera con dos líneas para
 * mostrar que `Número` agrupa las líneas de un mismo comprobante. La última
 * fila completa las columnas opcionales que sobreviven a la importación.
 */
export const FILAS_EJEMPLO_PLANTILLA: CeldaMultifacturacion[][] = [
	[
		'CONTACTO DE EJEMPLO S.A.',
		'01/12/2026',
		'A',
		1,
		'$',
		'Venta Crédito',
		'30 dias',
		'1001',
		'SERVICIO DE EJEMPLO',
		2,
		385.59,
		'Servicio correspondiente a {{mes-anio}}',
		'',
		'',
		'',
		'',
		''
	],
	[
		'CONTACTO DE EJEMPLO S.A.',
		'01/12/2026',
		'A',
		1,
		'$',
		'Venta Crédito',
		'30 dias',
		'1002',
		'SEGUNDA LÍNEA DE LA MISMA FACTURA',
		1,
		214.4,
		'Servicio correspondiente a {{mes-anio}}',
		'',
		'',
		'',
		'',
		''
	],
	[
		'CONTACTO DE EJEMPLO S.A.',
		'01/12/2026',
		'A',
		2,
		'USD',
		'Venta Crédito',
		'30 dias.',
		'1003',
		'SERVICIO DE EJEMPLO EN DÓLARES',
		1,
		250,
		'Servicio del período {{periodo-21-20}}',
		'',
		'',
		'',
		'',
		''
	],
	[
		'CONTACTO DE EJEMPLO S.A.',
		'01/12/2026',
		'A',
		3,
		'$',
		'Venta Crédito',
		'30 dias',
		'1004',
		'SERVICIO DE EJEMPLO CON COLUMNAS OPCIONALES',
		3,
		100,
		'Comentario del documento',
		2000065,
		'OC-123',
		'15/12/2026',
		'',
		'Información adicional de la factura'
	]
];

/** Libro de plantilla: los 17 encabezados y cuatro filas de ejemplo. */
export function construirLibroPlantilla(): XLSX.WorkBook {
	return construirLibro(FILAS_EJEMPLO_PLANTILLA);
}

/** Descarga un libro en el navegador. */
export function descargarLibro(libro: XLSX.WorkBook, archivo: string): void {
	const contenido = XLSX.write(libro, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
	const blob = new Blob([contenido], {
		type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
	});

	const url = URL.createObjectURL(blob);
	const enlace = document.createElement('a');
	enlace.href = url;
	enlace.download = archivo;
	document.body.appendChild(enlace);
	enlace.click();
	enlace.remove();
	// Se libera en el próximo ciclo: algunos navegadores necesitan el URL vivo.
	setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Descarga la plantilla vacía con encabezados y ejemplos. */
export function descargarPlantillaModelo(archivo = ARCHIVO_PLANTILLA): void {
	descargarLibro(construirLibroPlantilla(), archivo);
}

/** Nombre de archivo: por período si todas las facturas comparten uno. */
export function nombreArchivo(facturas: FacturaListado[], fecha: string): string {
	const periodos = new Set(facturas.map((factura) => factura.periodo));
	const sufijo = periodos.size === 1 ? [...periodos][0] : fecha;
	return `MULTIFACTURACION ${sufijo}.xlsx`;
}

/**
 * Dispara la descarga en el navegador y devuelve cuántas facturas y filas se
 * exportaron. No cambia estados: eso lo decide la pantalla.
 */
export function descargarPlanilla(
	facturas: FacturaListado[],
	opciones: OpcionesMultifacturacion,
	archivo: string
): { filas: number; facturas: number } {
	if (facturas.length === 0) throw new Error('No hay facturas para exportar');

	const filas = construirFilas(facturas, opciones);
	if (filas.length === 0) {
		throw new Error('Las facturas seleccionadas no tienen líneas para exportar');
	}

	const libro = construirLibro(filas);
	descargarLibro(libro, archivo);

	return { filas: filas.length, facturas: facturas.length };
}
