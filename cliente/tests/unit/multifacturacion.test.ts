import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import type { FacturaListado } from '../../src/lib/servicios-datos-api/facturas.ts';
import {
	ENCABEZADOS_MULTIFACTURACION,
	FILAS_EJEMPLO_PLANTILLA,
	HOJA_MULTIFACTURACION,
	construirFilas,
	construirLibroPlantilla
} from '../../src/lib/servicios/multifacturacion.ts';
import { leerPlantillasDesdeExcel } from '../../src/lib/servicios/importacion.ts';

/**
 * La planilla de multifacturación es el archivo que se reimporta: los datos del
 * documento (auxiliares, adenda, serie, número) se repiten en cada línea.
 */

function factura(parcial: Partial<FacturaListado> & { id: number }): FacturaListado {
	return {
		grupoId: 1,
		grupoNombre: 'FIJOS',
		grupoColorFondo: '#3346b8',
		grupoColorTexto: '#ffffff',
		plantillaId: parcial.id,
		periodo: '2026-10',
		contactoFacturacion: 'CONSTRUCTORA EJEMPLO S.A.',
		nombreFantasia: null,
		numeracion: null,
		tipoNumeracion: 'SIN_NUMERACION',
		tipoGestion: 'NORMAL',
		tipoCliente: 'EMPRESA',
		modalidadCobranza: 'TRANSFERENCIA',
		tipoGestionFacturacion: 'NORMAL',
		comentarioGestionFacturacion: null,
		moneda: '$',
		tipoComprobante: 'Venta Crédito',
		tipoPrecio: '30 dias',
		idCliente: null,
		fecha: '2026-10-01',
		estado: 'BANDEJA',
		motivoPendiente: null,
		serie: null,
		numero: null,
		comentarioGeneral: null,
		ordenManual: null,
		idCompra: null,
		detalleAuxiliar: null,
		uteVencimiento: null,
		informacionAdicional: null,
		lineas: [],
		...parcial
	};
}

const linea = (id: number, codigo: string, detalle: string | null) => ({
	id,
	articuloId: id,
	codigo,
	descripcion: `ARTICULO ${codigo}`,
	cantidad: '2.000',
	importeUnitario: '385.59',
	detalle,
	comentario: null
});

describe('construirFilas', () => {
	it('usa los 17 encabezados del modelo', () => {
		expect(ENCABEZADOS_MULTIFACTURACION).toHaveLength(17);
		expect(ENCABEZADOS_MULTIFACTURACION[0]).toBe('Contacto: nombre');
		expect(ENCABEZADOS_MULTIFACTURACION[16]).toBe('Información Adicional');
	});

	it('numera por factura, empezando en 1, y agrupa sus líneas', () => {
		const filas = construirFilas(
			[
				factura({ id: 10, lineas: [linea(1, '1001', 'UNO'), linea(2, '1002', 'DOS')] }),
				factura({ id: 11, lineas: [linea(3, '1003', 'TRES')] })
			],
			{ serie: 'A' }
		);

		expect(filas).toHaveLength(3);
		expect(filas.map((fila) => fila[3])).toEqual([1, 1, 2]);
	});

	it('repite en cada línea los datos del documento', () => {
		const filas = construirFilas(
			[
				factura({
					id: 10,
					comentarioGeneral: 'Adenda {{mes-anio}}',
					idCompra: 'OC-1',
					uteVencimiento: '2026-10-15',
					detalleAuxiliar: 'Detalle del documento',
					informacionAdicional: 'Info extra',
					idCliente: 2000065,
					lineas: [linea(1, '1001', 'UNO'), linea(2, '1002', 'DOS')]
				})
			],
			{ serie: 'B' }
		);

		expect(filas).toHaveLength(2);
		for (const fila of filas) {
			expect(fila[0]).toBe('CONSTRUCTORA EJEMPLO S.A.');
			expect(fila[1]).toBe('01/10/2026');
			expect(fila[2]).toBe('B');
			expect(fila[11]).toBe('Adenda {{mes-anio}}');
			expect(fila[12]).toBe(2000065);
			expect(fila[13]).toBe('OC-1');
			expect(fila[14]).toBe('15/10/2026');
			expect(fila[15]).toBe('Detalle del documento');
			expect(fila[16]).toBe('Info extra');
		}
	});

	it('usa el detalle de la línea y cae a la descripción del artículo', () => {
		const filas = construirFilas(
			[
				factura({
					id: 10,
					lineas: [linea(1, '1001', 'HORAS DIURNAS'), linea(2, '1002', null)]
				})
			],
			{ serie: 'A' }
		);

		expect(filas[0][8]).toBe('HORAS DIURNAS');
		expect(filas[1][8]).toBe('ARTICULO 1002');
	});

	it('escribe cantidades e importes como números', () => {
		const filas = construirFilas([factura({ id: 10, lineas: [linea(1, '1001', 'X')] })], {
			serie: 'A'
		});

		expect(filas[0][9]).toBe(2);
		expect(filas[0][10]).toBe(385.59);
	});
});

describe('plantilla de importación', () => {
	it('trae los 17 encabezados y cuatro filas de ejemplo', () => {
		const libro = construirLibroPlantilla();
		const hoja = libro.Sheets[HOJA_MULTIFACTURACION];
		expect(hoja).toBeDefined();

		const filas = XLSX.utils.sheet_to_json<unknown[]>(hoja, { header: 1, defval: '' });
		expect(filas[0]).toEqual([...ENCABEZADOS_MULTIFACTURACION]);
		expect(FILAS_EJEMPLO_PLANTILLA).toHaveLength(4);
		expect(filas).toHaveLength(5);
		// Tres facturas: la primera con dos líneas.
		expect(filas.slice(1).map((fila) => fila[3])).toEqual([1, 1, 2, 3]);
	});

	it('se puede volver a leer con el importador de planillas', async () => {
		const contenido = XLSX.write(construirLibroPlantilla(), {
			bookType: 'xlsx',
			type: 'array'
		}) as ArrayBuffer;
		const archivo = new Blob([contenido], {
			type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
		}) as unknown as File;

		const filas = await leerPlantillasDesdeExcel(archivo);

		expect(filas).toHaveLength(4);
		expect(filas.map((fila) => fila.agrupador)).toEqual(['1', '1', '2', '3']);
		expect(filas[0].contacto).toBe('CONTACTO DE EJEMPLO S.A.');
		expect(filas[0].fecha).toBe('2026-12-01');
		expect(filas[0].detalle).toBe('SERVICIO DE EJEMPLO');
		expect(filas[0].cantidad).toBe(2);
		expect(filas[0].importeUnitario).toBeCloseTo(385.59, 2);
		expect(filas[3].idCliente).toBe('2000065');
		expect(filas[3].idCompra).toBe('OC-123');
		expect(filas[3].vencimiento).toBe('2026-12-15');
		expect(filas[3].informacionAdicional).toBe('Información adicional de la factura');
	});
});
