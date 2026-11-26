import { describe, expect, it } from 'vitest';
import {
	detectarDuplicadosEnArchivo,
	faltantesCatalogosPlantillas,
	faltantesCatalogosServicios,
	normalizarNumeracion,
	validarFilasServicios
} from './importaciones.ts';

/**
 * Reglas puras de las importaciones: catálogos validados (sin auto-crear),
 * servicios sin duplicados y numeración con su tipo.
 */
describe('normalizarNumeracion', () => {
	it('fuerza SIN_NUMERACION cuando no hay numeración, ignorando el tipo', () => {
		expect(normalizarNumeracion('', 'RUT')).toEqual({
			numeracion: null,
			tipo: 'SIN_NUMERACION',
			error: null
		});
	});

	it('acepta RUT, CEDULA y OTROS en cualquier caja', () => {
		expect(normalizarNumeracion('216201790265', 'rut')).toMatchObject({
			numeracion: '216201790265',
			tipo: 'RUT'
		});
		expect(normalizarNumeracion('43631856', 'CEDULA')).toMatchObject({ tipo: 'CEDULA' });
	});

	it('exige el tipo cuando hay numeración', () => {
		expect(normalizarNumeracion('123', '').error).toContain('sin TIPO');
	});

	it('rechaza tipos desconocidos', () => {
		expect(normalizarNumeracion('123', 'DNI').error).toContain('TIPO desconocido');
	});
});

describe('validarFilasServicios', () => {
	it('informa la fila del error de numeración', () => {
		const errores = validarFilasServicios([
			{ contacto: 'A', numeracion: '1', tipo: '' },
			{ contacto: 'B', numeracion: '2', tipo: 'RUT' }
		]);
		expect(errores).toHaveLength(1);
		expect(errores[0].fila).toBe(1);
	});
});

describe('detectarDuplicadosEnArchivo', () => {
	it('detecta contactos repetidos sin distinguir caja ni acentos', () => {
		expect(
			detectarDuplicadosEnArchivo([
				{ contacto: 'EMPRESA EJEMPLO S.A.' },
				{ contacto: ' empresa ejemplo s.a. ' },
				{ contacto: 'OTRO' }
			])
		).toEqual(['EMPRESA EJEMPLO S.A.']);
	});
});

describe('faltantesCatalogosServicios', () => {
	const disponibles = {
		gestion: new Set(['NORMAL']),
		cliente: new Set(['EMPRESA']),
		cobranza: new Set(['TRANSFERENCIA']),
		gestionFacturacion: new Set(['NORMAL']),
		grupo: new Set(['FIJOS'])
	};

	it('no reporta nada cuando todos los valores existen', () => {
		const faltantes = faltantesCatalogosServicios(
			[{ contacto: 'A', tipoGestion: 'NORMAL', tipoCliente: 'EMPRESA', modalidadCobranza: 'TRANSFERENCIA', grupo: 'FIJOS', tipoGestionFacturacion: 'NORMAL' }],
			disponibles
		);
		expect(faltantes).toEqual({});
	});

	it('lista los valores que no están en el catálogo', () => {
		const faltantes = faltantesCatalogosServicios(
			[{ contacto: 'A', tipoGestion: 'LEGAL', tipoCliente: 'EMPRESA', modalidadCobranza: '', grupo: 'FIJOS', tipoGestionFacturacion: 'OC_MENSUAL' }],
			disponibles
		);
		expect(faltantes.TIPO_GESTION).toEqual(['LEGAL']);
		expect(faltantes.MODALIDAD_COBRANZA).toEqual(['(vacío)']);
		expect(faltantes.GESTION_FACTURACION).toEqual(['OC_MENSUAL']);
	});
});

describe('faltantesCatalogosPlantillas', () => {
	const disponibles = {
		moneda: new Set(['$']),
		comprobante: new Set(['Venta Crédito']),
		precio: new Set(['30 dias']),
		articulo: new Set(['1001'])
	};

	it('lista valores faltantes de moneda y artículo', () => {
		const faltantes = faltantesCatalogosPlantillas(
			[{ moneda: 'EUR', tipoComprobante: 'Venta Crédito', tipoPrecio: '30 dias', articuloCodigo: '9999' }],
			disponibles
		);
		expect(faltantes.MONEDA).toEqual(['EUR']);
		expect(faltantes.ARTICULO).toEqual(['9999']);
	});
});
