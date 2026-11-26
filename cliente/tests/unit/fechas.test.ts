import { describe, expect, it } from 'vitest';
import { formatearFecha, formatearFechaHora, hoyIso, nombrePeriodo, parsearFecha } from '../../src/lib/servicios/fechas.ts';

/**
 * La base y la API usan ISO; la pantalla usa dd/mm/aaaa. Estas funciones hacen
 * la traducción y validan que la fecha exista de verdad.
 */
describe('formatearFecha', () => {
	it('convierte ISO a dd/mm/aaaa', () => {
		expect(formatearFecha('2026-10-31')).toBe('31/10/2026');
	});

	it('devuelve vacío cuando no hay fecha', () => {
		expect(formatearFecha(null)).toBe('');
		expect(formatearFecha(undefined)).toBe('');
	});
});

describe('formatearFechaHora', () => {
	it('convierte un timestamp a hora de Uruguay (UTC-3)', () => {
		// 02:30 UTC del 31/10 es 23:30 del 30/10 en Montevideo.
		expect(formatearFechaHora('2026-10-31T02:30:00Z')).toBe('30/10/2026 23:30');
	});

	it('devuelve vacío con un valor inválido', () => {
		expect(formatearFechaHora('no-es-fecha')).toBe('');
	});
});

describe('hoyIso', () => {
	it('devuelve la fecha de Uruguay en ISO', () => {
		expect(hoyIso()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
	});
});

describe('parsearFecha', () => {
	it('interpreta dd/mm/aaaa', () => {
		expect(parsearFecha('31/10/2026')).toEqual({ iso: '2026-10-31', error: null });
	});

	it('acepta un dígito por componente y separadores con guion', () => {
		expect(parsearFecha('3/9/2026')).toEqual({ iso: '2026-09-03', error: null });
		expect(parsearFecha('03-09-2026')).toEqual({ iso: '2026-09-03', error: null });
	});

	it('devuelve vacío sin error cuando el campo está vacío', () => {
		expect(parsearFecha('   ')).toEqual({ iso: null, error: null });
	});

	it('rechaza fechas que no existen', () => {
		expect(parsearFecha('31/09/2026').iso).toBeNull();
		expect(parsearFecha('31/09/2026').error).toContain('no existe');
		expect(parsearFecha('30/02/2026').iso).toBeNull();
	});

	it('rechaza formatos desconocidos', () => {
		expect(parsearFecha('2026-10-31').error).toBe('Usá el formato dd/mm/aaaa');
		expect(parsearFecha('31/10').error).toBe('Usá el formato dd/mm/aaaa');
	});
});

describe('nombrePeriodo', () => {
	it('convierte YYYY-MM en mes y año', () => {
		expect(nombrePeriodo('2026-11')).toBe('Noviembre 2026');
		expect(nombrePeriodo('2026-01')).toBe('Enero 2026');
		expect(nombrePeriodo('2025-12')).toBe('Diciembre 2025');
	});

	it('devuelve el valor original si el formato no es YYYY-MM', () => {
		expect(nombrePeriodo('2026-13')).toBe('2026-13');
		expect(nombrePeriodo('')).toBe('');
		expect(nombrePeriodo(null)).toBe('');
	});
});
