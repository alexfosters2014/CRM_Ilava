import { describe, expect, it } from 'vitest';
import { formatearNumero } from '#lib/servicios/numeros.ts';

describe('formatearNumero', () => {
	it('mantiene hasta 3 decimales y completa a dos cuando hay una sola', () => {
		expect(formatearNumero(25.3)).toBe('25,30');
		expect(formatearNumero(30.4)).toBe('30,40');
		expect(formatearNumero(1.2)).toBe('1,20');
		expect(formatearNumero(1.234)).toBe('1,234');
	});

	it('no muestra decimales cuando el número es entero', () => {
		expect(formatearNumero(10)).toBe('10');
		expect(formatearNumero('10.00')).toBe('10');
	});

	it('agrupa miles y redondea a 3 decimales', () => {
		expect(formatearNumero(17383.5)).toBe('17.383,50');
		expect(formatearNumero('17.3835')).toBe('17,384');
	});

	it('devuelve el texto original cuando no es numérico', () => {
		expect(formatearNumero('abc')).toBe('abc');
	});
});
