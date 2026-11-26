import { describe, expect, it } from 'vitest';
import { esTelefonoUyNormalizado, formatearTelefonoUy, normalizarTelefonoUy } from './telefonos.ts';

describe('normalizarTelefonoUy', () => {
	it('acepta todas las formas habituales del mismo móvil', () => {
		const esperado = '59899123456';
		for (const entrada of [
			'099123456',
			'099 123 456',
			'99123456',
			'99 123 456',
			'+598 99 123 456',
			'+598 (99) 123-456',
			'00598 99 123 456',
			'59899123456',
			'00598099123456',
			' 099-123-456 '
		]) {
			expect(normalizarTelefonoUy(entrada), entrada).toBe(esperado);
		}
	});

	it('rechaza fijos, números incompletos y otros países', () => {
		for (const entrada of [
			'24001234',
			'+598 2 400 1234',
			'12345678',
			'9912345',
			'991234567',
			'',
			'   ',
			'+57 300 123 4567',
			null,
			undefined
		]) {
			expect(normalizarTelefonoUy(entrada), String(entrada)).toBeNull();
		}
	});
});

describe('formatearTelefonoUy', () => {
	it('presenta el canónico en formato legible', () => {
		expect(formatearTelefonoUy('59899123456')).toBe('+598 99 123 456');
	});

	it('no inventa formato para valores raros', () => {
		expect(formatearTelefonoUy('123')).toBe('123');
		expect(formatearTelefonoUy(null)).toBe('');
	});
});

describe('esTelefonoUyNormalizado', () => {
	it('distingue el canónico del resto', () => {
		expect(esTelefonoUyNormalizado('59899123456')).toBe(true);
		expect(esTelefonoUyNormalizado('099123456')).toBe(false);
		expect(esTelefonoUyNormalizado(null)).toBe(false);
	});
});
