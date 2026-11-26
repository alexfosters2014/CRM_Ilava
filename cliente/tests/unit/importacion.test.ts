import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { claveExclusionCobranza, construirLibroPlantillaCobranza, construirLibroPlantillaServicios, ENCABEZADOS_COBRANZA, ENCABEZADOS_SERVICIOS, HOJA_PARAMETROS_SERVICIOS, HOJA_SERVICIOS_IMPORTAR, leerCobranzaDesdeExcel, leerPlantillasDesdeExcel, leerServiciosDesdeExcel, leerServiciosFaltantesDesdeExcel, parsearNumeroImportacion } from '../../src/lib/servicios/importacion.ts';

/**
 * El parser de Excel corre en el navegador, pero la lógica es pura: se puede
 * verificar en Node con el mismo archivo .xlsx que se sube en la aplicación.
 */

const aqui = path.dirname(fileURLToPath(import.meta.url));
const rutaFixture = path.join(aqui, '..', 'fixtures', 'planilla-prueba.xlsx');

async function leerFixture() {
	const bytes = readFileSync(rutaFixture);
	const archivo = new File([bytes], 'planilla-prueba.xlsx', {
		type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
	});
	return leerPlantillasDesdeExcel(archivo);
}

describe('claveExclusionCobranza', () => {
	it('usa servicio, tipo, serie y número cuando hay número', () => {
		expect(
			claveExclusionCobranza({ contacto: '123 Cliente, Ejemplo', tipoComprobante: 'prueba', serie: 'P', numero: '3' })
		).toBe('numero|123 CLIENTE, EJEMPLO|PRUEBA|P|3');
	});

	it('ignora el número vacío y excluye el servicio sin comprobante', () => {
		expect(claveExclusionCobranza({ contacto: '  Servicio  Uno ', tipoComprobante: null, serie: null, numero: '' })).toBe(
			'sincomprobante|SERVICIO UNO'
		);
	});

	it('no colisiona entre tipos distintos con el mismo número y serie', () => {
		const venta = claveExclusionCobranza({ contacto: 'EMPRESA EJEMPLO', tipoComprobante: 'VCre', serie: 'A', numero: '19943' });
		const nota = claveExclusionCobranza({ contacto: 'EMPRESA EJEMPLO', tipoComprobante: 'NCr', serie: 'A', numero: '19943' });
		expect(venta).not.toBe(nota);
	});
});

describe('leerPlantillasDesdeExcel', () => {
	it('lee la planilla auxiliar de servicios faltantes y exige sus campos', async () => {
		const libro = XLSX.utils.book_new();
		const hoja = XLSX.utils.json_to_sheet([
			{
				ID: 1,
				'Servicio / contacto': 'SERVICIO NUEVO',
				'RUT / CI': '12345678',
				'Tipo numeración': 'CEDULA',
				Grupo: 'INDIVIDUAL',
				'Tipo de gestión': 'NORMAL',
				'Tipo de cliente': 'EMPRESA',
				'Modalidad de cobranza': 'TRANSFERENCIA',
				'Gestión de facturación': 'NORMAL'
			}
		]);
		XLSX.utils.book_append_sheet(libro, hoja, 'Servicios a crear');
		const bytes = XLSX.write(libro, { type: 'buffer', bookType: 'xlsx' });
		const resultado = await leerServiciosFaltantesDesdeExcel(new File([bytes], 'servicios-faltantes.xlsx'));
		expect(resultado.errores).toEqual([]);
		expect(resultado.filas[0].numeracion).toBe('12345678');
	});

	it('reconoce coma o punto como separador decimal según su posición', () => {
		expect(parsearNumeroImportacion('1.234,56')).toBe(1234.56);
		expect(parsearNumeroImportacion('1,234.56')).toBe(1234.56);
		expect(parsearNumeroImportacion('385,59')).toBe(385.59);
		expect(parsearNumeroImportacion('385.59')).toBe(385.59);
	});

	it('lee todas las filas con datos de contacto y artículo', async () => {
		const filas = await leerFixture();
		expect(filas).toHaveLength(3);
	});

	it('mapea los encabezados del negocio a los campos del payload', async () => {
		const [primera] = await leerFixture();
		expect(primera.contacto).toBe('CONSTRUCTORA EJEMPLO S.A.');
		expect(primera.agrupador).toBe('15');
		expect(primera.serie).toBe('A');
		expect(primera.moneda).toBe('$');
		expect(primera.tipoComprobante).toBe('Venta Crédito');
		expect(primera.tipoPrecio).toBe('30 dias');
		expect(primera.articuloCodigo).toBe('1001');
		expect(primera.detalle).toBe('HORAS DIURNAS');
		expect(primera.cantidad).toBe(2);
		expect(primera.importeUnitario).toBe(385.59);
		expect(primera.idCliente).toBe('200');
	});

	it('convierte la fecha serial de Excel a ISO', async () => {
		const [primera] = await leerFixture();
		expect(primera.fecha).toBe('2026-06-01');
	});

	it('interpreta importes con coma decimal y cantidades con miles', async () => {
		const filas = await leerFixture();
		const tercera = filas[2];
		expect(tercera.cantidad).toBe(1120);
		expect(tercera.importeUnitario).toBe(397.7);
	});

	it('deja en null el ID de cliente cuando la fila no lo trae', async () => {
		const filas = await leerFixture();
		expect(filas[2].idCliente).toBeNull();
	});
});

describe('plantilla de cartera', () => {
	it('deja los encabezados en la fila 5 y cuatro filas de ejemplo', () => {
		const hoja = construirLibroPlantillaCobranza().Sheets['Pendientes de cobro'];
		const filas = XLSX.utils.sheet_to_json<unknown[]>(hoja, { header: 1, defval: '' });

		expect(filas[4]).toEqual([...ENCABEZADOS_COBRANZA]);
		expect(filas).toHaveLength(9);
	});

	it('se puede volver a leer con el importador de cartera', async () => {
		const bytes = XLSX.write(construirLibroPlantillaCobranza(), {
			type: 'buffer',
			bookType: 'xlsx'
		});
		const archivo = new File([bytes], 'plantilla-cobranza.xlsx', {
			type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
		});

		const filas = await leerCobranzaDesdeExcel(archivo);

		expect(filas).toHaveLength(4);
		expect(filas[0]).toMatchObject({
			contacto: 'CONSTRUCTORA EJEMPLO S.A.',
			comprobante: 'VCre A-19943',
			tipoComprobante: 'VCre',
			serie: 'A',
			numero: '19943',
			fechaEmision: '2026-11-01',
			fechaVencimiento: '2026-11-30',
			moneda: '$',
			importe: 1000,
			saldoPendiente: 600
		});
		expect(filas[2]).toMatchObject({ tipoComprobante: 'RC', serie: null, numero: '4754' });
		expect(filas[3].moneda).toBe('USD');
	});
});

const PARAMETROS_SERVICIOS = {
	grupo: ['VARIABLES', 'FIJOS'],
	tipoGestion: ['NORMAL'],
	tipoCliente: ['EMPRESA'],
	modalidadCobranza: ['TRANSFERENCIA'],
	gestionFacturacion: ['NORMAL']
};

function archivoDesdeLibro(libro: XLSX.WorkBook): File {
	const bytes = XLSX.write(libro, { type: 'buffer', bookType: 'xlsx' });
	return new File([bytes], 'plantilla.xlsx', {
		type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
	});
}

describe('plantilla de servicios', () => {
	it('arma la hoja de importación y la hoja de parámetros', () => {
		const libro = construirLibroPlantillaServicios(PARAMETROS_SERVICIOS);

		expect(libro.SheetNames).toEqual([HOJA_SERVICIOS_IMPORTAR, HOJA_PARAMETROS_SERVICIOS]);
		const filas = XLSX.utils.sheet_to_json<unknown[]>(libro.Sheets[HOJA_SERVICIOS_IMPORTAR], {
			header: 1,
			defval: ''
		});
		expect(filas[0]).toEqual([...ENCABEZADOS_SERVICIOS]);
		expect(filas).toHaveLength(5);
	});

	it('lee la hoja de importación aunque Parámetros esté primero', async () => {
		const libro = construirLibroPlantillaServicios(PARAMETROS_SERVICIOS);
		const reordenado = XLSX.utils.book_new();
		XLSX.utils.book_append_sheet(
			reordenado,
			libro.Sheets[HOJA_PARAMETROS_SERVICIOS],
			HOJA_PARAMETROS_SERVICIOS
		);
		XLSX.utils.book_append_sheet(
			reordenado,
			libro.Sheets[HOJA_SERVICIOS_IMPORTAR],
			HOJA_SERVICIOS_IMPORTAR
		);

		const filas = await leerServiciosDesdeExcel(archivoDesdeLibro(reordenado));

		expect(filas).toHaveLength(4);
		expect(filas[0]).toMatchObject({
			contacto: 'EJEMPLO 1 - BORRAR ANTES DE IMPORTAR',
			numeracion: '216201450001',
			tipo: 'RUT',
			grupo: 'VARIABLES',
			tipoGestion: 'NORMAL',
			tipoCliente: 'EMPRESA',
			modalidadCobranza: 'TRANSFERENCIA',
			tipoGestionFacturacion: 'NORMAL'
		});
		expect(filas[2].tipo).toBe('CEDULA');
		expect(filas[3]).toMatchObject({ numeracion: null, tipo: null });
	});

	it('cae a la primera hoja en archivos de una sola hoja', async () => {
		const simple = XLSX.utils.book_new();
		const hoja = XLSX.utils.aoa_to_sheet([
			[...ENCABEZADOS_SERVICIOS],
			['SERVICIO UNO', '123', 'RUT', 'VARIABLES', 'NORMAL', 'EMPRESA', 'TRANSFERENCIA', 'NORMAL']
		]);
		XLSX.utils.book_append_sheet(simple, hoja, 'Hoja1');

		const filas = await leerServiciosDesdeExcel(archivoDesdeLibro(simple));

		expect(filas).toHaveLength(1);
		expect(filas[0].contacto).toBe('SERVICIO UNO');
	});
});
