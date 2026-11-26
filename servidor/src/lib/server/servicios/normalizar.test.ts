import { describe, expect, it } from 'vitest';
import { normalizarOpcional, normalizarTexto, serialExcelAFecha } from './normalizar.ts';

/**
 * La importación relaciona los valores del Excel con los catálogos por nombre
 * normalizado. Si esto cambia, los catálogos dejan de resolverse y se duplican.
 */
describe('normalizarTexto', () => {
	it('ignora mayúsculas, acentos y espacios extra', () => {
		expect(normalizarTexto('  transferencia ')).toBe('TRANSFERENCIA');
		expect(normalizarTexto('Transferência')).toBe('TRANSFERENCIA');
		expect(normalizarTexto('Venta   Crédito')).toBe('VENTA CREDITO');
	});

	it('devuelve undefined cuando el valor viene vacío', () => {
		expect(normalizarOpcional('   ')).toBeUndefined();
		expect(normalizarOpcional(null)).toBeUndefined();
		expect(normalizarOpcional(' normal ')).toBe('NORMAL');
	});
});

describe('serialExcelAFecha', () => {
	it('convierte el serial de Excel a fecha ISO', () => {
		expect(serialExcelAFecha(46174)).toBe('2026-06-01');
	});

	it('descarta valores inválidos', () => {
		expect(serialExcelAFecha(0)).toBeUndefined();
		expect(serialExcelAFecha(Number.NaN)).toBeUndefined();
	});
});
