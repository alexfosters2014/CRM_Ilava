// Genera la planilla de prueba usada por tests/unit/importacion.test.ts.
// Ejecutar desde cliente/:  node tests/fixtures/generar-planilla.mjs
import * as XLSX from 'xlsx';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

/**
 * Los Excel guardan las fechas como serial (días desde 1899-12-30). Escribimos
 * el serial directamente para que el fixture no dependa de la zona horaria de
 * quien lo genere.
 */
const serial = (anio, mes, dia) =>
	Math.round(Date.UTC(anio, mes - 1, dia) / 86400000) - Math.round(Date.UTC(1899, 11, 30) / 86400000);

const ENCABEZADOS = [
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
];

const FILAS = [
	[
		'CONSTRUCTORA EJEMPLO S.A.',
		serial(2026, 6, 1),
		'A',
		15,
		'$',
		'Venta Crédito',
		'30 dias',
		'1001',
		'HORAS DIURNAS',
		2,
		385.59,
		'OC N° 123 - Laboratorio Ejemplo',
		'200',
		'',
		'',
		'',
		''
	],
	[
		'CONSTRUCTORA EJEMPLO S.A.',
		serial(2026, 6, 1),
		'A',
		15,
		'$',
		'Venta Crédito',
		'30 dias',
		'1002',
		'HORAS NOCTURNAS',
		14,
		448.55,
		'OC N° 123 - Laboratorio Ejemplo',
		'200',
		'',
		'',
		'',
		''
	],
	[
		'CLIENTE EJEMPLO DOS',
		serial(2026, 6, 1),
		'A',
		80,
		'$',
		'Venta Crédito',
		'30 dias',
		'1003',
		'SERVICIO DE VIGILANCIA',
		'1.120',
		'397,70',
		'Junio 2026',
		'',
		'',
		'',
		'',
		''
	]
];

const hoja = XLSX.utils.aoa_to_sheet([ENCABEZADOS, ...FILAS]);
const libro = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(libro, hoja, 'VARIABLES PENDIENTE');

const destino = path.join(path.dirname(fileURLToPath(import.meta.url)), 'planilla-prueba.xlsx');

// `XLSX.writeFile` no escribe en el build ESM para navegador: generamos el
// buffer y lo guardamos con node:fs (este script solo corre en desarrollo).
const buffer = XLSX.write(libro, { type: 'buffer', bookType: 'xlsx' });
writeFileSync(destino, buffer);
console.log(`Fixture generado: ${destino}`);
